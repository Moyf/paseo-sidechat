import { defineTranslations } from "@getpaseo/plugin/client";
import en from "./locales/en.json";
import zhCN from "./locales/zh-CN.json";

/**
 * Plugin translations: labels follow the app's language and update mounted UI
 * live when it changes. English is the fallback resource; zh-CN may omit keys.
 */
export const messages = defineTranslations({ resources: { en, "zh-CN": zhCN } });
