import type { PluginServerContext } from "@getpaseo/plugin/server";
import { btwAsk, btwClear, btwStatus, type BtwQuestion } from "./shared/contracts";
import {
  activeTempAgentIds,
  addQuestion,
  clearQuestions,
  listQuestionsForAgent,
  runningCount,
} from "./server/store";
import { boundApi, startQuestion } from "./server/runner";

const MAX_RUNNING = 3;

function toQuestion(entry: {
  id: string;
  agentId: string;
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

  server.handle(btwClear, (input) => ({ cleared: clearQuestions(input.agentId) }));

  return () => {
    const paseo = boundApi();
    for (const tempId of activeTempAgentIds()) {
      try {
        void paseo?.agents.ref(tempId).archive().catch(() => {});
      } catch {
        // plugin is shutting down; best effort only
      }
    }
  };
}
