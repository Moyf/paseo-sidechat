import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const colorModeSchema = z.enum(["default", "accent", "muted", "success", "warning", "danger"]);
export type ColorMode = z.infer<typeof colorModeSchema>;

export const btwSettingsDefinition = defineSettings({
  id: "btw-settings",
  scope: "host",
  version: 2,
  schema: z.object({
    autoArchive: z.boolean().default(false),
    idleMinutes: z.number().int().min(1).max(1440).default(10),
    headingColor: colorModeSchema.default("default"),
    boldColor: colorModeSchema.default("default"),
    highlightColor: colorModeSchema.default("accent"),
  }),
  migrate: (values) => values,
});

export type BtwSettings = z.infer<typeof btwSettingsDefinition.schema>;

export function colorModeLabel(mode: ColorMode): string {
  switch (mode) {
    case "default":
      return "跟随主题";
    case "accent":
      return "强调色";
    case "muted":
      return "弱化色";
    case "success":
      return "成功绿";
    case "warning":
      return "警示黄";
    case "danger":
      return "危险红";
  }
}
