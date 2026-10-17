import { type PluginSurfaceProps, useSettings } from "@getpaseo/plugin/client";
import { SettingsInput, SettingsSection, SettingsSelect, SettingsSwitch } from "@getpaseo/plugin/client/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { dictionaries, resolveLang } from "./i18n";
import { applyUiLanguage } from "./ui-registration";
import { btwSettingsDefinition, colorModeSchema, type ColorMode } from "../shared/settings";
import { MarkdownView } from "./markdown";

const COLOR_MODES: readonly ColorMode[] = ["default", "accent", "muted", "success", "warning", "danger"];

export function BtwSettingsScreen({ theme, layout }: PluginSurfaceProps) {
  const settings = useSettings(btwSettingsDefinition);
  const [idleText, setIdleText] = useState<string | null>(null);
  const [contextText, setContextText] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const values = settings.status === "ready" ? settings.values : null;
  const ready = settings.status === "ready";
  const uiLang = resolveLang(values?.language);
  const t = dictionaries[uiLang];
  const previewMarkdown = t.previewMarkdown;

  useEffect(() => {
    applyUiLanguage(uiLang);
  }, [uiLang]);

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

  const save = (patch: Partial<Record<"language" | "autoArchive" | "idleMinutes" | "contextMessages" | "attachToMain" | "headingColor" | "boldColor" | "highlightColor", unknown>>) => {
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
      options={COLOR_MODES.map((mode) => ({ label: t.colorModes[mode], value: mode }))}
      onValueChange={(value) => save({ [field]: value })}
      disabled={!ready}
    />
  );

  return (
    <View style={styles.screen}>
      <SettingsSection title={t.generalSection}>
        <SettingsSelect
          label={t.languageLabel}
          value={values?.language ?? "auto"}
          options={[
            { label: t.languageAuto, value: "auto" },
            { label: "中文", value: "zh" },
            { label: "English", value: "en" },
          ]}
          onValueChange={(value) => save({ language: value })}
          disabled={!ready}
        />
      </SettingsSection>
      <SettingsSection title={t.appearanceSection} info={t.appearanceInfo}>
        {colorSelect(t.headingColor, "headingColor")}
        {colorSelect(t.boldColor, "boldColor")}
        {colorSelect(t.highlightColor, "highlightColor")}
        <View>
          <Text style={styles.previewLabel}>{t.preview}</Text>
          <View style={styles.preview}>
            <MarkdownView markdown={previewMarkdown} theme={theme} compact={layout.compact} />
          </View>
        </View>
      </SettingsSection>
      <SettingsSection title={t.lifecycleSection} info={t.lifecycleInfo}>
        <SettingsSwitch
          label={t.attachSwitch}
          hint={t.attachHint}
          value={values?.attachToMain ?? true}
          onValueChange={(value) => save({ attachToMain: value })}
          disabled={!ready}
        />
        <SettingsSwitch
          label={t.autoArchiveSwitch}
          hint={t.autoArchiveHint}
          value={values?.autoArchive ?? false}
          onValueChange={(value) => save({ autoArchive: value })}
          disabled={!ready}
        />
        <SettingsInput
          label={t.idleMinutesLabel}
          hint={t.idleMinutesHint}
          initialValue={idleText ?? ""}
          onChangeText={(text) => {
            setIdleText(text);
            scheduleIntSave("idleMinutes", text, 1440);
          }}
          disabled={!ready || !(values?.autoArchive ?? false)}
        />
      </SettingsSection>
      <SettingsSection title={t.contextSection} info={t.contextInfo}>
        <SettingsInput
          label={t.contextMessagesLabel}
          hint={t.contextMessagesHint("1 - 50")}
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
