import { describe, expect, test } from "vitest";
import {
  formatHarnessReport,
  runStoryHarness,
  type StoryHarnessReport
} from "@/lib/story-harness";

function makeReport(overrides?: Partial<StoryHarnessReport>): StoryHarnessReport {
  return {
    summary: {
      runCount: 3,
      fallbackRate: 2 / 3,
      retryRate: 2 / 3,
      unreplacedTokenRate: 0,
      grammarSlotFailureRate: 1 / 3,
      averageStageDurationsMs: {
        story_model_initial: 120,
        normalize_initial: 8
      }
    },
    runCount: 3,
    fallbackCount: 2,
    topIssues: [
      {
        issue: "Story ending feels weak or abrupt instead of landing a clear resolution beat.",
        count: 2
      },
      {
        issue: "Story has 0 unique blanks, outside the allowed range.",
        count: 1
      }
    ],
    suggestedActions: [
      {
        trigger: "weak_resolution",
        count: 2,
        recommendation: "Tighten the acceptance rule for endings or locally repair the final sentence into a clearer resolution beat before triggering fallback."
      }
    ],
    runs: [],
    ...overrides
  };
}

describe("story harness reporting", () => {
  test("formats summary output with issues and suggested actions", () => {
    const formatted = formatHarnessReport(makeReport());

    expect(formatted).toContain("Runs: 3");
    expect(formatted).toContain("Fallback rate: 66.7%");
    expect(formatted).toContain("Top issues:");
    expect(formatted).toContain("Suggested actions:");
    expect(formatted).toContain("weak or abrupt");
  });
});

const liveHarnessEnabled = process.env.STORY_HARNESS_LIVE === "1";

describe.skipIf(!liveHarnessEnabled)("story harness live pipeline", () => {
  test(
    "runs the API-facing story workflow directly and prints a refinement report",
    async () => {
      const report = await runStoryHarness();
      expect(report.runCount).toBeGreaterThan(0);
      console.log("\nStory harness report\n" + formatHarnessReport(report));
    },
    120_000
  );
});
