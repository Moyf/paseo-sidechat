import type { PluginClientContext } from "@getpaseo/plugin/client";
import { btwAsk } from "../shared/contracts";
import { messages } from "./messages";
import { BtwPanel } from "./panel";
import { BtwSettingsScreen } from "./settings";

/**
 * Registers every client contribution. Persistent labels use message
 * references, so the host resolves them in the app's language and re-renders
 * them live when the language changes — no re-registration needed. Transient
 * text inside callbacks resolves through context.i18n.t at invocation time.
 */
export function registerUi(context: PluginClientContext): () => void {
  const cleanups: Array<() => void> = [];

  cleanups.push(
    context.addAgentPanel({
      id: "sidechat",
      title: messages.message("panel.title"),
      icon: "MessageCircleQuestion",
      locations: ["explorer"],
      Component: BtwPanel,
    }),
  );

  cleanups.push(
    context.addSlashCommand({
      name: "btw",
      description: messages.message("commands.btwDescription"),
      argumentHint: "<question>",
      context: "agent",
      async onSubmit({ args, agent, rpc, openPanel }) {
        const question = args.trim();
        if (!question) {
          throw new Error(context.i18n.t(messages, "commands.btwUsage"));
        }
        await rpc(btwAsk, { agentId: agent.id, question, locale: context.i18n.locale });
        openPanel("sidechat", { location: "explorer" });
      },
    }),
  );

  cleanups.push(
    context.addSlashCommand({
      name: "side",
      description: messages.message("commands.sideDescription"),
      argumentHint: "<task>",
      context: "agent",
      async onSubmit({ args, agent, rpc, openPanel }) {
        const question = args.trim();
        if (!question) {
          throw new Error(context.i18n.t(messages, "commands.sideUsage"));
        }
        await rpc(btwAsk, { agentId: agent.id, question, mode: "work", locale: context.i18n.locale });
        openPanel("sidechat", { location: "explorer" });
      },
    }),
  );

  cleanups.push(
    context.addSlashCommand({
      name: "fork",
      description: messages.message("commands.forkDescription"),
      argumentHint: "[first prompt]",
      context: "agent",
      async onSubmit({ args, agent, paseo }) {
        const page = await paseo.agents
          .ref(agent.id)
          .timeline.refetch({ direction: "tail", limit: 200, projection: "canonical" });
        const lines: string[] = [context.i18n.t(messages, "commands.forkIntro", { title: agent.title ?? agent.id })];
        for (const entry of page.entries) {
          const item = entry.item;
          if (item.type === "user_message") {
            lines.push(`User: ${item.text}`);
          } else if (item.type === "assistant_message") {
            lines.push(`Assistant: ${item.text}`);
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
              title: context.i18n.t(messages, "commands.forkTranscriptTitle", { title: agent.title ?? agent.id }),
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
      title: messages.message("commands.openPanel"),
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
      title: messages.message("commands.openSettings"),
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
      title: messages.message("panel.title"),
      icon: "Settings2",
      Component: BtwSettingsScreen,
    }),
  );

  return () => {
    for (const dispose of cleanups) dispose();
  };
}
