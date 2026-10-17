import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import type { QuestionEntry, ThreadState } from "./store";
import { closeThread, getThread, setThread } from "./store";
import { buildContext, buildPrompt } from "./context";

type PaseoApi = PluginHandlerContext["paseo"];
type AgentHandle = ReturnType<PaseoApi["agents"]["ref"]>;
type TurnResult = Awaited<ReturnType<AgentHandle["waitForFinish"]>>;

const ANSWER_TIMEOUT_MS = 4 * 60_000;
const ANSWER_POLL_MS = 1000;
const TITLE_MAX = 60;
const DEFAULT_SETTINGS = { autoArchive: false, idleMinutes: 10 };

let boundPaseo: PaseoApi | null = null;
let reaped = false;
let activeSettings: { autoArchive: boolean; idleMinutes: number } = DEFAULT_SETTINGS;

export function applySettings(values: { autoArchive: boolean; idleMinutes: number }): void {
  activeSettings = values;
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

/** Archives leftover [btw] temp agents from a previous plugin run (crash/reload). */
async function reapStaleThreads(paseo: PaseoApi): Promise<void> {
  try {
    const listing = await paseo.agents.list();
    for (const entry of listing.entries) {
      const labels = entry.agent.labels as Record<string, string> | undefined;
      if (labels?.btw === "side-question") {
        await archiveTemp(paseo, entry.agent.id);
      }
    }
  } catch (error) {
    console.error("[btw] stale thread reaper failed", error);
  }
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
    if (!reaped) {
      reaped = true;
      await reapStaleThreads(paseo);
    }

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

    const existing = getThread(entry.agentId);
    if (existing && !existing.busy && existing.provider === provider && existing.model === (model || "")) {
      await continueThread(paseo, existing, entry);
    } else {
      if (existing) {
        closeThread(entry.agentId);
        await archiveTemp(paseo, existing.id);
      }
      await startThread(paseo, main.workspaceId, provider, model, entry);
    }
  } catch (error) {
    entry.status = "error";
    entry.error = error instanceof Error ? error.message : String(error);
    const thread = entry.agentId ? getThread(entry.agentId) : undefined;
    if (thread && thread.id === entry.threadId) {
      closeThread(entry.agentId);
      await archiveTemp(paseo, thread.id);
    } else if (entry.tempAgentId) {
      await archiveTemp(paseo, entry.tempAgentId);
    }
  } finally {
    entry.finishedAt = Date.now();
    entry.elapsedMs = entry.finishedAt - entry.startedAt;
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
  } finally {
    thread.busy = false;
  }
  if (entry.status === "error") {
    closeThread(thread.agentId);
    await archiveTemp(paseo, thread.id);
    return;
  }
  scheduleIdleArchive(thread, paseo);
}

async function startThread(
  paseo: PaseoApi,
  workspaceId: string,
  provider: string,
  model: string,
  entry: QuestionEntry,
): Promise<void> {
  const context = await buildContext(paseo, entry.agentId);
  const prompt = buildPrompt(context, entry.question);
  const modeId = await pickPlanMode(paseo, provider);

  const handle = await paseo.workspaces.ref(workspaceId).agents.create({
    config: {
      provider: model ? `${provider}/${model}` : provider,
      ...(modeId ? { modeId } : {}),
    },
    title: `[btw] ${truncateQuestion(entry.question)}`,
    prompt,
    labels: { btw: "side-question" },
  });
  entry.tempAgentId = handle.id;
  entry.threadId = handle.id;

  const thread: ThreadState = {
    id: handle.id,
    agentId: entry.agentId,
    provider,
    model: model || "",
    busy: true,
    archiveTimer: null,
  };
  setThread(thread);
  console.log(`[btw] thread ${handle.id} created for question ${entry.id}`);

  try {
    await settleTurn(handle.waitForFinish(ANSWER_TIMEOUT_MS), handle, entry);
  } finally {
    thread.busy = false;
  }
  if (entry.status === "error") {
    closeThread(entry.agentId);
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
    entry.error = "旁路会话在等待权限确认（它被要求不使用工具），已放弃";
  } else if (result.status === "timeout") {
    entry.status = "error";
    entry.error = "回答超时";
  } else {
    entry.status = "error";
    entry.error = result.error ?? `旁路会话异常结束（${result.status}）`;
  }
}

function scheduleIdleArchive(thread: ThreadState, paseo: PaseoApi): void {
  if (!activeSettings.autoArchive) return;
  const delayMs = activeSettings.idleMinutes * 60_000;
  if (thread.archiveTimer) clearTimeout(thread.archiveTimer);
  thread.archiveTimer = setTimeout(() => {
    thread.archiveTimer = null;
    const current = getThread(thread.agentId);
    if (current && current.id === thread.id && !current.busy) {
      closeThread(thread.agentId);
      void archiveTemp(paseo, thread.id);
      console.log(`[btw] thread ${thread.id} archived after ${activeSettings.idleMinutes}m idle`);
    }
  }, delayMs);
}
