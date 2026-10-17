import type { PluginClientContext } from "@getpaseo/plugin/client";
import { btwAsk } from "../shared/contracts";
import { dictionaries, getLang, type Lang } from "./i18n";
import { BtwPanel } from "./panel";
import { BtwSettingsScreen } from "./settings";

/**
 * Workspace-panel titles and command descriptions are written once at
 * registration time, so language-bound contributions are disposed and
 * re-registered whenever the interface language setting changes.
 */

let client: PluginClientContext | null = null;
let cleanups: Array<() => void> = [];
let lang: Lang = getLang();

function rebind(): void {
  for (const dispose of cleanups) dispose();
  cleanups = [];
  const context = client;
  if (!context) return;
  const t = dictionaries[lang];

  cleanups.push(
    context.addWorkspacePanel({
      id: "sidechat",
      title: t.panelTitle,
      icon: "MessageCircleQuestion",
      context: "agent",
      locations: ["explorer"],
      Component: BtwPanel,
    }),
  );

  cleanups.push(
    context.addSlashCommand({
      name: "btw",
      description: t.descBtw,
      argumentHint: "<question>",
      context: "agent",
      async onSubmit({ args, agent, rpc, openPanel }) {
        const question = args.trim();
        if (!question) {
          throw new Error(t.usageBtw);
        }
        await rpc(btwAsk, { agentId: agent.id, question });
        openPanel("sidechat", { location: "explorer" });
      },
    }),
  );

  cleanups.push(
    context.addSlashCommand({
      name: "side",
      description: t.descSide,
      argumentHint: "<task>",
      context: "agent",
      async onSubmit({ args, agent, rpc, openPanel }) {
        const question = args.trim();
        if (!question) {
          throw new Error(t.usageSide);
        }
        await rpc(btwAsk, { agentId: agent.id, question, mode: "work" });
        openPanel("sidechat", { location: "explorer" });
      },
    }),
  );

  cleanups.push(
    context.addSlashCommand({
      name: "fork",
      description: t.descFork,
      argumentHint: "[first prompt]",
      context: "agent",
      async onSubmit({ args, agent, paseo }) {
        const page = await paseo.agents
          .ref(agent.id)
          .timeline.refetch({ direction: "tail", limit: 200, projection: "canonical" });
        const lines: string[] = [t.forkIntro(agent.title ?? agent.id)];
        for (const entry of page.entries) {
          const item = entry.item;
          if (item.type === "user_message") {
            lines.push(`用户: ${item.text}`);
          } else if (item.type === "assistant_message") {
            lines.push(`助手: ${item.text}`);
          }
        }
        await paseo.workspaces.ref(agent.workspaceId).agents.create({
          config: {
            provider: agent.model ? `${agent.provider}/${agent.model}` : agent.provider,
          },
          title: `Fork · ${agent.title ?? agent.id}`,
          prompt: args.trim() || undefined,
          attachments: [
            {
              type: "text",
              mimeType: "text/plain",
              title: t.forkTranscriptTitle(agent.title ?? agent.id),
              text: lines.join("\n\n"),
            },
          ],
        });
      },
    }),
  );

  cleanups.push(
    context.addCommandCenterItem({
      id: "open-btw",
      title: t.openPanelCommand,
      icon: "MessageCircleQuestion",
      keywords: ["btw", "side", "sidechat", "ask", "旁路", "侧聊"],
      context: "agent",
      onSelect({ openPanel }) {
        openPanel("sidechat", { location: "explorer" });
      },
    }),
  );

  cleanups.push(
    context.addCommandCenterItem({
      id: "open-btw-settings",
      title: t.openSettingsCommand,
      icon: "Settings2",
      keywords: ["btw", "sidechat", "settings", "设置", "回收"],
      context: "global",
      onSelect({ openSettings }) {
        openSettings("settings");
      },
    }),
  );

  cleanups.push(
    context.addSettingsScreen({
      id: "settings",
      title: t.panelTitle,
      icon: "Settings2",
      Component: BtwSettingsScreen,
    }),
  );
}

/** Registers every language-bound client contribution. */
export function registerUi(context: PluginClientContext): () => void {
  client = context;
  lang = getLang();
  rebind();
  return () => {
    for (const dispose of cleanups) dispose();
    cleanups = [];
    client = null;
  };
}

/** Re-registers language-bound contributions after the language setting changes. */
export function applyUiLanguage(next: Lang): void {
  if (!client || next === lang) return;
  lang = next;
  rebind();
}
