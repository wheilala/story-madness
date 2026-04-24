import { describe, expect, test } from "vitest";
import { evaluateRevealLint } from "@/lib/reveal-lint";

describe("reveal lint", () => {
  test("flags adverb-like fills in verb-shaped slots", () => {
    const report = evaluateRevealLint({
      storyTemplate: "It [VERB_1] into the air.",
      fills: { VERB_1: "clumsily" },
      revealedStory: "It clumsily into the air."
    });

    expect(report.issueCount).toBeGreaterThan(0);
    expect(report.issues.some((issue) => issue.category === "verb_slot_naturalness")).toBe(true);
  });

  test("flags adverb-like fills in noun phrase completions", () => {
    const report = evaluateRevealLint({
      storyTemplate: "Max landed in a [NOUN_1].",
      fills: { NOUN_1: "briskly" },
      revealedStory: "Max landed in a briskly."
    });

    expect(report.issues.some((issue) => issue.category === "noun_phrase_completion")).toBe(true);
  });
});
