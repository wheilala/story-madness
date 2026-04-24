import { describe, expect, test } from "vitest";
import { validateFunFactsPayload } from "@/lib/story-fun-facts";

describe("story fun facts", () => {
  test("accepts a valid fun facts payload", () => {
    const result = validateFunFactsPayload({
      topic: "alligators",
      facts: [
        "Alligators can replace thousands of teeth over a lifetime.",
        "Baby alligators make chirping sounds before they hatch.",
        "Alligators use their tails for strong swimming boosts."
      ]
    });

    expect(result).toEqual({
      topic: "alligators",
      facts: [
        "Alligators can replace thousands of teeth over a lifetime.",
        "Baby alligators make chirping sounds before they hatch.",
        "Alligators use their tails for strong swimming boosts."
      ]
    });
  });

  test("rejects duplicate or overlong facts", () => {
    const result = validateFunFactsPayload({
      topic: "alligators",
      facts: [
        "Alligators can float with just their eyes above water.",
        "Alligators can float with just their eyes above water.",
        "This fact is way too long because it keeps rambling far past the intended interstitial size limit and should be rejected outright."
      ]
    });

    expect(result).toBeNull();
  });
});
