import type { PluginClientContext } from "@getpaseo/plugin/client";
import { BtwPanel } from "./client/panel";
import { BtwSettingsScreen } from "./client/settings";
import { btwAsk } from "./shared/contracts";

export default function contribute(client: PluginClientContext) {
  client.addWorkspacePanel({
    id: "btw",
    title: "btw",
    icon: "MessageCircleQuestion",
    context: "agent",
    locations: ["explorer"],
    Component: BtwPanel,
  });

  client.addSlashCommand({
    name: "btw",
    description: "旁路提问：基于当前会话上下文回答，不发送给主 agent",
    argumentHint: "<question>",
    context: "agent",
    async onSubmit({ args, agent, rpc, openPanel }) {
      const question = args.trim();
      if (!question) {
        throw new Error("用法：/btw <问题>");
      }
      await rpc(btwAsk, { agentId: agent.id, question });
      openPanel("btw", { location: "explorer" });
    },
  });

  client.addSlashCommand({
    name: "side",
    description: "旁路干活：基于当前会话上下文，可使用工具完成小任务，不发送给主 agent",
    argumentHint: "<task>",
    context: "agent",
    async onSubmit({ args, agent, rpc, openPanel }) {
      const question = args.trim();
      if (!question) {
        throw new Error("用法：/side <任务或问题>");
      }
      await rpc(btwAsk, { agentId: agent.id, question, mode: "work" });
      openPanel("btw", { location: "explorer" });
    },
  });

  client.addSlashCommand({
    name: "fork",
    description: "分叉当前会话：克隆对话上下文到新会话平行探索，主会话不受影响",
    argumentHint: "[first prompt]",
    context: "agent",
    async onSubmit({ args, agent, paseo }) {
      const page = await paseo.agents
        .ref(agent.id)
        .timeline.refetch({ direction: "tail", limit: 200, projection: "canonical" });
      const lines: string[] = [
        `以下是你从中接续的原会话「${agent.title ?? agent.id}」的完整对话记录。原会话仍在独立推进，与此会话互不影响。`,
      ];
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
            title: `原会话转录 · ${agent.title ?? agent.id}`,
            text: lines.join("\n\n"),
          },
        ],
      });
    },
  });

  client.addCommandCenterItem({
    id: "open-btw",
    title: "打开 btw 旁路问答面板",
    icon: "MessageCircleQuestion",
    keywords: ["btw", "ask", "旁路"],
    context: "agent",
    onSelect({ openPanel }) {
      openPanel("btw", { location: "explorer" });
    },
  });

  client.addCommandCenterItem({
    id: "open-btw-settings",
    title: "打开 btw 设置",
    icon: "Settings2",
    keywords: ["btw", "settings", "设置", "回收"],
    context: "global",
    onSelect({ openSettings }) {
      openSettings("settings");
    },
  });

  client.addSettingsScreen({
    id: "settings",
    title: "btw 设置",
    icon: "Settings2",
    Component: BtwSettingsScreen,
  });

  return () => {};
}
