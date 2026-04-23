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

  await logRunCreated({ runId, status: "in_progress", stage: "seed" });
  const seedSafety = await evaluateSafety(parsed.seed);
  await logRunEvent({
    runId,
    stage: "seed",
    decision: seedSafety.decision,
    reason: seedSafety.reason,
    metadata: {
      deterministicHits: seedSafety.deterministicHits,
      moderationCategories: seedSafety.moderation.categories,
      moderationScores: seedSafety.moderation.categoryScores
    }
  });

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
  const story = await generateStory(safeSeed);
  const storySafety = await evaluateSafety(`${story.title}\n${story.storyTemplate}`);

  await logRunEvent({
    runId,
    stage: "story",
    decision: storySafety.decision,
    reason: storySafety.reason,
    metadata: {
      moderationCategories: storySafety.moderation.categories,
      moderationScores: storySafety.moderation.categoryScores
    }
  });

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
    rewrittenSeed: seedSafety.rewrittenText
  };
}
