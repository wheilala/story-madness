import { describe, expect, test } from "vitest";
import { buildHumorShadowStory, type HumorSpanRecommendation } from "@/lib/story-candidates";
import { parseTokens } from "@/lib/story";
import { reconstructStoryBodyFromExamples } from "@/lib/story-humor-selector";
import { normalizeBlank } from "@/lib/madlib-labels";

describe("humor shadow selector", () => {
  test("maps exact recommended spans into stable blank tokens", () => {
    const storyBody =
      "The chunky dog dragged a shiny dishwasher rack across the fancy hotel lobby while a grumpy cashier stared.";
    const recommendations: HumorSpanRecommendation[] = [
      { text: "chunky", reason: "visual adjective" },
      { text: "dishwasher rack", reason: "funny prop" },
      { text: "hotel lobby", reason: "concrete place" }
    ];

    const result = buildHumorShadowStory("A dog causes chaos in a hotel", "Lobby Trouble", storyBody, recommendations);

    expect(result.report.acceptedTexts).toEqual(
      expect.arrayContaining(["chunky", "dishwasher rack", "hotel lobby"])
    );
    expect(result.story.blanks.some((blank) => blank.type === "Adjective")).toBe(true);
    expect(result.story.blanks.some((blank) => blank.type === "Object")).toBe(true);
    expect(result.story.blanks.some((blank) => blank.type === "Place")).toBe(true);
    expect(parseTokens(result.story.storyTemplate).length).toBe(result.story.blanks.length);
  });

  test("rejects ambiguous repeated text recommendations", () => {
    const storyBody = "A scooter rolled by. Another scooter crashed into a cone.";
    const recommendations: HumorSpanRecommendation[] = [{ text: "scooter", reason: "repeat noun" }];

    const result = buildHumorShadowStory("Scooter chaos", "Scooter Trouble", storyBody, recommendations);

    expect(result.report.rejections.some((item) => item.reason === "ambiguous_match")).toBe(true);
  });

  test("rejects overlapping or duplicate model recommendations", () => {
    const storyBody = "A sticky pancake hat bounced across the driveway.";
    const recommendations: HumorSpanRecommendation[] = [
      { text: "sticky pancake hat", reason: "funny phrase" },
      { text: "pancake hat", reason: "overlap" },
      { text: "sticky pancake hat", reason: "duplicate" }
    ];

    const result = buildHumorShadowStory("Hat mishap", "Driveway Trouble", storyBody, recommendations);

    expect(result.report.rejections.some((item) => item.reason === "overlap")).toBe(true);
    expect(result.report.rejections.some((item) => item.reason === "duplicate_text")).toBe(true);
  });

  test("backfills from local extraction when recommendations undershoot", () => {
    const storyBody =
      "The goofy crossing guard chased runaway scooters past the bright school sign, a wobbling lunchbox, and a squeaky wagon while kids laughed wildly near the playground fence.";
    const recommendations: HumorSpanRecommendation[] = [{ text: "crossing guard", reason: "role" }];

    const result = buildHumorShadowStory(
      "A crossing guard loses control of scooters",
      "Scooter Scramble",
      storyBody,
      recommendations
    );

    expect(result.report.acceptedCount).toBe(1);
    expect(result.report.backfilledCount).toBeGreaterThan(0);
    expect(result.chosenCount).toBeGreaterThanOrEqual(10);
  });

  test("rejects humor recommendations that replace the action spine of a sentence", () => {
    const storyBody =
      "He flailed wildly, arms spinning, completely covered in chocolate now, slipping straight into the low frame of the camera.";
    const recommendations: HumorSpanRecommendation[] = [
      { text: "low frame", reason: "vivid phrase but structurally important" }
    ];

    const result = buildHumorShadowStory(
      "A chocolate-covered kid crashes into a camera frame",
      "Camera Trouble",
      storyBody,
      recommendations
    );

    expect(result.report.rejections.some((item) => item.reason === "structural_risk")).toBe(true);
    expect(result.report.acceptedTexts).not.toContain("low frame");
  });

  test("rejects possessive action-fragment recommendations that carry the event", () => {
    const storyBody =
      "As Max scooped the last bit of ice cream, his shoelace untied, and he stumbled forward onto the movie set.";
    const recommendations: HumorSpanRecommendation[] = [
      { text: "shoelace", reason: "noun in possessive micro-action" }
    ];

    const result = buildHumorShadowStory(
      "A chocolate-covered kid stumbles onto a movie set",
      "Chocolate Chaos",
      storyBody,
      recommendations
    );

    expect(result.report.rejections.some((item) => item.reason === "structural_risk")).toBe(true);
    expect(result.report.acceptedTexts).not.toContain("shoelace");
  });

  test("rejects abstract result-phrase heads that steer the sentence payoff", () => {
    const storyBody =
      "His flailing arms and goofy grin turned the whole accident into comedy gold for the stunned crew.";
    const recommendations: HumorSpanRecommendation[] = [
      { text: "comedy gold", reason: "payoff phrase" }
    ];

    const result = buildHumorShadowStory(
      "A clumsy kid accidentally steals a scene",
      "Accidental Star",
      storyBody,
      recommendations
    );

    expect(result.report.rejections.some((item) => item.reason === "structural_risk")).toBe(true);
    expect(result.report.acceptedTexts).not.toContain("comedy gold");
  });

  test("reconstructs story body from blank examples", () => {
    const storyTemplate = "Maya found a [NOUN_1] near the [PLACE_2].";
    const blanks = [
      normalizeBlank({ id: "NOUN_1", label: "Noun", example: "wagon" }, "NOUN_1", 0),
      normalizeBlank({ id: "PLACE_2", label: "Place", example: "hotel lobby" }, "PLACE_2", 1)
    ];

    expect(reconstructStoryBodyFromExamples(storyTemplate, blanks)).toBe("Maya found a wagon near the hotel lobby.");
  });
});
