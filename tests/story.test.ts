import { extractBlankedStory } from "@/lib/story-candidates";
import { describe, expect, test } from "vitest";
import { assessSeedAdherence, assessStoryQuality, fillStoryTemplate, parseTokens, validateStoryDraft } from "@/lib/story";
import { normalizeBlank } from "@/lib/madlib-labels";
import { parseTokenOccurrences } from "@/lib/story-format";

function makeBlank(id: string, label: string, example: string) {
  return normalizeBlank({ id, label, example }, id, 0);
}

describe("story token utilities", () => {
  test("extracts unique tokens", () => {
    const input = "Hi [NOUN_1] and [VERB_1], then [NOUN_1] again.";
    expect(parseTokens(input)).toEqual(["NOUN_1", "VERB_1"]);
  });

  test("extracts mixed-case tokens from structured model output", () => {
    const input = "One [timeOfDay], the toddler ran into [laundryRoomThing].";
    expect(parseTokens(input)).toEqual(["timeOfDay", "laundryRoomThing"]);
  });

  test("extracts bracket tokens even when the model uses human-readable labels", () => {
    const input = "One kid [Past Tense Verb] into a [Plural Noun].";
    expect(parseTokens(input)).toEqual(["Past Tense Verb", "Plural Noun"]);
  });

  test("tracks repeated token occurrences separately from unique ids", () => {
    const input = "Hi [NOUN_1] and [VERB_1], then [NOUN_1] again.";
    const occurrences = parseTokenOccurrences(input);
    expect(occurrences.map((item) => item.id)).toEqual(["NOUN_1", "VERB_1", "NOUN_1"]);
  });

  test("fills template with provided values", () => {
    const template = "John saw a [NOUN_1] and [VERB_1] home.";
    const output = fillStoryTemplate(template, { NOUN_1: "truck", VERB_1: "ran" });
    expect(output).toContain("truck");
    expect(output).toContain("ran");
  });

  test("adjusts inserted fill capitalization by sentence context", () => {
    const template = "[NOUN_1] ran fast. then [NOUN_2] waved.";
    const output = fillStoryTemplate(template, { NOUN_1: "DOG", NOUN_2: "cAt" });
    expect(output.startsWith("DOG ran fast. then cAt waved.")).toBe(true);
  });

  test("rejects story templates that reuse the same prompted token", () => {
    const report = assessStoryQuality({
      title: "Repeat trouble",
      storyTemplate:
        "A [NOUN_1] zoomed by while a helper tried to [VERB_1]. Later the same [NOUN_1] returned for chaos.",
      blanks: [
        makeBlank("NOUN_1", "noun", "wagon"),
        makeBlank("VERB_1", "verb", "dance")
      ]
    });

    expect(report.passes).toBe(false);
    expect(report.reasons.some((reason) => reason.includes("reuses token ids"))).toBe(true);
  });

  test("rejects obvious grammar-slot mismatches", () => {
    const report = assessStoryQuality({
      title: "Grammar trouble",
      storyTemplate:
        "At the mall, a kid slipped into a [VERB_ING_1], then felt ready for [ADVERB_1]. Everyone laughed at the [NOUN_1].",
      blanks: [
        makeBlank("VERB_ING_1", "verb ending in -ing", "running"),
        makeBlank("ADVERB_1", "adverb", "quickly"),
        makeBlank("NOUN_1", "noun", "mess")
      ]
    });

    expect(report.passes).toBe(false);
    expect(report.reasons.some((reason) => reason.includes("VERB_ING_1"))).toBe(true);
    expect(report.reasons.some((reason) => reason.includes("ADVERB_1"))).toBe(true);
  });

  test("does not misclassify direct objects after verbs as adverb slots", () => {
    const report = assessStoryQuality({
      title: "Cleanup scramble",
      storyTemplate:
        "Maya grabbed [OBJECT_1], waved at [PERSON_2], and carried [OBJECT_3] toward [PLACE_4] while [ANIMAL_5] watched [ADVERB_6] and [VERB_PAST_7] near [OBJECT_8], [OBJECT_9], and [OBJECT_10] before the whole messy afternoon finally settled down with enough extra filler words to keep this test well above the minimum word count requirement for quality checks.",
      blanks: [
        makeBlank("OBJECT_1", "object", "bucket"),
        makeBlank("PERSON_2", "person", "neighbor"),
        makeBlank("OBJECT_3", "object", "wagon"),
        makeBlank("PLACE_4", "place", "driveway"),
        makeBlank("ANIMAL_5", "animal", "dog"),
        makeBlank("ADVERB_6", "adverb", "quietly"),
        makeBlank("VERB_PAST_7", "past tense verb", "hustled"),
        makeBlank("OBJECT_8", "object", "trash can"),
        makeBlank("OBJECT_9", "object", "ladder"),
        makeBlank("OBJECT_10", "object", "helmet")
      ]
    });

    expect(report.reasons.some((reason) => reason.includes("OBJECT_1 uses Object in a adverb modifier slot"))).toBe(false);
    expect(report.reasons.some((reason) => reason.includes("OBJECT_3 uses Object in a adverb modifier slot"))).toBe(false);
  });

  test("rejects blanks that are glued to nearby letters for inflection", () => {
    const report = assessStoryQuality({
      title: "Suffix trouble",
      storyTemplate:
        "A parade of [ANIMAL_1]s raced across the street while a coach [VERB_1]ed loudly and everyone kept the story long enough to stay above the minimum word threshold by adding a lot of harmless filler words about the scene, the weather, the sidewalk, the crowd, and the neighborhood excitement.",
      blanks: [
        makeBlank("ANIMAL_1", "animal", "zebra"),
        makeBlank("VERB_1", "verb", "jump")
      ]
    });

    expect(report.passes).toBe(false);
    expect(report.reasons.some((reason) => reason.includes("glued"))).toBe(true);
  });

  test("rejects stories with too few unique prompts", () => {
    const report = assessStoryQuality({
      title: "Too short",
      storyTemplate:
        "This story has [NOUN_1] [NOUN_2] [NOUN_3] [NOUN_4] [NOUN_5] [NOUN_6] [NOUN_7] [NOUN_8] [NOUN_9] and then a lot of extra filler words to push the total word count comfortably over the minimum quality threshold without adding any more prompt slots to the template because we only want to verify the lower prompt bound in this test case and nothing else.",
      blanks: Array.from({ length: 9 }, (_, index) => makeBlank(`NOUN_${index + 1}`, "noun", "wagon"))
    });

    expect(report.passes).toBe(false);
    expect(report.reasons.some((reason) => reason.includes("outside the allowed range"))).toBe(true);
  });

  test("rejects stories with more than twelve unique prompts", () => {
    const ids = Array.from({ length: 13 }, (_, index) => `NOUN_${index + 1}`);
    const template =
      `${ids.map((id) => `[${id}]`).join(" ")} ` +
      "then a stream of filler words keeps the story length above the minimum threshold so this test isolates the upper prompt bound and confirms that we do not allow an oversized blank budget anymore even if the rest of the story is technically parseable.";
    const report = assessStoryQuality({
      title: "Too many",
      storyTemplate: template,
      blanks: ids.map((id) => makeBlank(id, "noun", "wagon"))
    });

    expect(report.passes).toBe(false);
    expect(report.reasons.some((reason) => reason.includes("outside the allowed range"))).toBe(true);
  });

  test("rejects stories that drift too far from the seed", () => {
    const report = assessSeedAdherence("Tunny the seahorse escapes at Granite Run Mall", {
      title: "Backyard Bubble Parade",
      storyTemplate:
        "A banana band marched through a backyard while everyone practiced silly songs and balanced cupcakes on their elbows.",
      blanks: []
    });

    expect(report.passes).toBe(false);
    expect(report.reasons.some((reason) => reason.includes("matched"))).toBe(true);
  });

  test("accepts stories that keep concrete seed details", () => {
    const report = assessSeedAdherence("Tunny the seahorse escapes at Granite Run Mall", {
      title: "Tunny's Granite Run Dash",
      storyTemplate:
        "At Granite Run Mall, Tunny the seahorse slipped out of a tank and dashed past the snack stand before anyone could stop the goofy escape.",
      blanks: []
    });

    expect(report.passes).toBe(true);
    expect(report.matchedKeywords).toContain("tunny");
    expect(report.matchedKeywords).toContain("granite");
  });

  test("does not flag sentence starters as recurring invented names", () => {
    const result = validateStoryDraft("Garth the grumpy neighbor chases trash cans down the street", {
      title: "Street Trouble",
      storyTemplate:
        "That made Garth grumble. That sent a trash can wobbling downhill. By the end, the street finally settled down.",
      blanks: []
    });

    expect(result.cohesionReasons.some((reason) => reason.includes("That"))).toBe(false);
  });

  test("extracts juicy local blank candidates from authored prose", () => {
    const extracted = extractBlankedStory(
      "A grumpy dog causes chaos in a hotel",
      "Lobby Trouble",
      "The chunky dog dragged a shiny dishwasher rack across the fancy hotel lobby."
    );

    expect(extracted.chosenCount).toBeGreaterThan(0);
    expect(extracted.story.blanks.some((blank) => blank.type === "Adjective")).toBe(true);
    expect(extracted.story.blanks.some((blank) => blank.type === "Object")).toBe(true);
    expect(extracted.story.blanks.some((blank) => blank.type === "Place")).toBe(true);
    expect(parseTokens(extracted.story.storyTemplate).length).toBe(extracted.story.blanks.length);
  });

  test("filters or remaps candidates before they become bad slot mismatches", () => {
    const extracted = extractBlankedStory(
      "A windy street cleanup",
      "Street scramble",
      "Garth tried to calm the shouting crowd, grabbed a slippery bucket, and moved quickly toward the trash cans."
    );

    const report = assessStoryQuality(extracted.story);
    expect(report.reasons.some((reason) => reason.includes("uses Object in a base verb slot"))).toBe(false);
    expect(report.reasons.some((reason) => reason.includes("uses Object in a adverb modifier slot"))).toBe(false);
  });
});
