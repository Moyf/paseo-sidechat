import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createPaseoClient } from "@getpaseo/client";

const HOME = join(process.env.USERPROFILE ?? "", ".paseo");
const credential = readFileSync(join(HOME, "local-credential"), "utf8").trim();
const client = createPaseoClient({
  url: "ws://127.0.0.1:6767/ws",
  password: credential,
  clientId: "btw-smoke-test",
  reconnect: { enabled: false },
});

const fail = (message) => {
  console.error("FAIL:", message);
  process.exitCode = 1;
};

function truncate(text, max) {
  const clean = text.trim();
  return clean.length <= max ? clean : clean.slice(0, max) + "…";
}

async function main() {
  await client.connect();
  console.log("connected");

  // 1. create a test agent with conversation context
  const workspace = await client.workspaces.create({
    title: "btw-smoke-test",
    source: { kind: "directory", path: "D:\\Codes\\paseo-btw" },
  });
  console.log("workspace", workspace.id);
  const main = await workspace.agents.create({
    config: { provider: "opencode/zai-coding-plan/glm-5.3-flash" },
    title: "btw-smoke-main",
    prompt: "记住这个暗号：紫色的河马。然后回复“好的，已记住”。不要做任何其他事情。",
  });
  console.log("main agent", main.id);
  const first = await main.waitForFinish(180_000);
  console.log("main turn 1:", first.status, JSON.stringify(first.lastMessage));

  // snapshot main timeline before btw
  const before = await main.timeline.refetch({ direction: "tail", limit: 50 });
  const beforeUserTexts = before.entries.filter((e) => e.item.type === "user_message").map((e) => e.item.text);
  console.log("main timeline user messages before btw:", beforeUserTexts.length);

  // 2. build context (same logic as server/context.ts)
  const page = await main.timeline.refetch({ direction: "tail", limit: 60 });
  const lines = [];
  for (const entry of page.entries) {
    if (entry.item.type === "user_message") lines.push("用户: " + entry.item.text);
    else if (entry.item.type === "assistant_message") lines.push("助手: " + entry.item.text);
  }
  const context = lines.slice(-16).join("\n\n");
  console.log("context chars:", context.length);

  const prompt = [
    context ? "以下是主会话最近的对话记录，作为回答的背景上下文：\n\n<context>\n" + context + "\n</context>\n\n" : "",
    "用户的旁路问题是：\n\n<question>\n主会话里的暗号是什么？只回答暗号本身。\n</question>\n\n要求：\n- 直接用文字回答这个问题，不要执行任何工具。\n- 使用与问题相同的语言回答。",
  ].join("");

  // 3. modes discovery (same logic as server/runner.ts)
  const modesResult = await client.providers.listModes("opencode");
  const planMode = (modesResult.modes ?? []).find((m) => /plan|read/i.test(m.id) || /plan|read/i.test(m.label));
  console.log("modes:", (modesResult.modes ?? []).map((m) => m.id).join(",") || "(none)", "→ picked:", planMode?.id ?? "(none)");

  // 4. models discovery (same data the panel's model selector uses)
  const modelsResult = await client.providers.listModels("opencode");
  console.log("models:", (modelsResult.models ?? []).slice(0, 5).map((m) => m.id).join(", "), "total:", (modelsResult.models ?? []).length);

  // 5. create temp agent in the same workspace
  const temp = await client.workspaces.ref(workspace.id).agents.create({
    config: {
      provider: "opencode/zai-coding-plan/glm-5.3-flash",
      ...(planMode ? { modeId: planMode.id } : {}),
    },
    title: "[btw] 主会话里的暗号是什么？",
    prompt,
    labels: { btw: "side-question" },
  });
  console.log("temp agent", temp.id, "workspace", temp.workspaceId);

  // 6. progressive answer polling (same logic as server/runner.ts pollAnswer)
  const pollOnce = async () => {
    const tp = await temp.timeline.refetch({ direction: "tail", limit: 40 });
    const texts = tp.entries.filter((e) => e.item.type === "assistant_message").map((e) => e.item.text);
    return texts.join("\n\n");
  };
  let progressive = "";
  const startedAt = Date.now();
  let result;
  const waiter = temp.waitForFinish(240_000).then((r) => {
    result = r;
  });
  while (result === undefined) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const partial = await pollOnce();
    if (partial && partial !== progressive) {
      progressive = partial;
      console.log("  …progress:", truncate(progressive, 60));
    }
    if (Date.now() - startedAt > 240_000) break;
  }
  await waiter;
  console.log("temp turn:", result.status, "error:", result.error);
  const finalAnswer = result.lastMessage && result.lastMessage.trim() ? result.lastMessage : progressive;
  console.log("ANSWER:", JSON.stringify(finalAnswer));

  // 7. archive temp agent
  await temp.archive();
  const archivedTemp = await client.agents.ref(temp.id).refresh();
  console.log("temp archivedAt:", archivedTemp?.agent.archivedAt ?? "(null)");

  // 8. verify main agent timeline untouched
  const after = await main.timeline.refetch({ direction: "tail", limit: 50 });
  const afterUserTexts = after.entries.filter((e) => e.item.type === "user_message").map((e) => e.item.text);
  console.log("main timeline user messages after btw:", afterUserTexts.length);
  const untouched =
    beforeUserTexts.length === afterUserTexts.length &&
    beforeUserTexts.every((text, i) => text === afterUserTexts[i]);
  if (!untouched) fail("main agent timeline was modified!");
  else console.log("main timeline unchanged ✓");

  if (!finalAnswer || !finalAnswer.includes("紫色的河马")) {
    fail("answer missing the passphrase");
  } else {
    console.log("answer contains passphrase ✓");
  }

  // cleanup
  await main.archive();
  await client.workspaces.ref(workspace.id).archive();
  console.log("cleanup done");
}

try {
  await main();
} catch (error) {
  console.error("SMOKE ERROR:", error);
  process.exitCode = 1;
} finally {
  await client.close().catch(() => {});
}
