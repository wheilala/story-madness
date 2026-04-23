import { z } from "zod";
import { fillStoryTemplate, parseTokens } from "@/lib/story";
import { evaluateSafety } from "@/lib/safety/decision";
import { StoryRevealResponse } from "@/lib/types";
import { assertRateLimit } from "@/lib/rate-limit";
import { logRunEvent } from "@/lib/supabase";

const schema = z.object({
  runId: z.string().uuid().optional(),
  storyTemplate: z.string().min(20),
  fills: z.record(z.string().max(120))
});

export async function handleStoryReveal(input: unknown, ip: string): Promise<StoryRevealResponse> {
  assertRateLimit(`story-reveal:${ip}`, 50);
  const parsed = schema.parse(input);
  const runId = parsed.runId ?? crypto.randomUUID();

  const tokens = parseTokens(parsed.storyTemplate);
  for (const token of tokens) {
    const raw = parsed.fills[token] ?? "";
    const fillSafety = await evaluateSafety(raw);
    if (fillSafety.decision === "BLOCK") {
      await logRunEvent({
        runId,
        stage: "fill",
        decision: "BLOCK",
        reason: `Blocked fill for token ${token}`,
        metadata: { token }
      });
      return {
        revealedStory: "",
        moderationDecision: "BLOCK",
        moderationReason: `Unsafe fill word detected for ${token}.`
      };
    }
  }

  const revealedStory = fillStoryTemplate(parsed.storyTemplate, parsed.fills);
  const overallSafety = await evaluateSafety(revealedStory);

  await logRunEvent({
    runId,
    stage: "reveal",
    decision: overallSafety.decision,
    reason: overallSafety.reason
  });

  if (overallSafety.decision === "BLOCK") {
    return {
      revealedStory: "",
      moderationDecision: "BLOCK",
      moderationReason: "Revealed story failed safety policy."
    };
  }

  return {
    revealedStory,
    moderationDecision: overallSafety.decision,
    moderationReason: overallSafety.reason
  };
}
