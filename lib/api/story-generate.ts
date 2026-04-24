import { z } from "zod";
import { evaluateSafety } from "@/lib/safety/decision";
import { generateStory } from "@/lib/story";
import { StoryGenerateResponse } from "@/lib/types";
import { assertRateLimit } from "@/lib/rate-limit";
import { logRunCreated, logRunEvent } from "@/lib/supabase";

const schema = z.object({
  seed: z.string().min(3).max(800),
  runId: z.string().uuid().optional()
});

export async function handleStoryGenerate(input: unknown, ip: string): Promise<StoryGenerateResponse> {
  assertRateLimit(`story-generate:${ip}`);
  const parsed = schema.parse(input);
  const runId = parsed.runId ?? crypto.randomUUID();

  void logRunCreated({ runId, status: "in_progress", stage: "seed" }).catch(() => {});
  const seedSafetyStartedAt = Date.now();
  const seedSafety = await evaluateSafety(parsed.seed);
  const seedSafetyDurationMs = Date.now() - seedSafetyStartedAt;
  void logRunEvent({
    runId,
    stage: "seed",
    decision: seedSafety.decision,
    reason: seedSafety.reason,
    metadata: {
      durationMs: seedSafetyDurationMs,
      deterministicHits: seedSafety.deterministicHits,
      moderationCategories: seedSafety.moderation.categories,
      moderationScores: seedSafety.moderation.categoryScores
    }
  }).catch(() => {});

  if (seedSafety.decision === "BLOCK") {
    return {
      title: "",
      storyTemplate: "",
      blanks: [],
      moderationDecision: "BLOCK",
      moderationReason: seedSafety.reason
    };
  }

  const safeSeed = seedSafety.rewrittenText ?? parsed.seed;
  const storyResult = await generateStory(safeSeed);
  const story = storyResult.story;
  const storySafetyStartedAt = Date.now();
  const storySafety = await evaluateSafety(`${story.title}\n${story.storyTemplate}`);
  const storySafetyDurationMs = Date.now() - storySafetyStartedAt;

  void logRunEvent({
    runId,
    stage: "story",
    decision: storySafety.decision,
    reason: storySafety.reason,
    metadata: {
      diagnostics: storyResult.diagnostics,
      durationMs: storySafetyDurationMs,
      moderationCategories: storySafety.moderation.categories,
      moderationScores: storySafety.moderation.categoryScores
    }
  }).catch(() => {});

  if (storySafety.decision === "BLOCK") {
    return {
      title: "",
      storyTemplate: "",
      blanks: [],
      moderationDecision: "BLOCK",
      moderationReason: "Generated story failed safety policy."
    };
  }

  return {
    ...story,
    moderationDecision: seedSafety.decision === "REWRITE" ? "REWRITE" : "ALLOW",
    moderationReason: seedSafety.reason,
    rewriteApplied: seedSafety.decision === "REWRITE",
    rewrittenSeed: seedSafety.rewrittenText,
    generationWarning: storyResult.diagnostics.fallbackUsed
      ? "Story generation fell back to a backup scaffold because the model output did not pass quality checks."
      : undefined,
    diagnostics: storyResult.diagnostics
  };
}
