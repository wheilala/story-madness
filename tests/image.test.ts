import { describe, expect, test } from "vitest";
import { buildColoringPagePrompt } from "@/lib/image";

describe("coloring page prompt", () => {
  test("enforces line-art constraints", () => {
    const prompt = buildColoringPagePrompt("seed", "story");
    expect(prompt.toLowerCase()).toContain("black-and-white");
    expect(prompt.toLowerCase()).toContain("line drawing");
    expect(prompt.toLowerCase()).toContain("no text");
    expect(prompt.toLowerCase()).toContain("no logos");
  });
});
