/** The language the side answer is written in, and its display name for the prompt. */
export interface ResponseLanguage {
  tag: string;
  name: string;
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  ja: "Japanese",
  zh: "Simplified Chinese",
  "zh-tw": "Traditional Chinese",
  ko: "Korean",
  fr: "French",
  de: "German",
  es: "Spanish",
  pt: "Portuguese",
  it: "Italian",
  ru: "Russian",
  ar: "Arabic",
  hi: "Hindi",
  th: "Thai",
  vi: "Vietnamese",
  id: "Indonesian",
  tr: "Turkish",
  nl: "Dutch",
  pl: "Polish",
  sv: "Swedish",
  uk: "Ukrainian",
};

/** `ja_JP.UTF-8` -> `ja`, `zh-Hant-TW` -> `zh-tw`, `C`/`POSIX` -> `en`. */
function normalizeTag(raw: string): string | undefined {
  const first = raw.split(":")[0]?.trim();
  if (!first) return undefined;
  const base = first.split(/[.@]/)[0]!.replace(/_/g, "-").toLowerCase();
  const [language, region] = base.split("-");
  if (!language || language === "c" || language === "posix") return "en";
  if (language === "zh") {
    return region !== undefined && ["tw", "hk", "mo", "hant"].includes(region) ? "zh-tw" : "zh";
  }
  return language;
}

function describe(tag: string): string {
  return LANGUAGE_NAMES[tag] ?? `the language with locale tag "${tag}"`;
}

/**
 * Picks the language for the answer. An explicit `PASEO_SIDECHAT_LANGUAGE`
 * wins, then the locale the client app reported (the app's language), then the
 * daemon's own environment locale, then English. Reading the environment here
 * keeps the panel, the `/btw` command and any future caller consistent.
 */
export function resolveResponseLanguage(
  preferred?: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): ResponseLanguage {
  const firstLanguage = env.LANGUAGE?.split(":")[0];
  const candidates = [
    env.PASEO_SIDECHAT_LANGUAGE,
    preferred,
    env.LC_ALL,
    env.LC_MESSAGES,
    env.LANG,
    firstLanguage,
  ];
  for (const candidate of candidates) {
    if (candidate === undefined) continue;
    const tag = normalizeTag(candidate);
    if (tag !== undefined) return { tag, name: describe(tag) };
  }
  return { tag: "en", name: LANGUAGE_NAMES.en! };
}
