import { useMemo, type ReactNode } from "react";
import { Text, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { useSettings } from "@getpaseo/plugin/client";
import { btwSettingsDefinition, type ColorMode } from "../shared/settings";

type Segment = { text: string; bold: boolean; code: boolean; highlight: boolean };

type Block =
  | { kind: "p"; text: string }
  | { kind: "h"; level: number; text: string }
  | { kind: "code"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] };

const INLINE_PATTERN = /(\*\*[^*]+\*\*|==[^=]+==|`[^`]+`)/g;

function parseInline(text: string): Segment[] {
  const parts = text.split(INLINE_PATTERN).filter((part) => part.length > 0);
  return parts.map((part) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return { text: part.slice(2, -2), bold: true, code: false, highlight: false };
    }
    if (part.startsWith("==") && part.endsWith("==") && part.length > 4) {
      return { text: part.slice(2, -2), bold: false, code: false, highlight: true };
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return { text: part.slice(1, -1), bold: false, code: true, highlight: false };
    }
    return { text: part, bold: false, code: false, highlight: false };
  });
}

function withAlpha(hex: string | undefined, alpha: number, fallback: string): string {
  if (!hex || hex.charCodeAt(0) !== 35) return fallback;
  const body = hex.slice(1);
  const expanded =
    body.length === 3
      ? body
          .split("")
          .map((char) => char + char)
          .join("")
      : body;
  if (expanded.length !== 6 || /[^0-9a-fA-F]/.test(expanded)) return fallback;
  const red = parseInt(expanded.slice(0, 2), 16);
  const green = parseInt(expanded.slice(2, 4), 16);
  const blue = parseInt(expanded.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let paragraph: string[] = [];
  let codeLines: string[] | null = null;
  let list: { kind: "ul" | "ol"; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: "p", text: paragraph.join("\n") });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push({ kind: list.kind, items: list.items });
      list = null;
    }
  };

  for (const line of lines) {
    if (codeLines !== null) {
      if (/^```/.test(line.trim())) {
        blocks.push({ kind: "code", text: codeLines.join("\n") });
        codeLines = null;
      } else {
        codeLines.push(line);
      }
      continue;
    }
    const fence = line.trim().match(/^```(\w*)/);
    if (fence) {
      flushParagraph();
      flushList();
      codeLines = [];
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ kind: "h", level: heading[1].length, text: heading[2] });
      continue;
    }
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    if (ul) {
      flushParagraph();
      if (!list || list.kind !== "ul") {
        flushList();
        list = { kind: "ul", items: [] };
      }
      list.items.push(ul[1]);
      continue;
    }
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ol) {
      flushParagraph();
      if (!list || list.kind !== "ol") {
        flushList();
        list = { kind: "ol", items: [] };
      }
      list.items.push(ol[1]);
      continue;
    }
    if (line.trim().length === 0) {
      flushParagraph();
      flushList();
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  if (codeLines !== null && codeLines.length > 0) {
    blocks.push({ kind: "code", text: codeLines.join("\n") });
  }
  flushParagraph();
  flushList();
  return blocks;
}

function resolveColor(mode: ColorMode, theme: PluginTheme, fallback: string): string {
  switch (mode) {
    case "accent":
      return theme.colors.accent ?? fallback;
    case "muted":
      return theme.colors.foregroundMuted;
    case "success":
      return theme.colors.statusSuccess;
    case "warning":
      return theme.colors.statusWarning;
    case "danger":
      return theme.colors.statusDanger;
    default:
      return fallback;
  }
}

function InlineText({
  text,
  baseStyle,
  boldColor,
  highlightColor,
  highlightBgColor,
  surface,
}: {
  text: string;
  baseStyle: { color: string; fontSize: number };
  boldColor?: string;
  highlightColor: string;
  highlightBgColor: string;
  surface: string;
}) {
  const segments = useMemo(() => parseInline(text), [text]);
  return (
    <Text>
      {segments.map((segment, index) => (
        <Text
          key={index}
          style={
            segment.highlight
              ? {
                  ...baseStyle,
                  color: highlightColor,
                  backgroundColor: withAlpha(highlightBgColor, 0.22, surface),
                }
              : segment.code
                ? { ...baseStyle, fontFamily: "monospace", color: baseStyle.color }
                : segment.bold
                  ? { ...baseStyle, color: boldColor ?? baseStyle.color, fontWeight: "700" as const }
                  : baseStyle
          }
        >
          {segment.text}
        </Text>
      ))}
    </Text>
  );
}

export function MarkdownView({ markdown, theme, compact }: { markdown: string; theme: PluginTheme; compact: boolean }) {
  const settings = useSettings(btwSettingsDefinition);
  const savedColors = settings.status === "ready" ? settings.values : null;
  const headingColor = resolveColor(savedColors?.headingColor ?? "default", theme, theme.colors.foreground);
  const boldColor = resolveColor(savedColors?.boldColor ?? "default", theme, theme.colors.foreground);
  const highlightColor = resolveColor(
    savedColors?.highlightColor ?? "default",
    theme,
    theme.colors.foreground,
  );
  const highlightBgColor = resolveColor(
    savedColors?.highlightBgColor ?? "accent",
    theme,
    theme.colors.accent ?? theme.colors.foreground,
  );

  const styles = useMemo(() => {
    const bodySize = compact ? 13 : 14;
    return {
      body: { color: theme.colors.foreground, fontSize: bodySize, lineHeight: bodySize * 1.55 },
      codeBlock: {
        backgroundColor: theme.colors.surface1,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
        padding: 10,
        marginVertical: 6,
      },
      codeText: { color: theme.colors.foreground, fontFamily: "monospace", fontSize: bodySize - 1 },
      h1: { color: headingColor, fontSize: bodySize + 6, fontWeight: "700" as const, marginTop: 8, marginBottom: 4 },
      h2: { color: headingColor, fontSize: bodySize + 4, fontWeight: "700" as const, marginTop: 8, marginBottom: 4 },
      h3: { color: headingColor, fontSize: bodySize + 2, fontWeight: "700" as const, marginTop: 6, marginBottom: 3 },
      h4: { color: headingColor, fontSize: bodySize + 1, fontWeight: "700" as const, marginTop: 6, marginBottom: 3 },
      listItem: { color: theme.colors.foreground, fontSize: bodySize, lineHeight: bodySize * 1.55, marginLeft: 12, marginTop: 2 },
      paragraph: { marginTop: 2, marginBottom: 6 },
    };
  }, [theme, compact, headingColor]);

  const blocks = useMemo(() => parseBlocks(markdown), [markdown]);

  const renderBlock = (block: Block, index: number): ReactNode => {
    switch (block.kind) {
      case "code":
        return (
          <View key={index} style={styles.codeBlock}>
            <Text style={styles.codeText}>{block.text}</Text>
          </View>
        );
      case "h": {
        const headingStyle =
          block.level === 1
            ? styles.h1
            : block.level === 2
              ? styles.h2
              : block.level === 3
                ? styles.h3
                : styles.h4;
        return (
          <Text key={index} style={headingStyle}>
            {block.text}
          </Text>
        );
      }
      case "ul":
        return (
          <View key={index}>
            {block.items.map((item, itemIndex) => (
              <Text key={itemIndex} style={styles.listItem}>
                •{" "}
                <InlineText text={item} baseStyle={styles.body} boldColor={boldColor} highlightColor={highlightColor} highlightBgColor={highlightBgColor} surface={theme.colors.surface1} />
              </Text>
            ))}
          </View>
        );
      case "ol":
        return (
          <View key={index}>
            {block.items.map((item, itemIndex) => (
              <Text key={itemIndex} style={styles.listItem}>
                {itemIndex + 1}.{" "}
                <InlineText text={item} baseStyle={styles.body} boldColor={boldColor} highlightColor={highlightColor} highlightBgColor={highlightBgColor} surface={theme.colors.surface1} />
              </Text>
            ))}
          </View>
        );
      default:
        return (
          <Text key={index} style={[styles.body, styles.paragraph]}>
            <InlineText text={block.text} baseStyle={styles.body} boldColor={boldColor} highlightColor={highlightColor} highlightBgColor={highlightBgColor} surface={theme.colors.surface1} />
          </Text>
        );
    }
  };

  return <View>{blocks.map(renderBlock)}</View>;
}
