import { z } from "zod";
export const sourceSchema = z.enum(["demo", "live"]);
export const seasonIdSchema = z.number().int().positive().max(100_000);
export const historyIdSchema = z.string().uuid();
export const historyCursorSchema = z.string().regex(/^[1-9]\d{0,19}$/);
export const nicknameSchema = z
  .string()
  .trim()
  .min(1, "닉네임을 입력해 주세요.")
  .max(32, "닉네임은 32자 이내로 입력해 주세요.")
  .refine(
    (s) => !/[\u0000-\u001f\u007f]/.test(s),
    "올바른 닉네임을 입력해 주세요.",
  );
export const reviewRequestSchema = z
  .object({
    nickname: nicknameSchema,
    source: sourceSchema,
    codexTest: z.boolean().default(false),
    seasonId: seasonIdSchema.optional(),
    historyId: historyIdSchema.optional(),
    historyPages: z.number().int().positive().optional(),
    mode: z.enum(["all", "ranked", "normal"]).default("all"),
    character: z
      .string()
      .regex(/^(all|\d{1,6})$/)
      .default("all"),
    focus: z
      .enum(["overall", "combat", "survival", "character"])
      .default("overall"),
  })
  .strict()
  .refine((request) => Boolean(request.historyId) === (request.historyPages !== undefined), "조회한 전적 범위를 함께 전달해 주세요.");
export type ReviewRequest = z.infer<typeof reviewRequestSchema>;
