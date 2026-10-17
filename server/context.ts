import type { PluginHandlerContext } from "@getpaseo/plugin/server";

type PaseoApi = PluginHandlerContext["paseo"];

const MAX_MESSAGES = 16;
const MAX_CHARS_PER_MESSAGE = 1500;
const MAX_TOTAL_CHARS = 12000;

function truncate(text: string, max: number): string {
  const clean = text.trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max)}…`;
}

/** Reads the main agent's recent conversation as side-question context. Read-only, never writes. */
export async function buildContext(paseo: PaseoApi, agentId: string): Promise<string> {
  try {
    const page = await paseo.agents.ref(agentId).timeline.refetch({ direction: "tail", limit: 60 });
    const lines: Array<{ role: string; text: string }> = [];
    for (const entry of page.entries) {
      const item = entry.item;
      if (item.type === "user_message") {
        lines.push({ role: "用户", text: item.text });
      } else if (item.type === "assistant_message") {
        lines.push({ role: "助手", text: item.text });
      }
    }
    const recent = lines.slice(-MAX_MESSAGES).map((line) => ({
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

export function buildPrompt(context: string, question: string): string {
  const contextBlock = context
    ? `以下是主会话最近的对话记录，作为回答的背景上下文：\n\n<context>\n${context}\n</context>\n\n`
    : "（无法读取主会话上下文，请直接根据问题回答。）\n\n";
  return `${contextBlock}用户的旁路问题是：\n\n<question>\n${question}\n</question>\n\n要求：\n- 直接用文字回答这个问题，不要执行任何工具，不要读写文件，不要运行命令。\n- 使用与问题相同的语言回答，简洁、结构清晰，可以使用 Markdown。`;
}
