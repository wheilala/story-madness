import { z } from "zod";
import { fillStoryTemplate, parseTokens } from "@/lib/story";
import { evaluateSafety } from "@/lib/safety/decision";
import { StoryRevealResponse } from "@/lib/types";
import { assertRateLimit } from "@/lib/rate-limit";
import { logRunEvent } from "@/lib/supabase";
import { evaluateRevealLint, retainRevealLintRecord } from "@/lib/reveal-lint";

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
  const fillKeys = Object.keys(parsed.fills);
  const missingTokens = tokens.filter((token) => !(token in parsed.fills) || !parsed.fills[token]?.trim());
  const extraTokens = fillKeys.filter((token) => !tokens.includes(token));

  if (missingTokens.length > 0) {
    return {
      revealedStory: "",
      moderationDecision: "BLOCK",
      moderationReason: `Missing fill words for: ${missingTokens.join(", ")}.`
    };
  }

  if (extraTokens.length > 0) {
    return {
      revealedStory: "",
      moderationDecision: "BLOCK",
      moderationReason: `Unexpected fill keys provided: ${extraTokens.join(", ")}.`
    };
  }

  const fillSafetyStartedAt = Date.now();
  const fillSafetyResults = await Promise.all(
    tokens.map(async (token) => ({
      token,
      evaluation: await evaluateSafety(parsed.fills[token] ?? "")
    }))
  );
  const fillSafetyDurationMs = Date.now() - fillSafetyStartedAt;

  const blockedFill = fillSafetyResults.find((result) => result.evaluation.decision === "BLOCK");
  if (blockedFill) {
    void logRunEvent({
      runId,
      stage: "fill",
      decision: "BLOCK",
      reason: `Blocked fill for token ${blockedFill.token}`,
      metadata: { token: blockedFill.token, durationMs: fillSafetyDurationMs }
    }).catch(() => {});
    return {
      revealedStory: "",
      moderationDecision: "BLOCK",
      moderationReason: `Unsafe fill word detected for ${blockedFill.token}.`
    };
  }

  const revealedStory = fillStoryTemplate(parsed.storyTemplate, parsed.fills);
  const lint = evaluateRevealLint({
    storyTemplate: parsed.storyTemplate,
    fills: parsed.fills,
    revealedStory
  });
  const revealSafetyStartedAt = Date.now();
  const overallSafety = await evaluateSafety(revealedStory);
  const revealSafetyDurationMs = Date.now() - revealSafetyStartedAt;
  let retainedLogPath: string | undefined;
  try {
    retainedLogPath = await retainRevealLintRecord({
      runId,
      storyTemplate: parsed.storyTemplate,
      revealedStory,
      fills: parsed.fills,
      lint
    });
  } catch {
    retainedLogPath = undefined;
  }

  void logRunEvent({
    runId,
    stage: "reveal",
    decision: overallSafety.decision,
    reason: overallSafety.reason,
    metadata: {
      fillSafetyDurationMs,
      revealSafetyDurationMs,
      lintIssueCount: lint.issueCount,
      lintCategoryCounts: lint.categoryCounts,
      lintIssues: lint.issues.slice(0, 8),
      retainedLogPath: retainedLogPath ?? null
    }
  }).catch(() => {});

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
    moderationReason: overallSafety.reason,
    lint: {
      ...lint,
      retainedLogPath
    }
  };
}
