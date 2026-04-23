import { describe, expect, test } from "vitest";
import { fillStoryTemplate, parseTokens } from "@/lib/story";

describe("story token utilities", () => {
  test("extracts unique tokens", () => {
    const input = "Hi [NOUN_1] and [VERB_1], then [NOUN_1] again.";
    expect(parseTokens(input)).toEqual(["NOUN_1", "VERB_1"]);
  });

  test("fills template with provided values", () => {
    const template = "John saw a [NOUN_1] and [VERB_1] home.";
    const output = fillStoryTemplate(template, { NOUN_1: "truck", VERB_1: "ran" });
    expect(output).toContain("truck");
    expect(output).toContain("ran");
  });
});
