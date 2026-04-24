import { describe, expect, test } from "vitest";
import { canonicalTokenId, fallbackTypeForIndex, humanLabel, typeFromTokenId } from "@/lib/madlib-labels";

describe("madlib labels", () => {
  test("maps common token ids to human labels", () => {
    expect(typeFromTokenId("NOUN_1")).toBe("Noun");
    expect(typeFromTokenId("VERB_ING_2")).toBe("Verb Ending In Ing");
    expect(typeFromTokenId("PLURAL_NOUN_3")).toBe("Plural Noun");
  });

  test("uses provided non-variable label if present", () => {
    expect(humanLabel("past tense verb", "WORD_1", 0)).toBe("Past Tense Verb");
  });

  test("removes parenthetical context from provided labels", () => {
    expect(humanLabel("plural noun (fall related)", "WORD_1", 0)).toBe("Plural Noun");
    expect(humanLabel("bright color for vests", "WORD_2", 0)).toBe("Color");
  });

  test("simplifies over-descriptive story-specific labels", () => {
    expect(humanLabel("name of the little girl", "WORD_1", 0)).toBe("Name");
    expect(humanLabel("type of town", "WORD_2", 0)).toBe("Place");
    expect(humanLabel("adjective describing the performance", "WORD_3", 0)).toBe("Adjective");
    expect(humanLabel("a favorite movie title", "WORD_4", 0)).toBe("Noun");
    expect(humanLabel("type of role in movies", "WORD_5", 0)).toBe("Job");
    expect(humanLabel("a simple childhood activity", "WORD_6", 0)).toBe("Noun");
  });

  test("maps arbitrary context-heavy labels back into the canonical set", () => {
    expect(humanLabel("small obstacle on street plural", "WORD_1", 0)).toBe("Plural Noun");
    expect(humanLabel("authority figure", "WORD_2", 0)).toBe("Person");
    expect(humanLabel("cookie plural", "WORD_3", 0)).toBe("Plural Noun");
    expect(humanLabel("autumn leaves plural", "WORD_4", 0)).toBe("Plural Noun");
    expect(humanLabel("future profession plural", "WORD_5", 0)).toBe("Job");
    expect(humanLabel("plural animals", "WORD_6", 0)).toBe("Plural Animal");
  });

  test("builds stable canonical token ids from labels", () => {
    expect(canonicalTokenId("past tense verb", "Past Tense Verb", 0)).toBe("VERB_PAST_1");
    expect(canonicalTokenId("plural animals", "animal friends", 1)).toBe("PLURAL_ANIMAL_2");
  });

  test("falls back to diverse type sequence for unknown ids", () => {
    expect(humanLabel(undefined, "WORD_1", 0)).toBe("Noun");
    expect(humanLabel(undefined, "WORD_2", 1)).toBe("Verb");
    expect(humanLabel(undefined, "WORD_3", 2)).toBe("Adjective");
    expect(fallbackTypeForIndex(4)).toBe("Plural Noun");
  });
});
