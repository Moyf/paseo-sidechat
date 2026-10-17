import { Platform } from "react-native";

/** Reads the browser/Electron locale. Only call from web-gated code paths. */
export function webLocale(): string | null {
  if (Platform.OS !== "web") return null;
  try {
    return typeof navigator !== "undefined" ? (navigator.language ?? null) : null;
  } catch {
    return null;
  }
}
