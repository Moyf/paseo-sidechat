import type { PluginServerContext } from "@getpaseo/plugin/server";
import { btwAsk, btwClear, btwStatus, type BtwMode, type BtwQuestion } from "./shared/contracts";
import {
  addQuestion,
  clearAllIdleTimers,
  clearQuestions,
  closeThread,
  ensureLoaded,
  flushSave,
  listQuestionsForAgent,
  openThreadAgentIds,
  runningCount,
  runningTempAgentIds,
} from "./server/store";
import { applySettings, boundApi, isAttachToMain, reapOnce, startQuestion } from "./server/runner";
import { btwSettingsDefinition } from "./shared/settings";

const MAX_RUNNING = 3;

function toQuestion(entry: {
  id: string;
  agentId: string;
  threadId: string | null;
  mode: BtwMode;
  question: string;
  status: BtwQuestion["status"];
  answer: string;
  error: string | null;
  model: string | null;
  startedAt: number;
  finishedAt: number | null;
  elapsedMs: number | null;
}): BtwQuestion {
  return {
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
  };
}

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(btwSettingsDefinition);
  const applySettingsState = (state: {
    status: string;
    values?: {
      autoArchive: boolean;
      idleMinutes: number;
      contextMessages: number;
      attachToMain: boolean;
    };
  }) => {
    applySettings(
      state.status === "ready" && state.values
        ? state.values
        : { autoArchive: false, idleMinutes: 10, contextMessages: 8, attachToMain: true },
    );
    if (state.status === "ready" && state.values && !state.values.autoArchive) {
      clearAllIdleTimers();
    }
  };
  void settings.read().then(applySettingsState).catch(() => {});
  settings.subscribe((state) => applySettingsState(state));

  server.handle(btwAsk, (input, { paseo }) => {
    if (runningCount() >= MAX_RUNNING) {
      throw new Error("已有太多 btw 问题在回答中，请稍后再问");
    }
    const entry = addQuestion(input.agentId, input.question, input.model ?? null, input.mode ?? "advice");
    reapOnce(paseo);
    startQuestion(entry, paseo);
    return { questionId: entry.id };
  });

  server.handle(btwStatus, async (input, { paseo }) => {
    await ensureLoaded();
    reapOnce(paseo);
    return { questions: listQuestionsForAgent(input.agentId).map(toQuestion) };
  });

  server.handle(btwClear, async (input, { paseo }) => {
    await ensureLoaded();
    const cleared = clearQuestions(input.agentId);
    const threadId = closeThread(input.agentId);
    if (threadId) {
      void paseo.agents.ref(threadId).archive().catch(() => {});
    }
    await flushSave();
    return { cleared };
  });

  return () => {
    const paseo = boundApi();
    // attached threads survive the reload on purpose (they reconnect from disk);
    // standalone threads would orphan, so archive them unless autoArchive will
    if (!isAttachToMain()) {
      const ids = [...runningTempAgentIds(), ...openThreadAgentIds()];
      for (const tempId of ids) {
        try {
          void paseo?.agents.ref(tempId).archive().catch(() => {});
        } catch {
          // plugin is shutting down; best effort only
        }
      }
    }
    void flushSave().catch(() => {});
  };
}
