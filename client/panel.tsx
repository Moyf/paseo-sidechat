import type { PluginAgentPanelProps } from "@getpaseo/plugin/client";
import { useAgent, usePaseo, useRpc } from "@getpaseo/plugin/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { btwAsk, btwClear, btwStatus, type BtwQuestion } from "../shared/contracts";
import { MarkdownView } from "./markdown";

interface ModelOption {
  id: string;
  label: string;
}

function formatElapsed(startedAt: number, finishedAt: number | null, now: number): number {
  const end = finishedAt ?? now;
  return Math.max(0, Math.floor((end - startedAt) / 1000));
}

export function BtwPanel({ theme, layout, agentId, navigation }: PluginAgentPanelProps) {
  const paseo = usePaseo();
  const askRpc = useRpc(btwAsk);
  const statusRpc = useRpc(btwStatus);
  const clearRpc = useRpc(btwClear);

  const agent = useAgent(agentId, (value) => ({
    title: value.title,
    provider: value.provider,
    model: value.model,
  }));

  const [questions, setQuestions] = useState<BtwQuestion[]>([]);
  const [input, setInput] = useState("");
  const [askError, setAskError] = useState<string | null>(null);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const scrollRef = useRef<ScrollView>(null);

  const hasActive = questions.some((q) => q.status === "pending" || q.status === "running");

  const refresh = useCallback(async () => {
    try {
      const result = await statusRpc({ agentId });
      setQuestions(result.questions);
    } catch {
      // daemon or plugin restarting; the next poll retries
    }
  }, [statusRpc, agentId]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), hasActive ? 400 : 4000);
    return () => clearInterval(timer);
  }, [refresh, hasActive]);

  useEffect(() => {
    if (!hasActive) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [hasActive]);

  useEffect(() => {
    const provider = agent?.provider;
    if (!provider) return;
    let cancelled = false;
    void paseo.providers
      .listModels(provider)
      .then((result) => {
        if (cancelled) return;
        const options = (result.models ?? [])
          .filter((model) => model.isSelectable !== false)
          .map((model) => ({ id: model.id, label: model.label }));
        setModels(options);
      })
      .catch(() => {
        if (!cancelled) setModels([]);
      });
    return () => {
      cancelled = true;
    };
  }, [paseo, agent?.provider]);

  useEffect(() => {
    const timer = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 80);
    return () => clearTimeout(timer);
  }, [questions.length, hasActive]);

  const styles = useMemo(() => {
    const pad = layout.compact ? 10 : 14;
    return {
      screen: { flex: 1, backgroundColor: theme.colors.surface0 },
      header: {
        paddingHorizontal: pad,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderColor: theme.colors.border,
        gap: 2,
      },
      headerTitle: { color: theme.colors.foreground, fontSize: layout.compact ? 14 : 15, fontWeight: "700" as const },
      headerSubtitle: { color: theme.colors.foregroundMuted, fontSize: layout.compact ? 11 : 12 },
      list: { flex: 1, paddingHorizontal: pad },
      item: { paddingVertical: 10, borderBottomWidth: 1, borderColor: theme.colors.border, gap: 4 },
      questionText: {
        color: theme.colors.foregroundMuted,
        fontSize: layout.compact ? 13 : 14,
        borderLeftWidth: 3,
        borderLeftColor: theme.colors.accent,
        paddingLeft: 8,
        paddingVertical: 2,
        gap: 2,
      },
      statusText: { color: theme.colors.foregroundMuted, fontSize: layout.compact ? 11 : 12 },
      errorText: { color: theme.colors.statusDanger, fontSize: layout.compact ? 12 : 13 },
      metaText: { color: theme.colors.foregroundMuted, fontSize: layout.compact ? 10 : 11 },
      footer: { borderTopWidth: 1, borderColor: theme.colors.border, paddingHorizontal: pad, paddingTop: 8, paddingBottom: 10, gap: 6 },
      modelRow: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        justifyContent: "space-between" as const,
      },
      modelButton: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 6,
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: 6,
        backgroundColor: theme.colors.surface1,
      },
      modelButtonText: { color: theme.colors.foreground, fontSize: layout.compact ? 11 : 12 },
      modelCaret: { color: theme.colors.foregroundMuted, fontSize: layout.compact ? 11 : 12 },
      modelList: { maxHeight: 160, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface1 },
      modelOption: { paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, borderColor: theme.colors.border },
      modelOptionText: { color: theme.colors.foreground, fontSize: layout.compact ? 12 : 13 },
      modelOptionSub: { color: theme.colors.foregroundMuted, fontSize: layout.compact ? 10 : 11 },
      inputRow: { flexDirection: "row" as const, alignItems: "flex-end" as const, gap: 8 },
      input: {
        flex: 1,
        minHeight: 38,
        maxHeight: 110,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface1,
        color: theme.colors.foreground,
        paddingHorizontal: 10,
        paddingVertical: 8,
        fontSize: layout.compact ? 13 : 14,
      },
      sendButton: {
        backgroundColor: theme.colors.accent,
        borderRadius: 8,
        paddingHorizontal: 14,
        paddingVertical: 9,
      },
      sendButtonText: { color: theme.colors.accentForeground, fontSize: layout.compact ? 13 : 14, fontWeight: "700" as const },
      clearButton: {
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
        paddingHorizontal: 10,
        paddingVertical: 8,
      },
      clearButtonText: { color: theme.colors.foregroundMuted, fontSize: layout.compact ? 12 : 13 },
    };
  }, [theme, layout.compact]);

  const submit = useCallback(async () => {
    const question = input.trim();
    if (!question) return;
    setInput("");
    setAskError(null);
    try {
      await askRpc({ agentId, question, model: selectedModel ?? undefined });
      await refresh();
    } catch (error) {
      setAskError(error instanceof Error ? error.message : String(error));
      setInput(question);
    }
  }, [input, askRpc, agentId, selectedModel, refresh]);

  const clear = useCallback(async () => {
    setAskError(null);
    try {
      await clearRpc({ agentId });
      await refresh();
    } catch (error) {
      setAskError(error instanceof Error ? error.message : String(error));
    }
  }, [clearRpc, agentId, refresh]);

  const agentTitle = agent?.title ?? agentId;
  const providerLabel = agent ? `${agent.provider}${agent.model ? ` / ${agent.model}` : ""}` : "";
  const selectedModelLabel = selectedModel
    ? (models.find((m) => m.id === selectedModel)?.label ?? selectedModel)
    : agent?.model ?? "默认模型";

  return (
    <View style={styles.screen}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`打开所属会话 ${agentTitle}`}
        disabled={!navigation}
        onPress={() => navigation?.openAgent({ agentId })}
        style={styles.header}
      >
        <Text style={styles.headerTitle}>
          btw · {agentTitle}
          {navigation ? " ↗" : ""}
        </Text>
        <Text style={styles.headerSubtitle}>{providerLabel || "…"}</Text>
      </Pressable>

      <ScrollView
        ref={scrollRef}
        style={styles.list}
        contentContainerStyle={{ paddingBottom: 8, paddingTop: hasActive || questions.length > 0 ? 4 : 14 }}
      >
        {questions.length === 0 ? (
          <Text style={styles.statusText}>
            {"在主 agent 干活时，把旁路问题丢到这里。\n回答基于当前会话上下文，但不会写进主会话。"}
          </Text>
        ) : (
          questions.map((question) => (
            <View key={question.id} style={styles.item}>
              <Text style={styles.questionText}>{question.question}</Text>
              {question.status === "pending" ? (
                <Text style={styles.statusText}>排队中…</Text>
              ) : question.status === "running" ? (
                <Text style={styles.statusText}>
                  思考中… 已等待 {formatElapsed(question.startedAt, question.finishedAt, now)} 秒
                </Text>
              ) : question.status === "error" ? (
                <Text style={styles.errorText}>出错：{question.error ?? "未知错误"}</Text>
              ) : null}
              {question.answer.length > 0 ? (
                <MarkdownView markdown={question.answer} theme={theme} compact={layout.compact} />
              ) : null}
              <Text style={styles.metaText}>
                {question.model ?? "?"}
                {question.elapsedMs != null ? ` · ${(question.elapsedMs / 1000).toFixed(1)}s` : ""}
              </Text>
            </View>
          ))
        )}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.modelRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="选择模型"
            style={styles.modelButton}
            onPress={() => setModelPickerOpen((open) => !open)}
          >
            <Text style={styles.modelButtonText}>模型：{selectedModelLabel}</Text>
            <Text style={styles.modelCaret}>{modelPickerOpen ? "▲" : "▼"}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="清空问答记录" style={styles.clearButton} onPress={() => void clear()}>
            <Text style={styles.clearButtonText}>Clear</Text>
          </Pressable>
        </View>

        {modelPickerOpen ? (
          <ScrollView style={styles.modelList} nestedScrollEnabled>
            <Pressable
              accessibilityRole="button"
              style={styles.modelOption}
              onPress={() => {
                setSelectedModel(null);
                setModelPickerOpen(false);
              }}
            >
              <Text style={styles.modelOptionText}>
                {selectedModel === null ? "✓ " : ""}
                跟随主会话{agent?.model ? `（${agent.model}）` : ""}
              </Text>
            </Pressable>
            {models.map((model) => (
              <Pressable
                key={model.id}
                accessibilityRole="button"
                style={styles.modelOption}
                onPress={() => {
                  setSelectedModel(model.id);
                  setModelPickerOpen(false);
                }}
              >
                <Text style={styles.modelOptionText}>
                  {selectedModel === model.id ? "✓ " : ""}
                  {model.label}
                </Text>
                <Text style={styles.modelOptionSub}>{model.id}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        {askError ? <Text style={styles.errorText}>{askError}</Text> : null}

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="顺便问点什么…"
            placeholderTextColor={theme.colors.foregroundMuted}
            multiline
            editable={!hasActive}
            onKeyPress={(event) => {
              const nativeEvent = event.nativeEvent as { key?: string; isComposing?: boolean };
              if (nativeEvent.key !== "Enter" || nativeEvent.isComposing) return;
              const shiftKey = (event as unknown as { shiftKey?: boolean }).shiftKey === true;
              if (shiftKey) return;
              event.preventDefault?.();
              void submit();
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="发送旁路问题"
            style={styles.sendButton}
            disabled={hasActive || input.trim().length === 0}
            onPress={() => void submit()}
          >
            <Text style={styles.sendButtonText}>{hasActive ? "回答中" : "提问"}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
