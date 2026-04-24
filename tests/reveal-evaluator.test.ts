import { describe, expect, test } from "vitest";
import { autoFillBlanks, evaluateRevealDeterministically } from "@/lib/reveal-evaluator";
import { normalizeBlank } from "@/lib/madlib-labels";

function makeBlank(id: string, label: string, example: string, index: number) {
  return normalizeBlank({ id, label, example }, id, index);
}

describe("reveal evaluator", () => {
  test("auto-fills blanks with compatible funny-word categories", async () => {
    const { loadFunnyWordsCatalog } = await import("@/lib/reveal-evaluator");
    const catalog = await loadFunnyWordsCatalog();
    const blanks = [
      makeBlank("NOUN_1", "Noun", "wagon", 0),
      makeBlank("VERB_PAST_2", "Past Tense Verb", "slipped", 1),
      makeBlank("ADJECTIVE_3", "Adjective", "sparkly", 2),
      makeBlank("ADVERB_4", "Adverb", "quickly", 3),
      makeBlank("ANIMAL_5", "Animal", "zebra", 4)
    ];

    const fills = autoFillBlanks(blanks, catalog, 0);
    expect(fills.NOUN_1).toBeTruthy();
    expect(fills.VERB_PAST_2).toMatch(/ed$|^spun$/);
    expect(fills.ADJECTIVE_3).toBeTruthy();
    expect(fills.ADVERB_4).toBeTruthy();
    expect(["zebra", "hamster", "duck", "puppy", "llama"]).toContain(fills.ANIMAL_5);
  });

  test("auto-fill avoids duplicate values within a single reveal when possible", async () => {
    const { loadFunnyWordsCatalog } = await import("@/lib/reveal-evaluator");
    const catalog = await loadFunnyWordsCatalog();
    const blanks = [
      makeBlank("NOUN_1", "Noun", "wagon", 0),
      makeBlank("NOUN_2", "Noun", "helmet", 1),
      makeBlank("OBJECT_3", "Object", "bucket", 2),
      makeBlank("CLOTHING_4", "Clothing", "apron", 3)
    ];

    const fills = autoFillBlanks(blanks, catalog, 0);
    const values = Object.values(fills).map((value) => value.trim().toLowerCase());
    expect(new Set(values).size).toBe(values.length);
  });

  test("flags object-heavy reveals and article mismatches deterministically", () => {
    const blanks = [
      makeBlank("OBJECT_1", "Object", "bucket", 0),
      makeBlank("OBJECT_2", "Object", "helmet", 1),
      makeBlank("OBJECT_3", "Object", "ladder", 2),
      makeBlank("NOUN_4", "Noun", "wagon", 3),
      makeBlank("ADJECTIVE_5", "Adjective", "goofy", 4)
    ];
    const fills = {
      OBJECT_1: "hammer",
      OBJECT_2: "helmet",
      OBJECT_3: "ladder",
      NOUN_4: "umbrella",
      ADJECTIVE_5: "goofy"
    };

    const report = evaluateRevealDeterministically({
      storyTemplate: "Maya found an [OBJECT_1] beside an [OBJECT_2], then balanced [OBJECT_3] on a [NOUN_4].",
      revealedStory: "Maya found an hammer beside an helmet, then balanced ladder on an umbrella.",
      blanks,
      fills
    });

    expect(report.articleMismatchCount).toBeGreaterThan(0);
    expect(report.objectBlankShare).toBeGreaterThan(0.4);
    expect(report.genericNounShare).toBeLessThan(0.5);
    expect(report.suspiciousLabels).toContain("Object-heavy blank set");
  });
});
