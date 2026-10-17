import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const btwQuestionStatusSchema = z.enum(["pending", "running", "done", "error"]);

export const btwAsk = defineRpc({
  name: "btw.ask",
  input: z.object({
    agentId: z.string().min(1),
    question: z.string().trim().min(1).max(8000),
    model: z.string().min(1).max(200).optional(),
  }),
  output: z.object({ questionId: z.string() }),
});

export const btwQuestionSchema = z.object({
  id: z.string(),
  agentId: z.string(),
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
  name: "btw.status",
  input: z.object({ agentId: z.string().min(1) }),
  output: z.object({ questions: z.array(btwQuestionSchema) }),
});

export const btwClear = defineRpc({
  name: "btw.clear",
  input: z.object({ agentId: z.string().min(1) }),
  output: z.object({ cleared: z.number() }),
});

export type BtwQuestionStatus = z.infer<typeof btwQuestionStatusSchema>;
export type BtwQuestion = z.infer<typeof btwQuestionSchema>;
