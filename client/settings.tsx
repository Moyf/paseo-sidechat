import { type PluginSurfaceProps, useSettings, useTranslation } from "@getpaseo/plugin/client";
import { SettingsInput, SettingsSection, SettingsSelect, SettingsSwitch } from "@getpaseo/plugin/client/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { btwSettingsDefinition, colorModeSchema, type ColorMode } from "../shared/settings";
import { messages } from "./messages";
import { MarkdownView } from "./markdown";

const COLOR_MODES: readonly ColorMode[] = ["default", "accent", "muted", "success", "warning", "danger"];

export function BtwSettingsScreen({ theme, layout }: PluginSurfaceProps) {
  const settings = useSettings(btwSettingsDefinition);
  const { t } = useTranslation(messages);
  const [idleText, setIdleText] = useState<string | null>(null);
  const [contextText, setContextText] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const values = settings.status === "ready" ? settings.values : null;
  const ready = settings.status === "ready";
  const previewMarkdown = t("settings.previewMarkdown");

  useEffect(() => {
    if (ready && values) {
      setIdleText((current) => current ?? String(values.idleMinutes));
      setContextText((current) => current ?? String(values.contextMessages));
    }
  }, [ready, values]);

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

  const save = (patch: Partial<Record<"autoArchive" | "idleMinutes" | "contextMessages" | "attachToMain" | "headingColor" | "boldColor" | "highlightColor", unknown>>) => {
    if (!ready || !values) return;
    void settings.save({ ...values, ...patch } as typeof values, settings.revision);
  };

  const scheduleIntSave = (field: "idleMinutes" | "contextMessages", text: string, max: number) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const parsed = Number.parseInt(text, 10);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.min(max, Math.max(1, parsed));
    saveTimer.current = setTimeout(() => save({ [field]: clamped }), 600);
  };

  const colorSelect = (label: string, field: "headingColor" | "boldColor" | "highlightColor") => (
    <SettingsSelect
      label={label}
      value={values?.[field] ?? "default"}
      options={COLOR_MODES.map((mode) => ({ label: t(`settings.colorModes.${mode}`), value: mode }))}
      onValueChange={(value) => save({ [field]: value })}
      disabled={!ready}
    />
  );

  return (
    <View style={styles.screen}>
      <SettingsSection title={t("settings.appearanceSection")} info={t("settings.appearanceInfo")}>
        {colorSelect(t("settings.headingColor"), "headingColor")}
        {colorSelect(t("settings.boldColor"), "boldColor")}
        {colorSelect(t("settings.highlightColor"), "highlightColor")}
        <View>
          <Text style={styles.previewLabel}>{t("settings.preview")}</Text>
          <View style={styles.preview}>
            <MarkdownView markdown={previewMarkdown} theme={theme} compact={layout.compact} />
          </View>
        </View>
      </SettingsSection>
      <SettingsSection title={t("settings.lifecycleSection")} info={t("settings.lifecycleInfo")}>
        <SettingsSwitch
          label={t("settings.attachSwitch")}
          hint={t("settings.attachHint")}
          value={values?.attachToMain ?? true}
          onValueChange={(value) => save({ attachToMain: value })}
          disabled={!ready}
        />
        <SettingsSwitch
          label={t("settings.autoArchiveSwitch")}
          hint={t("settings.autoArchiveHint")}
          value={values?.autoArchive ?? false}
          onValueChange={(value) => save({ autoArchive: value })}
          disabled={!ready}
        />
        <SettingsInput
          label={t("settings.idleMinutesLabel")}
          hint={t("settings.idleMinutesHint")}
          initialValue={idleText ?? ""}
          onChangeText={(text) => {
            setIdleText(text);
            scheduleIntSave("idleMinutes", text, 1440);
          }}
          disabled={!ready || !(values?.autoArchive ?? false)}
        />
      </SettingsSection>
      <SettingsSection title={t("settings.contextSection")} info={t("settings.contextInfo")}>
        <SettingsInput
          label={t("settings.contextMessagesLabel")}
          hint={t("settings.contextMessagesHint", { range: "1 - 50" })}
          initialValue={contextText ?? ""}
          onChangeText={(text) => {
            setContextText(text);
            scheduleIntSave("contextMessages", text, 50);
          }}
          disabled={!ready}
        />
      </SettingsSection>
      {settings.saveError ? <Text style={styles.error}>{settings.saveError}</Text> : null}
    </View>
  );
}
