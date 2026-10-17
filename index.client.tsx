import type { PluginClientContext } from "@getpaseo/plugin/client";
import { BtwPanel } from "./client/panel";
import { BtwSettingsScreen } from "./client/settings";
import { t } from "./client/i18n";
import { btwAsk } from "./shared/contracts";

export default function contribute(client: PluginClientContext) {
  client.addWorkspacePanel({
    id: "sidechat",
    title: t.panelTitle,
    icon: "MessageCircleQuestion",
    context: "agent",
    locations: ["explorer"],
    Component: BtwPanel,
  });

  client.addSlashCommand({
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
  });

  client.addSlashCommand({
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
  });

  client.addSlashCommand({
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
  });

  client.addCommandCenterItem({
    id: "open-btw",
    title: t.openPanelCommand,
    icon: "MessageCircleQuestion",
    keywords: ["btw", "side", "sidechat", "ask", "旁路", "侧聊"],
    context: "agent",
    onSelect({ openPanel }) {
      openPanel("sidechat", { location: "explorer" });
    },
  });

  client.addCommandCenterItem({
    id: "open-btw-settings",
    title: t.openSettingsCommand,
    icon: "Settings2",
    keywords: ["btw", "sidechat", "settings", "设置", "回收"],
    context: "global",
    onSelect({ openSettings }) {
      openSettings("settings");
    },
  });

  client.addSettingsScreen({
    id: "settings",
    title: t.panelTitle,
    icon: "Settings2",
    Component: BtwSettingsScreen,
  });

  return () => {};
}
