import type { BtwMode, BtwQuestion } from "../shared/contracts";
import { loadState, saveState, type PersistedState } from "./persist";

export interface QuestionEntry extends BtwQuestion {
  requestedModel: string | null;
  tempAgentId: string | null;
}

export interface ThreadState {
  id: string;
  agentId: string;
  provider: string;
  model: string;
  mode: BtwMode;
  busy: boolean;
  archiveTimer: ReturnType<typeof setTimeout> | null;
}

const MAX_QUESTIONS_PER_AGENT = 50;
const SAVE_DEBOUNCE_MS = 300;

const questions = new Map<string, QuestionEntry>();
const questionsByAgent = new Map<string, string[]>();
const order: string[] = [];
const threads = new Map<string, ThreadState>();

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
      threads.set(t.agentId, {
        id: t.id,
        agentId: t.agentId,
        provider: t.provider,
        model: t.model,
        mode: t.mode === "work" ? "work" : "advice",
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
      })),
    threads: [...threads.values()].map((thread) => ({
      id: thread.id,
      agentId: thread.agentId,
      provider: thread.provider,
      model: thread.model,
      mode: thread.mode,
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

export function getThread(agentId: string): ThreadState | undefined {
  return threads.get(agentId);
}

export function setThread(thread: ThreadState): void {
  threads.set(thread.agentId, thread);
  scheduleSave();
}

/** Closes the thread for an agent and returns its temp agent id for archiving. */
export function closeThread(agentId: string): string | null {
  const thread = threads.get(agentId);
  if (!thread) return null;
  if (thread.archiveTimer) clearTimeout(thread.archiveTimer);
  threads.delete(agentId);
  scheduleSave();
  return thread.id;
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
  return new Set(threads.keys());
}

export function clearAllIdleTimers(): void {
  for (const thread of threads.values()) {
    if (thread.archiveTimer) {
      clearTimeout(thread.archiveTimer);
      thread.archiveTimer = null;
    }
  }
}
