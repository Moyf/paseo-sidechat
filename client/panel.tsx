import type { PluginAgentPanelProps } from "@getpaseo/plugin/client";
import { useAgent, usePaseo, useRpc, useSettings } from "@getpaseo/plugin/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { btwAsk, btwClear, btwStatus, type BtwMode, type BtwQuestion } from "../shared/contracts";
import { btwSettingsDefinition } from "../shared/settings";
import { dictionaries, resolveLang } from "./i18n";
import { applyUiLanguage } from "./ui-registration";
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
  const settingsState = useSettings(btwSettingsDefinition);
  const uiLang = resolveLang(settingsState.status === "ready" ? settingsState.values.language : null);
  const t = dictionaries[uiLang];

  useEffect(() => {
    applyUiLanguage(uiLang);
  }, [uiLang]);

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
  const [modelQuery, setModelQuery] = useState("");
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [askMode, setAskMode] = useState<BtwMode>("advice");
  const [replyTarget, setReplyTarget] = useState<string | null>(null);
  const [openThreads, setOpenThreads] = useState<Array<{ id: string; mode: BtwMode; model: string | null; firstQuestion: string }>>([]);
  const [now, setNow] = useState(() => Date.now());
  const scrollRef = useRef<ScrollView>(null);

  const hasActive = questions.some((q) => q.status === "pending" || q.status === "running");

  const filteredModels = useMemo(() => {
    const query = modelQuery.trim().toLowerCase();
    if (!query) return models;
    return models.filter(
      (model) => model.label.toLowerCase().includes(query) || model.id.toLowerCase().includes(query),
    );
  }, [models, modelQuery]);

  const refresh = useCallback(async () => {
    try {
      const result = await statusRpc({ agentId });
      setQuestions(result.questions);
      setOpenThreads(result.openThreads);
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
    if (replyTarget && !openThreads.some((thread) => thread.id === replyTarget)) {
      setReplyTarget(null);
    }
  }, [openThreads, replyTarget]);

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
      threadDivider: {
        color: theme.colors.foregroundMuted,
        fontSize: layout.compact ? 10 : 11,
        marginTop: 10,
        textAlign: "center" as const,
      },
      metaRow: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        justifyContent: "space-between" as const,
      },
      openThreadText: { color: theme.colors.accent, fontSize: layout.compact ? 10 : 11 },
      replyActiveText: { fontWeight: "700" as const },
      metaActions: { flexDirection: "row" as const, alignItems: "center" as const, gap: 10 },
      headerTarget: { color: theme.colors.foregroundMuted, fontSize: layout.compact ? 10 : 11 },
      headerTargetActive: { color: theme.colors.accent, fontSize: layout.compact ? 10 : 11 },
      targetRow: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        justifyContent: "space-between" as const,
        gap: 8,
      },
      targetChip: {
        flexShrink: 1,
        minWidth: 0,
        borderRadius: 7,
        borderWidth: 1,
        borderColor: theme.colors.border,
        paddingHorizontal: 8,
        paddingVertical: 4,
      },
      footer: { borderTopWidth: 1, borderColor: theme.colors.border, paddingHorizontal: pad, paddingTop: 8, paddingBottom: 10, gap: 6 },
      liveStrip: {
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 8,
        backgroundColor: theme.colors.surface1,
        padding: 8,
        gap: 3,
      },
      liveQuestion: {
        color: theme.colors.foregroundMuted,
        fontSize: layout.compact ? 11 : 12,
        fontWeight: "700" as const,
      },
      liveAnswer: { color: theme.colors.foreground, fontSize: layout.compact ? 12 : 13 },
      liveStatus: { color: theme.colors.foregroundMuted, fontSize: layout.compact ? 11 : 12 },
      modelRow: {
        flexDirection: "row" as const,
        flexWrap: "wrap" as const,
        alignItems: "center" as const,
        justifyContent: "space-between" as const,
        gap: 8,
      },
      modelButton: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 6,
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: 6,
        backgroundColor: theme.colors.surface1,
        flexShrink: 1,
        minWidth: 0,
      },
      modelButtonText: { color: theme.colors.foreground, fontSize: layout.compact ? 11 : 12 },
      modelValueText: { flexShrink: 1 },
      modelCaret: { color: theme.colors.foregroundMuted, fontSize: layout.compact ? 11 : 12 },
      pickerAnchor: { position: "relative" as const, marginTop: 6 },
      modelPopover: {
        position: "absolute" as const,
        left: 0,
        right: 0,
        bottom: "100%" as const,
        marginBottom: 6,
        maxHeight: 250,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface0,
        padding: 6,
        gap: 6,
        zIndex: 20,
        elevation: 8,
        shadowColor: "#000",
        shadowOpacity: 0.25,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
      },
      backdrop: { position: "absolute" as const, top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 },
      modelList: { maxHeight: 180 },
      modelOption: { paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, borderColor: theme.colors.border },
      modelOptionText: { color: theme.colors.foreground, fontSize: layout.compact ? 12 : 13 },
      modelOptionSub: { color: theme.colors.foregroundMuted, fontSize: layout.compact ? 10 : 11 },
      modelSearch: {
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface1,
        color: theme.colors.foreground,
        paddingHorizontal: 10,
        paddingVertical: 6,
        fontSize: layout.compact ? 12 : 13,
      },
      modelNoResults: {
        color: theme.colors.foregroundMuted,
        fontSize: layout.compact ? 11 : 12,
        padding: 10,
        textAlign: "center" as const,
      },
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
        borderRadius: 7,
        borderWidth: 1,
        borderColor: theme.colors.border,
        paddingHorizontal: 8,
        paddingVertical: 4,
        flexShrink: 0,
      },
      clearButtonText: { color: theme.colors.foregroundMuted, fontSize: layout.compact ? 11 : 12 },
      modeSwitch: {
        flexDirection: "row" as const,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
        overflow: "hidden" as const,
        flexShrink: 0,
      },
      modeOption: { paddingHorizontal: 7, paddingVertical: 4 },
      modeOptionActive: { backgroundColor: theme.colors.accent },
      modeOptionText: { color: theme.colors.foregroundMuted, fontSize: layout.compact ? 11 : 12 },
      modeOptionTextActive: { color: theme.colors.accentForeground, fontWeight: "700" as const },
    };
  }, [theme, layout.compact]);

  const submit = useCallback(async () => {
    const question = input.trim();
    if (!question) return;
    setInput("");
    setAskError(null);
    try {
      await askRpc({
        agentId,
        question,
        model: selectedModel ?? undefined,
        mode: askMode,
        threadId: replyTarget ?? undefined,
      });
      await refresh();
    } catch (error) {
      setAskError(error instanceof Error ? error.message : String(error));
      setInput(question);
    }
  }, [input, askRpc, agentId, selectedModel, askMode, replyTarget, refresh]);

  const clear = useCallback(async () => {
    const targetThreadId =
      replyTarget ?? openThreads.find((thread) => thread.mode === askMode)?.id ?? null;
    if (!targetThreadId) return;
    setAskError(null);
    if (replyTarget === targetThreadId) setReplyTarget(null);
    try {
      await clearRpc({ agentId, threadId: targetThreadId });
      await refresh();
    } catch (error) {
      setAskError(error instanceof Error ? error.message : String(error));
    }
  }, [clearRpc, agentId, refresh, replyTarget, askMode, openThreads]);

  const agentTitle = agent?.title ?? agentId;
  const providerLabel = agent ? `${agent.provider}${agent.model ? ` / ${agent.model}` : ""}` : "";
  const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);
  const lane = openThreads.find((thread) => thread.mode === askMode);
  const activeQuestion = [...questions]
    .reverse()
    .find((q) => q.status === "pending" || q.status === "running");
  // target/active reflect the thread's latest turn so shared-thread rows stay consistent
  const replyTargetEntry = replyTarget
    ? [...questions].reverse().find((q) => q.threadId === replyTarget)
    : null;
  const replyActiveId = replyTargetEntry?.id ?? null;
  // thread action buttons render only on each thread's latest turn
  const lastIdByThread = new Map<string, string>();
  for (const q of questions) {
    if (q.threadId) lastIdByThread.set(q.threadId, q.id);
  }
  const pickedModel = selectedModel ?? agent?.model ?? "";
  let targetLine: string;
  if (replyTarget) {
    targetLine = t.targetReply(clip(replyTargetEntry?.question ?? "", 26));
  } else if (!lane) {
    targetLine = t.targetNew;
  } else if ((lane.model ?? "") !== pickedModel) {
    targetLine = t.targetNewModel;
  } else {
    targetLine = t.targetContinue(clip(lane.firstQuestion, 26));
  }
  const selectedModelLabel = selectedModel
    ? (models.find((m) => m.id === selectedModel)?.label ?? selectedModel)
    : agent?.model ?? t.sessionDefault;

  return (
    <View style={styles.screen}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t.openMainA11y(agentTitle)}
        disabled={!navigation}
        onPress={() => navigation?.openAgent({ agentId })}
        style={styles.header}
      >
        <Text style={styles.headerTitle}>
          {t.headerPrefix} · {agentTitle}
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
            {t.emptyState}
          </Text>
        ) : (
          questions.map((question, index) => (
            <View key={question.id} style={styles.item}>
              {index > 0 &&
              question.threadId &&
              questions[index - 1].threadId !== question.threadId ? (
                <Text style={styles.threadDivider}>{t.threadDivider}</Text>
              ) : null}
              <Text style={styles.questionText}>{question.question}</Text>
              {question.status === "pending" ? (
                <Text style={styles.statusText}>{t.queued}</Text>
              ) : question.status === "running" ? (
                <Text style={styles.statusText}>
                  {t.thinking(formatElapsed(question.startedAt, question.finishedAt, now))}
                </Text>
              ) : question.status === "error" ? (
                <Text style={styles.errorText}>{t.errorPrefix}{question.error ?? "?"}</Text>
              ) : null}
              {question.answer.length > 0 ? (
                <MarkdownView markdown={question.answer} theme={theme} compact={layout.compact} />
              ) : null}
              <View style={styles.metaRow}>
                <Text style={styles.metaText}>
                  {question.mode === "work" ? `${t.workBadge} · ` : ""}
                  {question.model ?? "?"}
                  {question.elapsedMs != null ? ` · ${(question.elapsedMs / 1000).toFixed(1)}s` : ""}
                </Text>
                {question.threadId && lastIdByThread.get(question.threadId) === question.id ? (
                  <View style={styles.metaActions}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t.replyA11y}
                      onPress={() => {
                        setReplyTarget(question.threadId ?? null);
                        setAskMode(question.mode);
                      }}
                    >
                      <Text
                        style={[
                          styles.openThreadText,
                          replyActiveId === question.id && styles.replyActiveText,
                        ]}
                      >
                        {replyActiveId === question.id ? t.replyActive : t.reply}
                      </Text>
                    </Pressable>
                    {navigation ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t.openThreadA11y}
                        onPress={() => {
                          if (question.threadId) {
                            navigation.openAgent({ agentId: question.threadId });
                          }
                        }}
                      >
                        <Text style={styles.openThreadText}>{t.openThread}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <View style={styles.footer}>
        {activeQuestion ? (
          <View style={styles.liveStrip}>
            <Text style={styles.liveQuestion} numberOfLines={1}>
              {clip(activeQuestion.question, 80)}
            </Text>
            {activeQuestion.answer.trim().length > 0 ? (
              <Text style={styles.liveAnswer} numberOfLines={3}>
                {activeQuestion.answer}
              </Text>
            ) : (
              <Text style={styles.liveStatus}>
                {activeQuestion.status === "pending"
                  ? t.queued
                  : t.thinking(formatElapsed(activeQuestion.startedAt, activeQuestion.finishedAt, now))}
              </Text>
            )}
          </View>
        ) : null}
        <View style={styles.targetRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.targetResetA11y}
            disabled={!replyTarget}
            onPress={() => setReplyTarget(null)}
            style={styles.targetChip}
          >
            <Text numberOfLines={1} style={replyTarget ? styles.headerTargetActive : styles.headerTarget}>
              {targetLine}
              {replyTarget ? " ✕" : ""}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.clearA11y}
            style={styles.clearButton}
            disabled={!replyTarget && !openThreads.some((thread) => thread.mode === askMode)}
            onPress={() => void clear()}
          >
            <Text style={styles.clearButtonText}>{t.clear}</Text>
          </Pressable>
        </View>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder={t.inputPlaceholder}
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
            accessibilityLabel={t.sendA11y}
            style={styles.sendButton}
            disabled={hasActive || input.trim().length === 0}
            onPress={() => void submit()}
          >
            <Text style={styles.sendButtonText}>{hasActive ? t.sending : t.send}</Text>
          </Pressable>
        </View>

        <View style={styles.pickerAnchor}>
          <View style={styles.modelRow}>
          <View style={styles.modeSwitch}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.modeAskA11y}
              style={[styles.modeOption, askMode === "advice" && styles.modeOptionActive]}
              onPress={() => setAskMode("advice")}
            >
              <Text style={[styles.modeOptionText, askMode === "advice" && styles.modeOptionTextActive]}>
                {t.modeAsk}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.modeWorkA11y}
              style={[styles.modeOption, askMode === "work" && styles.modeOptionActive]}
              onPress={() => setAskMode("work")}
            >
              <Text style={[styles.modeOptionText, askMode === "work" && styles.modeOptionTextActive]}>
                {t.modeWork}
              </Text>
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.modelLabel.trim()}
            style={styles.modelButton}
            onPress={() => {
              if (!modelPickerOpen) setModelQuery("");
              setModelPickerOpen(!modelPickerOpen);
            }}
          >
            <Text style={styles.modelButtonText}>{t.modelLabel}</Text>
            <Text
              numberOfLines={1}
              ellipsizeMode="middle"
              style={[styles.modelButtonText, styles.modelValueText]}
            >
              {selectedModelLabel}
            </Text>
            <Text style={styles.modelCaret}>{modelPickerOpen ? "▲" : "▼"}</Text>
          </Pressable>
          </View>

          {modelPickerOpen ? (
            <View style={styles.modelPopover}>
            <TextInput
              style={styles.modelSearch}
              value={modelQuery}
              onChangeText={setModelQuery}
              placeholder={t.modelSearchPlaceholder}
              placeholderTextColor={theme.colors.foregroundMuted}
              autoCorrect={false}
              autoCapitalize="none"
              autoFocus
            />
            <ScrollView
              style={styles.modelList}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
            >
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
                  {t.followMain(agent?.model ?? "")}
                </Text>
              </Pressable>
              {filteredModels.map((model) => (
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
              {filteredModels.length === 0 ? (
                <Text style={styles.modelNoResults}>{t.modelNoResults}</Text>
              ) : null}
            </ScrollView>
            </View>
          ) : null}
        </View>

        {askError ? <Text style={styles.errorText}>{askError}</Text> : null}
      </View>

      {modelPickerOpen ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.modelDismissA11y}
          style={styles.backdrop}
          onPress={() => setModelPickerOpen(false)}
        />
      ) : null}
    </View>
  );
}
