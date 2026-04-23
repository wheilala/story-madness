import { describe, expect, test } from "vitest";
import { handleStoryGenerate } from "@/lib/api/story-generate";
import { handleStoryReveal } from "@/lib/api/story-reveal";
import { handleImageGenerate } from "@/lib/api/image-generate";

describe("api handlers", () => {
  test("story generate blocks unsafe seed", async () => {
    const res = await handleStoryGenerate({ seed: "I want to murder everyone" }, "test-ip-1");
    expect(res.moderationDecision).toBe("BLOCK");
  });

  test("story generate allows safe seed", async () => {
    const res = await handleStoryGenerate(
      { seed: "John tripped over a twig and became a firefighter." },
      "test-ip-2"
    );
    expect(["ALLOW", "REWRITE"]).toContain(res.moderationDecision);
    expect(res.storyTemplate.length).toBeGreaterThan(0);
  });

  test("reveal blocks unsafe fill", async () => {
    const res = await handleStoryReveal(
      {
        storyTemplate: "Hello there friend [NOUN_1], welcome to the safe test template.",
        fills: { NOUN_1: "shit" }
      },
      "test-ip-3"
    );
    expect(res.moderationDecision).toBe("BLOCK");
  });

  test("image generate returns policy metadata", async () => {
    const res = await handleImageGenerate(
      {
        seed: "A friendly fire station scene.",
        storyTemplate: "John helped the town with safety and teamwork."
      },
      "test-ip-4"
    );
    expect(res.promptVersion).toBe("coloring-v1");
    expect(["ALLOW", "BLOCK"]).toContain(res.moderationDecision);
  });
});
