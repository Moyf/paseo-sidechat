import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import type { QuestionEntry } from "./store";
import { buildContext, buildPrompt } from "./context";

type PaseoApi = PluginHandlerContext["paseo"];

const ANSWER_TIMEOUT_MS = 4 * 60_000;
const ANSWER_POLL_MS = 1000;
const TITLE_MAX = 60;

let boundPaseo: PaseoApi | null = null;

export function boundApi(): PaseoApi | null {
  return boundPaseo;
}

function truncateQuestion(question: string): string {
  const oneLine = question.replace(/\s+/g, " ").trim();
  return oneLine.length <= TITLE_MAX ? oneLine : `${oneLine.slice(0, TITLE_MAX)}…`;
}

async function pollAnswer(handle: ReturnType<PaseoApi["agents"]["ref"]>, entry: QuestionEntry): Promise<void> {
  try {
    const page = await handle.timeline.refetch({ direction: "tail", limit: 40 });
    const texts: string[] = [];
    for (const timelineEntry of page.entries) {
      if (timelineEntry.item.type === "assistant_message") {
        texts.push(timelineEntry.item.text);
      }
    }
    if (texts.length > 0) {
      entry.answer = texts.join("\n\n");
    }
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

/** Fires the side question in the background; never blocks the RPC. */
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
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let tempHandle: ReturnType<PaseoApi["agents"]["ref"]> | null = null;
  try {
    const mainRef = await paseo.agents.ref(entry.agentId).refresh();
    if (!mainRef) {
      throw new Error("主会话不存在或已不可用");
    }
    const main = mainRef.agent;
    const provider = main.provider;
    const model = entry.requestedModel ?? main.model ?? "";
    entry.model = model || null;
    const providerSpec = model ? `${provider}/${model}` : provider;
    if (!main.workspaceId) {
      throw new Error("主会话没有所属 workspace，无法创建旁路会话");
    }

    const context = await buildContext(paseo, entry.agentId);
    const prompt = buildPrompt(context, entry.question);
    const modeId = await pickPlanMode(paseo, provider);

    tempHandle = await paseo.workspaces.ref(main.workspaceId).agents.create({
      config: {
        provider: providerSpec,
        ...(modeId ? { modeId } : {}),
      },
      title: `[btw] ${truncateQuestion(entry.question)}`,
      prompt,
      labels: { btw: "side-question" },
    });
    entry.tempAgentId = tempHandle.id;
    console.log(`[btw] temp agent ${tempHandle.id} created for question ${entry.id}`);

    pollTimer = setInterval(() => {
      if (tempHandle) void pollAnswer(tempHandle, entry);
    }, ANSWER_POLL_MS);

    const result = await tempHandle.waitForFinish(ANSWER_TIMEOUT_MS);
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
  } catch (error) {
    entry.status = "error";
    entry.error = error instanceof Error ? error.message : String(error);
  } finally {
    if (pollTimer) clearInterval(pollTimer);
    entry.finishedAt = Date.now();
    entry.elapsedMs = entry.finishedAt - entry.startedAt;
    const tempId = entry.tempAgentId;
    if (tempId) {
      try {
        await paseo.agents.ref(tempId).archive();
        console.log(`[btw] temp agent ${tempId} archived`);
      } catch (error) {
        console.error("[btw] failed to archive temp agent", tempId, error);
      }
    }
  }
}
