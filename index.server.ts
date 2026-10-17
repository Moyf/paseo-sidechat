import type { PluginServerContext } from "@getpaseo/plugin/server";
import { btwAsk, btwClear, btwStatus, type BtwQuestion } from "./shared/contracts";
import {
  addQuestion,
  clearAllIdleTimers,
  clearQuestions,
  closeThread,
  listQuestionsForAgent,
  openThreadAgentIds,
  runningCount,
  runningTempAgentIds,
} from "./server/store";
import { applySettings, boundApi, startQuestion } from "./server/runner";
import { btwSettingsDefinition } from "./shared/settings";

const MAX_RUNNING = 3;

function toQuestion(entry: {
  id: string;
  agentId: string;
  threadId: string | null;
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
    values?: { autoArchive: boolean; idleMinutes: number; contextMessages: number };
  }) => {
    applySettings(
      state.status === "ready" && state.values
        ? state.values
        : { autoArchive: false, idleMinutes: 10, contextMessages: 8 },
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
    const entry = addQuestion(input.agentId, input.question, input.model ?? null);
    startQuestion(entry, paseo);
    return { questionId: entry.id };
  });

  server.handle(btwStatus, (input) => ({
    questions: listQuestionsForAgent(input.agentId).map(toQuestion),
  }));

  server.handle(btwClear, (input, { paseo }) => {
    const cleared = clearQuestions(input.agentId);
    const threadId = closeThread(input.agentId);
    return { cleared };
  });

  return () => {
    const paseo = boundApi();
    const ids = [...runningTempAgentIds(), ...openThreadAgentIds()];
    for (const tempId of ids) {
      try {
        void paseo?.agents.ref(tempId).archive().catch(() => {});
      } catch {
        // plugin is shutting down; best effort only
      }
    }
  };
}
