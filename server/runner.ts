import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import type { QuestionEntry, ThreadState } from "./store";
import {
  closeThread,
  getThread,
  getThreadById,
  knownThreadIds,
  scheduleSave,
  setThread,
} from "./store";
import { buildContext, buildPrompt } from "./context";

type PaseoApi = PluginHandlerContext["paseo"];
type AgentHandle = ReturnType<PaseoApi["agents"]["ref"]>;
type TurnResult = Awaited<ReturnType<AgentHandle["waitForFinish"]>>;

const ANSWER_TIMEOUT_MS = 4 * 60_000;
const ANSWER_POLL_MS = 1000;
const TITLE_MAX = 60;
const DEFAULT_SETTINGS = {
  autoArchive: false,
  idleMinutes: 10,
  contextMessages: 8,
  attachToMain: true,
};

let boundPaseo: PaseoApi | null = null;
let reaped = false;
let activeSettings: {
  autoArchive: boolean;
  idleMinutes: number;
  contextMessages: number;
  attachToMain: boolean;
} = DEFAULT_SETTINGS;

export function applySettings(values: {
  autoArchive: boolean;
  idleMinutes: number;
  contextMessages: number;
  attachToMain: boolean;
}): void {
  activeSettings = values;
}

export function isAttachToMain(): boolean {
  return activeSettings.attachToMain;
}

export function boundApi(): PaseoApi | null {
  return boundPaseo;
}

function truncateQuestion(question: string): string {
  const oneLine = question.replace(/\s+/g, " ").trim();
  return oneLine.length <= TITLE_MAX ? oneLine : `${oneLine.slice(0, TITLE_MAX)}…`;
}

async function pollAnswer(handle: AgentHandle, entry: QuestionEntry): Promise<void> {
  try {
    const page = await handle.timeline.refetch({ direction: "tail", limit: 40 });
    const texts: string[] = [];
    let collecting = false;
    for (const timelineEntry of page.entries) {
      if (timelineEntry.item.type === "user_message") {
        // restart at every user message: only text after the latest one belongs to this turn
        collecting = true;
        texts.length = 0;
        continue;
      }
      if (collecting && timelineEntry.item.type === "assistant_message") {
        texts.push(timelineEntry.item.text);
      }
    }
    entry.answer = texts.join("\n\n");
  } catch {
    // transient refetch failures are fine; the next tick retries
  }
}

async function pickPlanMode(paseo: PaseoApi, provider: string): Promise<string | undefined> {
  try {
    const result = await paseo.providers.listModes(provider);
    const modes = result.modes ?? [];
    const plan = modes.find(
      (mode) => /plan|read/i.test(mode.id) || /plan|read/i.test(mode.label),
    );
    return plan?.id;
  } catch {
    return undefined;
  }
}

async function archiveTemp(paseo: PaseoApi, tempId: string): Promise<void> {
  try {
    await paseo.agents.ref(tempId).archive();
    console.log(`[btw] temp agent ${tempId} archived`);
  } catch (error) {
    console.error("[btw] failed to archive temp agent", tempId, error);
  }
}

/** Archives leftover [btw] temp agents from a previous run that no known thread claims. */
async function reapStaleThreads(paseo: PaseoApi): Promise<void> {
  try {
    const known = knownThreadIds();
    const listing = await paseo.agents.list();
    for (const entry of listing.entries) {
      const labels = entry.agent.labels as Record<string, string> | undefined;
      if (labels?.btw === "side-question" && !known.has(entry.agent.id)) {
        await archiveTemp(paseo, entry.agent.id);
      }
    }
  } catch (error) {
    console.error("[btw] stale thread reaper failed", error);
  }
}

/** Runs the leftover sweep once per process; safe to call from any handler. */
export function reapOnce(paseo: PaseoApi): void {
  if (reaped) return;
  reaped = true;
  void reapStaleThreads(paseo);
}

export function startQuestion(entry: QuestionEntry, paseo: PaseoApi): void {
  boundPaseo = paseo;
  void runQuestion(entry, paseo).catch((error) => {
    console.error("[btw] question runner crashed", entry.id, error);
    entry.status = "error";
    entry.error = error instanceof Error ? error.message : String(error);
    entry.finishedAt = Date.now();
    entry.elapsedMs = entry.finishedAt - entry.startedAt;
  });
}

async function runQuestion(entry: QuestionEntry, paseo: PaseoApi): Promise<void> {
  entry.status = "running";
  try {
    const mainRef = await paseo.agents.ref(entry.agentId).refresh();
    if (!mainRef) {
      throw new Error("主会话不存在或已不可用");
    }
    const main = mainRef.agent;
    if (!main.workspaceId) {
      throw new Error("主会话没有所属 workspace，无法创建旁路会话");
    }
    const provider = main.provider;
    const model = entry.requestedModel ?? main.model ?? "";
    entry.model = model || null;

    if (entry.threadTarget) {
      const thread = getThreadById(entry.agentId, entry.threadTarget);
      if (!thread) {
        throw new Error("目标会话已结束，请取消回复锁定或重新提问");
      }
      if (thread.busy) {
        throw new Error("目标会话正在回答中，请稍候");
      }
      entry.mode = thread.mode;
      entry.model = thread.model || null;
      await continueThread(paseo, thread, entry);
    } else {
      const existing = getThread(entry.agentId, entry.mode);
      const reusable =
        existing &&
        !existing.busy &&
        existing.provider === provider &&
        existing.model === (model || "");
      if (reusable && existing) {
        await continueThread(paseo, existing, entry);
      } else {
        if (existing) {
          closeThread(entry.agentId, entry.mode);
          await archiveTemp(paseo, existing.id);
        }
        await startThread(paseo, main.workspaceId, provider, model, main.currentModeId ?? null, entry);
      }
    }
  } catch (error) {
    entry.status = "error";
    entry.error = error instanceof Error ? error.message : String(error);
    const thread = entry.agentId ? getThread(entry.agentId, entry.mode) : undefined;
    if (thread && thread.id === entry.threadId) {
      closeThread(entry.agentId, entry.mode);
      await archiveTemp(paseo, thread.id);
    } else if (entry.tempAgentId) {
      await archiveTemp(paseo, entry.tempAgentId);
    }
  } finally {
    entry.finishedAt = Date.now();
    entry.elapsedMs = entry.finishedAt - entry.startedAt;
    scheduleSave();
  }
}

/** Follow-up: the thread's temp agent keeps its own Q&A history, so just send the new question. */
async function continueThread(paseo: PaseoApi, thread: ThreadState, entry: QuestionEntry): Promise<void> {
  thread.busy = true;
  if (thread.archiveTimer) {
    clearTimeout(thread.archiveTimer);
    thread.archiveTimer = null;
  }
  entry.threadId = thread.id;
  entry.tempAgentId = thread.id;
  const handle = paseo.agents.ref(thread.id);
  try {
    console.log(`[btw] follow-up ${entry.id} in thread ${thread.id}`);
    await settleTurn(handle.run(entry.question, { timeoutMs: ANSWER_TIMEOUT_MS }), handle, entry);
  } catch (error) {
    // the temp agent may be gone (archived by user, closed with daemon, ...)
    entry.status = "error";
    entry.error = error instanceof Error ? error.message : String(error);
    closeThread(thread.agentId, thread.mode);
    await archiveTemp(paseo, thread.id);
  } finally {
    thread.busy = false;
    scheduleSave();
  }
  if (entry.status === "error") {
    return;
  }
  scheduleIdleArchive(thread, paseo);
}

async function startThread(
  paseo: PaseoApi,
  workspaceId: string,
  provider: string,
  model: string,
  mainModeId: string | null,
  entry: QuestionEntry,
): Promise<void> {
  const work = entry.mode === "work";
  const context = await buildContext(paseo, entry.agentId, activeSettings.contextMessages);
  const prompt = buildPrompt(context, entry.question, entry.mode);
  const modeId = work ? mainModeId ?? undefined : await pickPlanMode(paseo, provider);
  const prefix = work ? "[btw·干活]" : "[btw]";

  const handle = await paseo.workspaces.ref(workspaceId).agents.create({
    config: {
      provider: model ? `${provider}/${model}` : provider,
      ...(modeId ? { modeId } : {}),
    },
    title: `${prefix} ${truncateQuestion(entry.question)}`,
    prompt,
    labels: { btw: "side-question" },
    ...(activeSettings.attachToMain ? { parent: entry.agentId } : {}),
  });
  entry.tempAgentId = handle.id;
  entry.threadId = handle.id;

  const thread: ThreadState = {
    id: handle.id,
    agentId: entry.agentId,
    provider,
    model: model || "",
    mode: entry.mode,
    firstQuestion: entry.question,
    busy: true,
    archiveTimer: null,
  };
  setThread(thread);
  console.log(`[btw] ${work ? "work" : "advice"} thread ${handle.id} created for question ${entry.id}`);

  try {
    await settleTurn(handle.waitForFinish(ANSWER_TIMEOUT_MS), handle, entry);
  } finally {
    thread.busy = false;
    scheduleSave();
  }
  if (entry.status === "error") {
    closeThread(entry.agentId, entry.mode);
    await archiveTemp(paseo, handle.id);
    return;
  }
  scheduleIdleArchive(thread, paseo);
}

async function settleTurn(turn: Promise<TurnResult>, handle: AgentHandle, entry: QuestionEntry): Promise<void> {
  const pollTimer = setInterval(() => {
    void pollAnswer(handle, entry);
  }, ANSWER_POLL_MS);
  let result: TurnResult;
  try {
    result = await turn;
  } finally {
    clearInterval(pollTimer);
  }
  if (result.status === "idle") {
    if (result.lastMessage && result.lastMessage.trim().length > 0) {
      entry.answer = result.lastMessage;
    }
    entry.status = "done";
  } else if (result.status === "permission") {
    entry.status = "error";
    entry.error =
      entry.mode === "work"
        ? "旁路会话在等待权限确认，请在 Paseo 中找到该会话处理权限请求后重试"
        : "旁路会话在等待权限确认（它被要求不使用工具），已放弃";
  } else if (result.status === "timeout") {
    entry.status = "error";
    entry.error = "回答超时";
  } else {
    entry.status = "error";
    entry.error = result.error ?? `旁路会话异常结束（${result.status}）`;
  }
  scheduleSave();
}

function scheduleIdleArchive(thread: ThreadState, paseo: PaseoApi): void {
  if (!activeSettings.autoArchive) return;
  const delayMs = activeSettings.idleMinutes * 60_000;
  if (thread.archiveTimer) clearTimeout(thread.archiveTimer);
  thread.archiveTimer = setTimeout(() => {
    thread.archiveTimer = null;
    const current = getThread(thread.agentId, thread.mode);
    if (current && current.id === thread.id && !current.busy) {
      closeThread(thread.agentId, thread.mode);
      void archiveTemp(paseo, thread.id);
      console.log(`[btw] thread ${thread.id} archived after ${activeSettings.idleMinutes}m idle`);
    }
  }, delayMs);
}
