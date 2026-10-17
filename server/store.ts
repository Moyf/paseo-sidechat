import type { BtwQuestion } from "../shared/contracts";

export interface QuestionEntry extends BtwQuestion {
  requestedModel: string | null;
  tempAgentId: string | null;
}

const MAX_QUESTIONS_PER_AGENT = 50;
const MAX_RUNNING = 3;

const questions = new Map<string, QuestionEntry>();
const order: string[] = [];

function indexFor(agentId: string): string[] {
  let ids = questionsByAgent.get(agentId);
  if (!ids) {
    ids = [];
    questionsByAgent.set(agentId, ids);
  }
  return ids;
}

const questionsByAgent = new Map<string, string[]>();

let seq = 0;

export function addQuestion(agentId: string, question: string, requestedModel: string | null): QuestionEntry {
  seq += 1;
  const entry: QuestionEntry = {
    id: `btw_${Date.now().toString(36)}_${seq.toString(36)}`,
    agentId,
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
  indexFor(agentId).push(entry.id);
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

export function getQuestion(id: string): QuestionEntry | undefined {
  return questions.get(id);
}

export function listQuestionsForAgent(agentId: string): QuestionEntry[] {
  const ids = questionsByAgent.get(agentId) ?? [];
  const entries: QuestionEntry[] = [];
  for (const id of ids) {
    const entry = questions.get(id);
    if (entry) entries.push(entry);
  }
  return entries.reverse();
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
  return cleared;
}

export function runningCount(): number {
  let count = 0;
  for (const entry of questions.values()) {
    if (entry.status === "running" || entry.status === "pending") count += 1;
  }
  return count;
}

export function activeTempAgentIds(): string[] {
  const ids: string[] = [];
  for (const entry of questions.values()) {
    if ((entry.status === "running" || entry.status === "pending") && entry.tempAgentId) {
      ids.push(entry.tempAgentId);
    }
  }
  return ids;
}
