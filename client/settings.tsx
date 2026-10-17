import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useSettings } from "@getpaseo/plugin/client";
import { SettingsInput, SettingsSection, SettingsSelect, SettingsSwitch } from "@getpaseo/plugin/client/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { btwSettingsDefinition, colorModeLabel, colorModeSchema, type ColorMode } from "../shared/settings";
import { MarkdownView } from "./markdown";

const COLOR_MODE_OPTIONS = (
  colorModeSchema.options as readonly ColorMode[]
).map((mode) => ({ label: colorModeLabel(mode), value: mode }));

const PREVIEW_MARKDOWN = [
  "### 标题样式",
  "正文里可以有**加粗文字**、==高亮文字==和`行内代码`。",
  "- 列表项带**加粗**",
  "- 列表项带==高亮==",
].join("\n");

export function BtwSettingsScreen({ theme, layout }: PluginSurfaceProps) {
  const settings = useSettings(btwSettingsDefinition);
  const [idleText, setIdleText] = useState<string | null>(null);
  const [contextText, setContextText] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const values = settings.status === "ready" ? settings.values : null;
  const ready = settings.status === "ready";

  useEffect(() => {
    if (ready && values && idleText === null) {
      setIdleText(String(values.idleMinutes));
    }
    if (ready && values && contextText === null) {
      setContextText(String(values.contextMessages));
    }
  }, [ready, values, idleText, contextText]);

  const styles = useMemo(
    () => ({
      screen: {
        flex: 1,
        backgroundColor: theme.colors.surface0,
        padding: layout.compact ? 12 : 20,
        gap: 12,
      },
      error: { color: theme.colors.statusDanger, fontSize: layout.compact ? 12 : 13 },
      previewLabel: { color: theme.colors.foregroundMuted, fontSize: layout.compact ? 11 : 12, marginBottom: 4 },
      preview: {
        borderRadius: 10,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface0,
        padding: layout.compact ? 10 : 14,
      },
    }),
    [theme, layout.compact],
  );

  const save = (patch: Partial<Record<"autoArchive" | "idleMinutes" | "contextMessages" | "headingColor" | "boldColor" | "highlightColor", unknown>>) => {
    if (!ready || !values) return;
    void settings.save({ ...values, ...patch } as typeof values, settings.revision);
  };

  const scheduleIdleSave = (text: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const parsed = Number.parseInt(text, 10);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.min(1440, Math.max(1, parsed));
    saveTimer.current = setTimeout(() => save({ idleMinutes: clamped }), 600);
  };

  const scheduleContextSave = (text: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const parsed = Number.parseInt(text, 10);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.min(50, Math.max(1, parsed));
    saveTimer.current = setTimeout(() => save({ contextMessages: clamped }), 600);
  };

  const colorSelect = (label: string, field: "headingColor" | "boldColor" | "highlightColor") => (
    <SettingsSelect
      label={label}
      value={values?.[field] ?? "default"}
      options={COLOR_MODE_OPTIONS}
      onValueChange={(value) => save({ [field]: value as ColorMode })}
      disabled={!ready}
    />
  );

  return (
    <View style={styles.screen}>
      <SettingsSection title="回答外观" info="只影响 btw 面板里的回答渲染，实时生效">
        {colorSelect("标题颜色", "headingColor")}
        {colorSelect("加粗颜色", "boldColor")}
        {colorSelect("高亮颜色", "highlightColor")}
        <View>
          <Text style={styles.previewLabel}>预览</Text>
          <View style={styles.preview}>
            <MarkdownView markdown={PREVIEW_MARKDOWN} theme={theme} compact={layout.compact} />
          </View>
        </View>
      </SettingsSection>
      <SettingsSection title="线程回收" info="btw 线程是同一会话的连续多轮问答">
        <SettingsSwitch
          label="闲置后自动归档线程"
          hint="关闭时线程一直保留，直到清除记录或重载插件"
          value={values?.autoArchive ?? false}
          onValueChange={(value) => save({ autoArchive: value })}
          disabled={!ready}
        />
        <SettingsInput
          label="闲置回收时长（分钟）"
          hint="1 到 1440 之间的整数"
          initialValue={idleText ?? ""}
          onChangeText={(text) => {
            setIdleText(text);
            scheduleIdleSave(text);
          }}
          disabled={!ready || !(values?.autoArchive ?? false)}
        />
      </SettingsSection>
      <SettingsSection title="主会话上下文" info="新线程会读取主会话最近的对话作为背景">
        <SettingsInput
          label="上下文消息条数"
          hint="1 到 50 之间的整数，默认 8；超长消息另有 12000 字符总量上限"
          initialValue={contextText ?? ""}
          onChangeText={(text) => {
            setContextText(text);
            scheduleContextSave(text);
          }}
          disabled={!ready}
        />
      </SettingsSection>
      {settings.saveError ? <Text style={styles.error}>{settings.saveError}</Text> : null}
    </View>
  );
}
