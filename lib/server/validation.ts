import { z } from "zod";
export const sourceSchema = z.enum(["demo", "live"]);
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
    mode: z.enum(["all", "ranked", "normal"]).default("all"),
    character: z
      .string()
      .regex(/^(all|\d{1,6})$/)
      .default("all"),
    focus: z
      .enum(["overall", "combat", "survival", "character"])
      .default("overall"),
  })
  .strict();
export type ReviewRequest = z.infer<typeof reviewRequestSchema>;
