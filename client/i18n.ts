import { NativeModules, Platform } from "react-native";
import type { ColorMode } from "../shared/settings";
import { webLocale } from "./web";

export type Lang = "zh" | "en";

function detectLang(): Lang {
  try {
    if (Platform.OS === "ios") {
      const settings = NativeModules.SettingsManager?.settings as
        | { AppleLocale?: string; AppleLanguages?: string[] }
        | undefined;
      const locale = settings?.AppleLocale ?? settings?.AppleLanguages?.[0];
      if (typeof locale === "string") return locale.toLowerCase().startsWith("zh") ? "zh" : "en";
    } else if (Platform.OS === "android") {
      const locale = (NativeModules.I18nManager as { localeIdentifier?: string } | undefined)
        ?.localeIdentifier;
      if (typeof locale === "string") return locale.toLowerCase().startsWith("zh") ? "zh" : "en";
    } else if (Platform.OS === "web") {
      const locale = webLocale();
      if (locale) return locale.toLowerCase().startsWith("zh") ? "zh" : "en";
    }
  } catch {
    // fall through to the default below
  }
  return "zh";
}

const lang: Lang = detectLang();

export function getLang(): Lang {
  return lang;
}

const zh = {
  panelTitle: "侧聊",
  headerPrefix: "侧聊",
  emptyState:
    "在主 agent 干活时，把旁路问题丢到这里。\n提问模式只出主意；执行模式可用工具，/side 直通；/fork 克隆会话平行探索。\n追问继续同一线程；回答不会写进主会话。",
  queued: "排队中…",
  thinking: (seconds: number) => `思考中… 已等待 ${seconds} 秒`,
  errorPrefix: "出错：",
  modeAsk: "提问",
  modeWork: "执行",
  modeAskA11y: "提问模式：只出主意，不使用工具",
  modeWorkA11y: "执行模式：跟随主会话模式，可使用工具",
  reply: "回复",
  replyActive: "✓ 回复中",
  replyA11y: "将后续提问回复到该会话",
  targetReply: (q: string) => `回复：${q}`,
  targetContinue: (q: string) => `继续会话：${q}`,
  targetNew: "新会话（下一问开启）",
  targetNewModel: "新会话 · 模型已切换",
  targetResetA11y: "恢复自动选择会话",
  clearA11y: "归档当前旁路会话并清除其问答记录",
  clear: "归档",
  workBadge: "🔧 执行",
  openThread: "在标签页查看 ↗",
  openThreadA11y: "在标签页打开该旁路会话",
  openMainA11y: (title: string) => `打开所属会话 ${title}`,
  threadDivider: "— 新会话线程 —",
  send: "提问",
  sending: "回答中",
  sendA11y: "发送旁路问题",
  inputPlaceholder: "顺便问点什么…",
  modelLabel: "模型：",
  followMain: (model: string) => `跟随主会话${model ? `（${model}）` : ""}`,
  sessionDefault: "默认模型",
  modelSearchPlaceholder: "搜索模型…",
  modelNoResults: "没有匹配的模型",
  modelDismissA11y: "关闭模型列表",
  usageBtw: "用法：/btw <问题>",
  usageSide: "用法：/side <任务或问题>",
  usageFork: "用法：/fork [首条指令]",
  descBtw: "旁路提问：基于当前会话上下文回答，不发送给主 agent",
  descSide: "旁路执行：基于当前会话上下文，可使用工具完成小任务，不发送给主 agent",
  descFork: "分叉当前会话：克隆对话上下文到新会话平行探索，主会话不受影响",
  openPanelCommand: "打开侧聊面板",
  openSettingsCommand: "打开侧聊设置",
  askTooMany: "已有太多 btw 问题在回答中，请稍后再问",
  forkTranscriptTitle: (title: string) => `原会话转录 · ${title}`,
  forkIntro: (title: string) =>
    `以下是你从中接续的原会话「${title}」的完整对话记录。原会话仍在独立推进，与此会话互不影响。`,

  appearanceSection: "回答外观",
  appearanceInfo: "只影响 btw 面板里的回答渲染，实时生效",
  headingColor: "标题颜色",
  boldColor: "加粗颜色",
  highlightColor: "高亮颜色",
  preview: "预览",
  previewMarkdown: [
    "### 标题样式",
    "正文里可以有**加粗文字**、==高亮文字==和`行内代码`。",
    "- 列表项带**加粗**",
    "- 列表项带==高亮==",
  ].join("\n"),
  colorModes: {
    default: "跟随主题",
    accent: "强调色",
    muted: "弱化色",
    success: "成功绿",
    warning: "警示黄",
    danger: "危险红",
  } satisfies Record<ColorMode, string>,

  lifecycleSection: "线程回收",
  lifecycleInfo: "btw 线程是同一会话的连续多轮问答",
  attachSwitch: "线程挂靠主会话",
  attachHint:
    "开启后旁路线程作为主会话的 subagent 存活，随主会话归档，插件重载后可继续追问；关闭则插件重载时回收线程",
  autoArchiveSwitch: "闲置后自动归档线程",
  autoArchiveHint: "关闭时线程一直保留，直到清除记录或重载插件",
  idleMinutesLabel: "闲置回收时长（分钟）",
  idleMinutesHint: "1 到 1440 之间的整数",

  contextSection: "主会话上下文",
  contextInfo: "新线程会读取主会话最近的对话作为背景",
  contextMessagesLabel: "上下文消息条数",
  contextMessagesHint: (range: string) => `${range}之间的整数，超长消息另有字符总量上限`,

  generalSection: "通用",
  languageLabel: "界面语言",
  languageAuto: "跟随系统",
};

const en: typeof zh = {
  panelTitle: "Side chat",
  headerPrefix: "Side chat",
  emptyState:
    "Drop side questions here while your agent works.\nAsk mode advises only; Execute mode may use tools (/side jumps straight there); /fork clones the conversation.\nFollow-ups continue the same thread; answers never touch the main session.",
  queued: "Queued…",
  thinking: (seconds: number) => `Thinking… waited ${seconds}s`,
  errorPrefix: "Error: ",
  modeAsk: "Ask",
  modeWork: "Execute",
  modeAskA11y: "Ask mode: advice only, no tools",
  modeWorkA11y: "Execute mode: follows the session's mode and may use tools",
  reply: "Reply",
  replyActive: "✓ Replying",
  replyA11y: "Send follow-ups into this thread",
  targetReply: (q: string) => `Replying: ${q}`,
  targetContinue: (q: string) => `Continuing: ${q}`,
  targetNew: "New thread on next ask",
  targetNewModel: "New thread · model changed",
  targetResetA11y: "Back to automatic thread selection",
  clearA11y: "Archive the current side thread and clear its Q&A",
  clear: "Archive",
  workBadge: "🔧 Work",
  openThread: "Open in tab ↗",
  openThreadA11y: "Open this side thread in a tab",
  openMainA11y: (title: string) => `Open the parent session ${title}`,
  threadDivider: "— new thread —",
  send: "Ask",
  sending: "Working",
  sendA11y: "Send side question",
  inputPlaceholder: "Ask something on the side…",
  modelLabel: "Model: ",
  followMain: (model: string) => `Follow session${model ? ` (${model})` : ""}`,
  sessionDefault: "session default",
  modelSearchPlaceholder: "Search models…",
  modelNoResults: "No matching models",
  modelDismissA11y: "Dismiss model list",
  usageBtw: "Usage: /btw <question>",
  usageSide: "Usage: /side <task>",
  usageFork: "Usage: /fork [first prompt]",
  descBtw: "Side question answered from the current session's context; nothing is sent to the agent",
  descSide: "Side task with tools, based on the current session's context; nothing is sent to the agent",
  descFork: "Fork this chat: clone the conversation into a parallel session; the original is untouched",
  openPanelCommand: "Open the side chat panel",
  openSettingsCommand: "Open side chat settings",
  askTooMany: "Too many btw questions are running, try again shortly",
  forkTranscriptTitle: (title: string) => `Transcript · ${title}`,
  forkIntro: (title: string) =>
    `Below is the full transcript of "${title}", the session you are continuing. It keeps running on its own and neither session affects the other.`,

  appearanceSection: "Answer appearance",
  appearanceInfo: "How answers render inside the BTW panel, applied live",
  headingColor: "Heading color",
  boldColor: "Bold color",
  highlightColor: "Highlight color",
  preview: "Preview",
  previewMarkdown: [
    "### Heading style",
    "Body text can have **bold**, ==highlight==, and `inline code`.",
    "- List item with **bold**",
    "- List item with ==highlight==",
  ].join("\n"),
  colorModes: {
    default: "Theme default",
    accent: "Accent",
    muted: "Muted",
    success: "Success",
    warning: "Warning",
    danger: "Danger",
  },

  lifecycleSection: "Thread lifecycle",
  lifecycleInfo: "A btw thread is one continuous multi-turn conversation",
  attachSwitch: "Attach threads to the main session",
  attachHint:
    "Threads live as subagents of the main session and are archived with it; they stay usable across plugin reloads. When off, threads are reclaimed on reload",
  autoArchiveSwitch: "Auto-archive idle threads",
  autoArchiveHint: "When off, threads are kept until you clear them or the plugin reloads",
  idleMinutesLabel: "Idle archive after (minutes)",
  idleMinutesHint: "An integer between 1 and 1440",

  contextSection: "Main session context",
  contextInfo: "New threads read the main session's recent messages as background",
  contextMessagesLabel: "Context message count",
  contextMessagesHint: (range: string) => `An integer between ${range}; very long messages are capped separately`,

  generalSection: "General",
  languageLabel: "Interface language",
  languageAuto: "System default",
};

/** Resolve the UI language: an explicit setting wins, otherwise the OS locale. */
export function resolveLang(setting: string | null | undefined): Lang {
  if (setting === "zh" || setting === "en") return setting;
  return getLang();
}

export const dictionaries: Record<Lang, typeof zh> = { zh, en };

export const t = dictionaries[getLang()];
