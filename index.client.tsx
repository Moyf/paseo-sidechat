import type { PluginClientContext } from "@getpaseo/plugin/client";
import { BtwPanel } from "./client/panel";
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

  return () => {};
}
