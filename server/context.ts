import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import type { BtwMode } from "../shared/contracts";
import type { ResponseLanguage } from "./locale";

type PaseoApi = PluginHandlerContext["paseo"];

const DEFAULT_MAX_MESSAGES = 8;
const MAX_CHARS_PER_MESSAGE = 1500;
const MAX_TOTAL_CHARS = 12000;

function truncate(text: string, max: number): string {
  const clean = text.trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max)}…`;
}

/** Reads the main agent's recent conversation as side-question context. Read-only, never writes. */
export async function buildContext(
  paseo: PaseoApi,
  agentId: string,
  maxMessages: number = DEFAULT_MAX_MESSAGES,
): Promise<string> {
  try {
    const page = await paseo.agents.ref(agentId).timeline.refetch({ direction: "tail", limit: 60 });
    const lines: Array<{ role: string; text: string }> = [];
    for (const entry of page.entries) {
      const item = entry.item;
      if (item.type === "user_message") {
        lines.push({ role: "User", text: item.text });
      } else if (item.type === "assistant_message") {
        lines.push({ role: "Assistant", text: item.text });
      }
    }
    const recent = lines.slice(-Math.max(1, Math.floor(maxMessages))).map((line) => ({
      role: line.role,
      text: truncate(line.text, MAX_CHARS_PER_MESSAGE),
    }));
    let total = 0;
    const kept: string[] = [];
    for (let i = recent.length - 1; i >= 0; i -= 1) {
      const rendered = `${recent[i].role}: ${recent[i].text}`;
      if (total + rendered.length > MAX_TOTAL_CHARS && kept.length > 0) break;
      total += rendered.length;
      kept.unshift(rendered);
    }
    return kept.join("\n\n");
  } catch (error) {
    console.error("[btw] failed to read main agent timeline", error);
    return "";
  }
}

export function buildPrompt(context: string, question: string, mode: BtwMode, language: ResponseLanguage): string {
  const answerIn = language.tag === "en" ? language.name : `${language.name} (${language.tag})`;
  const contextBlock = context
    ? `Here is the recent conversation in the main session, as background context for the answer:\n\n<context>\n${context}\n</context>\n\n`
    : "(The main session's context could not be read; answer from the question alone.)\n\n";
  const requirement =
    mode === "work"
      ? `- Do this task or answer this problem directly. You may use tools when needed, but only do what is directly related, and keep changes minimal.\n- Write the answer in ${answerIn}. Keep code, file paths, commands, and quoted text unchanged. Markdown is allowed.`
      : `- Answer this question in text only. Do not run tools, read or write files, or run commands.\n- Write the answer in ${answerIn}. Keep code, file paths, commands, and quoted text unchanged. Markdown is allowed.`;
  return `${contextBlock}The user's side-chat question:\n\n<question>\n${question}\n</question>\n\nRequirements:\n${requirement}`;
}
