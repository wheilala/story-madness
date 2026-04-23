import { describe, expect, test } from "vitest";
import { evaluateSafety } from "@/lib/safety/decision";

describe("safety decision engine", () => {
  test("blocks explicit unsafe term", async () => {
    const result = await evaluateSafety("this has shit in it");
    expect(result.decision).toBe("BLOCK");
  });

  test("rewrites soft replacement term", async () => {
    const result = await evaluateSafety("The obese dog ran.");
    expect(result.decision).toBe("REWRITE");
    expect(result.rewrittenText?.toLowerCase()).toContain("very chubby");
  });

  test("allows clean text", async () => {
    const result = await evaluateSafety("A friendly dog helps the town stay safe.");
    expect(result.decision).toBe("ALLOW");
  });
});
