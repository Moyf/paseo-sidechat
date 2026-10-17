import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { BtwMode } from "../shared/contracts";

export interface PersistedQuestion {
  id: string;
  agentId: string;
  threadId: string | null;
  mode: BtwMode;
  question: string;
  status: string;
  answer: string;
  error: string | null;
  model: string | null;
  startedAt: number;
  finishedAt: number | null;
  elapsedMs: number | null;
  requestedModel: string | null;
  tempAgentId: string | null;
}

export interface PersistedThread {
  id: string;
  agentId: string;
  provider: string;
  model: string;
  mode: BtwMode;
}

export interface PersistedState {
  version: 1;
  questions: PersistedQuestion[];
  threads: PersistedThread[];
}

const dir = join(homedir(), ".paseo", "plugin-data", "paseo-btw");
const file = join(dir, "history.json");

export async function loadState(): Promise<PersistedState | null> {
  try {
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw) as PersistedState;
    if (parsed && parsed.version === 1 && Array.isArray(parsed.questions)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveState(state: PersistedState): Promise<void> {
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(file, JSON.stringify(state), "utf8");
  } catch (error) {
    console.error("[btw] failed to persist history", error);
  }
}
