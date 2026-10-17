import type { BtwMode, BtwQuestion } from "../shared/contracts";
import { loadState, saveState, type PersistedState } from "./persist";

export interface QuestionEntry extends BtwQuestion {
  requestedModel: string | null;
  tempAgentId: string | null;
  threadTarget: string | null;
}

export interface ThreadState {
  id: string;
  agentId: string;
  provider: string;
  model: string;
  mode: BtwMode;
  firstQuestion: string;
  busy: boolean;
  archiveTimer: ReturnType<typeof setTimeout> | null;
}

const MAX_QUESTIONS_PER_AGENT = 50;
const SAVE_DEBOUNCE_MS = 300;

const questions = new Map<string, QuestionEntry>();
const questionsByAgent = new Map<string, string[]>();
const order: string[] = [];
const threads = new Map<string, ThreadState>();

function threadKey(agentId: string, mode: BtwMode): string {
  return `${agentId}::${mode}`;
}

let seq = 0;
let loadedPromise: Promise<void> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

/** Restores persisted history once per process; handlers await this. */
export function ensureLoaded(): Promise<void> {
  loadedPromise ??= (async () => {
    const state = await loadState();
    if (!state) return;
    for (const q of state.questions) {
      const entry: QuestionEntry = {
        id: q.id,
        agentId: q.agentId,
        threadId: q.threadId,
        mode: q.mode === "work" ? "work" : "advice",
        question: q.question,
        // the process that owned these turns is gone
        status: q.status === "done" ? "done" : "error",
        answer: q.answer,
        error:
          q.status === "pending" || q.status === "running"
            ? "回答随插件重载中断，可重新提问"
            : q.error,
        model: q.model,
        startedAt: q.startedAt,
        finishedAt: q.finishedAt,
        elapsedMs: q.elapsedMs,
        requestedModel: q.requestedModel,
        tempAgentId: q.tempAgentId,
        threadTarget: q.threadTarget ?? null,
      };
      if (questions.has(entry.id)) continue;
      questions.set(entry.id, entry);
      order.push(entry.id);
      const ids = questionsByAgent.get(entry.agentId) ?? [];
      ids.push(entry.id);
      questionsByAgent.set(entry.agentId, ids);
    }
    for (const t of state.threads) {
      if (threads.has(t.agentId)) continue;
      const mode: BtwMode = t.mode === "work" ? "work" : "advice";
      threads.set(threadKey(t.agentId, mode), {
        id: t.id,
        agentId: t.agentId,
        provider: t.provider,
        model: t.model,
        mode,
        firstQuestion: t.firstQuestion,
        busy: false,
        archiveTimer: null,
      });
    }
    seq = order.length;
    console.log(
      `[btw] restored ${state.questions.length} questions, ${state.threads.length} open threads`,
    );
  })();
  return loadedPromise;
}

function persistSnapshot(): PersistedState {
  return {
    version: 1,
    questions: order
      .map((id) => questions.get(id))
      .filter((entry): entry is QuestionEntry => Boolean(entry))
      .map((entry) => ({
        id: entry.id,
        agentId: entry.agentId,
        threadId: entry.threadId,
        mode: entry.mode,
        question: entry.question,
        status: entry.status,
        answer: entry.answer,
        error: entry.error,
        model: entry.model,
        startedAt: entry.startedAt,
        finishedAt: entry.finishedAt,
        elapsedMs: entry.elapsedMs,
        requestedModel: entry.requestedModel,
        tempAgentId: entry.tempAgentId,
        threadTarget: entry.threadTarget,
      })),
    threads: [...threads.values()].map((thread) => ({
      id: thread.id,
      agentId: thread.agentId,
      provider: thread.provider,
      model: thread.model,
      mode: thread.mode,
      firstQuestion: thread.firstQuestion,
    })),
  };
}

/** Debounced flush of in-memory state to disk. */
export function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void saveState(persistSnapshot());
  }, SAVE_DEBOUNCE_MS);
}

export function flushSave(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  return saveState(persistSnapshot());
}

export function addQuestion(
  agentId: string,
  question: string,
  requestedModel: string | null,
  mode: BtwMode,
  threadTarget: string | null,
): QuestionEntry {
  seq += 1;
  const entry: QuestionEntry = {
    id: `btw_${Date.now().toString(36)}_${seq.toString(36)}`,
    agentId,
    threadId: null,
    mode,
    question,
    status: "pending",
    answer: "",
    error: null,
    model: requestedModel,
    startedAt: Date.now(),
    finishedAt: null,
    elapsedMs: null,
    requestedModel,
    tempAgentId: null,
    threadTarget,
  };
  questions.set(entry.id, entry);
  order.push(entry.id);
  const ids = questionsByAgent.get(agentId) ?? [];
  ids.push(entry.id);
  questionsByAgent.set(agentId, ids);
  scheduleSave();
  trim();
  return entry;
}

function trim(): void {
  while (order.length > 0) {
    const oldestId = order[0];
    const oldest = questions.get(oldestId);
    if (!oldest) {
      order.shift();
      continue;
    }
    if (oldest.status === "running" || oldest.status === "pending") break;
    if (order.length <= MAX_QUESTIONS_PER_AGENT) break;
    questions.delete(oldestId);
    order.shift();
    const ids = questionsByAgent.get(oldest.agentId);
    if (ids) {
      const at = ids.indexOf(oldestId);
      if (at >= 0) ids.splice(at, 1);
    }
  }
}

export function listQuestionsForAgent(agentId: string): QuestionEntry[] {
  const ids = questionsByAgent.get(agentId) ?? [];
  const entries: QuestionEntry[] = [];
  for (const id of ids) {
    const entry = questions.get(id);
    if (entry) entries.push(entry);
  }
  return entries;
}

/** Removes one thread's finished questions and returns the count. */
export function clearThreadQuestions(agentId: string, threadId: string): number {
  const ids = questionsByAgent.get(agentId);
  if (!ids) return 0;
  let cleared = 0;
  for (const id of [...ids]) {
    const entry = questions.get(id);
    if (!entry || entry.threadId !== threadId) continue;
    if (entry.status === "running" || entry.status === "pending") continue;
    questions.delete(id);
    ids.splice(ids.indexOf(id), 1);
    const at = order.indexOf(id);
    if (at >= 0) order.splice(at, 1);
    cleared += 1;
  }
  scheduleSave();
  return cleared;
}

export function clearQuestions(agentId: string): number {
  const ids = questionsByAgent.get(agentId);
  if (!ids) return 0;
  let cleared = 0;
  for (const id of [...ids]) {
    const entry = questions.get(id);
    if (!entry) continue;
    if (entry.status === "running" || entry.status === "pending") continue;
    questions.delete(id);
    ids.splice(ids.indexOf(id), 1);
    const at = order.indexOf(id);
    if (at >= 0) order.splice(at, 1);
    cleared += 1;
  }
  scheduleSave();
  return cleared;
}

export function runningCount(): number {
  let count = 0;
  for (const entry of questions.values()) {
    if (entry.status === "running" || entry.status === "pending") count += 1;
  }
  return count;
}

export function getThread(agentId: string, mode: BtwMode): ThreadState | undefined {
  return threads.get(threadKey(agentId, mode));
}

export function getThreadById(agentId: string, threadId: string): ThreadState | undefined {
  for (const thread of threads.values()) {
    if (thread.agentId === agentId && thread.id === threadId) return thread;
  }
  return undefined;
}

export function setThread(thread: ThreadState): void {
  threads.set(threadKey(thread.agentId, thread.mode), thread);
  scheduleSave();
}

/** Closes one thread lane and returns its temp agent id for archiving. */
export function closeThread(agentId: string, mode: BtwMode): string | null {
  const key = threadKey(agentId, mode);
  const thread = threads.get(key);
  if (!thread) return null;
  if (thread.archiveTimer) clearTimeout(thread.archiveTimer);
  threads.delete(key);
  scheduleSave();
  return thread.id;
}

/** Closes every lane of an agent; returns the temp agent ids for archiving. */
export function closeAllThreads(agentId: string): string[] {
  const ids: string[] = [];
  for (const mode of ["advice", "work"] as BtwMode[]) {
    const id = closeThread(agentId, mode);
    if (id) ids.push(id);
  }
  return ids;
}

export function listOpenThreads(
  agentId: string,
): Array<{ id: string; mode: BtwMode; model: string | null; firstQuestion: string }> {
  return [...threads.values()]
    .filter((thread) => thread.agentId === agentId)
    .map((thread) => ({
      id: thread.id,
      mode: thread.mode,
      model: thread.model || null,
      firstQuestion: thread.firstQuestion,
    }));
}

export function openThreadAgentIds(): string[] {
  return [...threads.values()].map((thread) => thread.id);
}

export function runningTempAgentIds(): string[] {
  const ids: string[] = [];
  for (const entry of questions.values()) {
    if ((entry.status === "running" || entry.status === "pending") && entry.tempAgentId) {
      ids.push(entry.tempAgentId);
    }
  }
  return ids;
}

export function knownThreadIds(): Set<string> {
  // the reaper matches against temp agent ids, not the composite map keys
  return new Set([...threads.values()].map((thread) => thread.id));
}

export function clearAllIdleTimers(): void {
  for (const thread of threads.values()) {
    if (thread.archiveTimer) {
      clearTimeout(thread.archiveTimer);
      thread.archiveTimer = null;
    }
  }
}
