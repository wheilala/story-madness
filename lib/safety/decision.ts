import { BLOCK_CATEGORIES, REWRITE_SCORE_THRESHOLDS } from "@/lib/safety/config";
import { applySoftReplacements, normalizeForSafety } from "@/lib/safety/normalize";
import { moderateText } from "@/lib/safety/moderate";
import { findDeterministicHits } from "@/lib/safety/word-filter";
import { SafetyEvaluation } from "@/lib/types";

function shouldRewriteByScore(scores: Record<string, number>): boolean {
  for (const [category, threshold] of Object.entries(REWRITE_SCORE_THRESHOLDS)) {
    const score = scores[category];
    if (typeof score === "number" && score >= threshold) return true;
  }
  return false;
}

function hasBlockedCategory(categories: Record<string, boolean>): boolean {
  for (const [category, value] of Object.entries(categories)) {
    if (value && BLOCK_CATEGORIES.has(category)) return true;
  }
  return false;
}

export async function evaluateSafety(input: string): Promise<SafetyEvaluation> {
  const normalizedText = normalizeForSafety(input);
  const deterministicHits = findDeterministicHits(input);
  const softened = applySoftReplacements(input);
  const moderation = await moderateText(input);

  if (deterministicHits.length > 0 || hasBlockedCategory(moderation.categories)) {
    return {
      decision: "BLOCK",
      reason: deterministicHits.length > 0
        ? "Unsafe deterministic terms detected."
        : "Moderation category blocked for kid-safe policy.",
      normalizedText,
      deterministicHits,
      moderation
    };
  }

  if (softened.changed || shouldRewriteByScore(moderation.categoryScores)) {
    return {
      decision: "REWRITE",
      reason: "Borderline content detected; safer phrasing required.",
      normalizedText,
      rewrittenText: softened.text,
      deterministicHits,
      moderation
    };
  }

  return {
    decision: "ALLOW",
    reason: "Content passes strict kid-safe policy.",
    normalizedText,
    deterministicHits,
    moderation
  };
}
