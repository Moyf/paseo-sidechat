import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const colorModeSchema = z.enum(["default", "accent", "muted", "success", "warning", "danger"]);
export type ColorMode = z.infer<typeof colorModeSchema>;

export const btwSettingsDefinition = defineSettings({
  id: "btw-settings",
  scope: "host",
  version: 5,
  schema: z.object({
    autoArchive: z.boolean().default(false),
    idleMinutes: z.number().int().min(1).max(1440).default(10),
    contextMessages: z.number().int().min(1).max(50).default(8),
    attachToMain: z.boolean().default(true),
    headingColor: colorModeSchema.default("default"),
    boldColor: colorModeSchema.default("default"),
    highlightColor: colorModeSchema.default("default"),
    highlightBgColor: colorModeSchema.default("accent"),
  }),
  migrate: (values) => values,
});

export type BtwSettings = z.infer<typeof btwSettingsDefinition.schema>;
