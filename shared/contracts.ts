import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const btwQuestionStatusSchema = z.enum(["pending", "running", "done", "error"]);

export const btwModeSchema = z.enum(["advice", "work"]);
export type BtwMode = z.infer<typeof btwModeSchema>;

export const btwAsk = defineRpc({
  name: "sidechat.ask",
  input: z.object({
    agentId: z.string().min(1),
    question: z.string().trim().min(1).max(8000),
    model: z.string().min(1).max(200).optional(),
    mode: btwModeSchema.optional(),
    threadId: z.string().min(1).optional(),
  }),
  output: z.object({ questionId: z.string() }),
});

export const btwQuestionSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  threadId: z.string().nullable(),
  mode: btwModeSchema.default("advice"),
  question: z.string(),
  status: btwQuestionStatusSchema,
  answer: z.string(),
  error: z.string().nullable(),
  model: z.string().nullable(),
  startedAt: z.number(),
  finishedAt: z.number().nullable(),
  elapsedMs: z.number().nullable(),
});

export const btwStatus = defineRpc({
  name: "sidechat.status",
  input: z.object({ agentId: z.string().min(1) }),
  output: z.object({
    questions: z.array(btwQuestionSchema),
    openThreads: z.array(
      z.object({
        id: z.string(),
        mode: btwModeSchema,
        model: z.string().nullable(),
        firstQuestion: z.string(),
      }),
    ),
  }),
});

export const btwClear = defineRpc({
  name: "sidechat.clear",
  input: z.object({
    agentId: z.string().min(1),
    threadId: z.string().min(1).optional(),
  }),
  output: z.object({ cleared: z.number() }),
});

export type BtwQuestionStatus = z.infer<typeof btwQuestionStatusSchema>;
export type BtwQuestion = z.infer<typeof btwQuestionSchema>;
