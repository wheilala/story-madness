import { z } from "zod";
import { assertRateLimit } from "@/lib/rate-limit";
import { evaluateSafety } from "@/lib/safety/decision";
import { buildColoringPagePrompt, COLORING_PROMPT_VERSION, generateColoringImageBase64 } from "@/lib/image";
import { ImageGenerateResponse } from "@/lib/types";
import { logRunEvent } from "@/lib/supabase";

const schema = z.object({
  runId: z.string().uuid().optional(),
  seed: z.string().min(3),
  storyTemplate: z.string().min(20)
});

export async function handleImageGenerate(input: unknown, ip: string): Promise<ImageGenerateResponse> {
  assertRateLimit(`image-generate:${ip}`, 15);
  const parsed = schema.parse(input);
  const runId = parsed.runId ?? crypto.randomUUID();

  const safety = await evaluateSafety(`${parsed.seed}\n${parsed.storyTemplate}`);
  if (safety.decision === "BLOCK") {
    await logRunEvent({
      runId,
      stage: "image-prompt",
      decision: "BLOCK",
      reason: safety.reason
    });
    return {
      promptVersion: COLORING_PROMPT_VERSION,
      moderationDecision: "BLOCK",
      moderationReason: "Image prompt failed safety policy."
    };
  }

  const prompt = buildColoringPagePrompt(parsed.seed, parsed.storyTemplate);
  const promptSafety = await evaluateSafety(prompt);
  if (promptSafety.decision === "BLOCK") {
    return {
      promptVersion: COLORING_PROMPT_VERSION,
      moderationDecision: "BLOCK",
      moderationReason: "Coloring prompt blocked by moderation."
    };
  }

  const imageBase64 = await generateColoringImageBase64(prompt);
  await logRunEvent({
    runId,
    stage: "image",
    decision: "ALLOW",
    reason: "Coloring page generated."
  });

  return {
    imageBase64,
    promptVersion: COLORING_PROMPT_VERSION,
    moderationDecision: "ALLOW",
    moderationReason: "Coloring page generated."
  };
}
