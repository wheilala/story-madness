import { describe, expect, test } from "vitest";
import { handleStoryGenerate } from "@/lib/api/story-generate";
import { handleStoryReveal } from "@/lib/api/story-reveal";
import { autoFillBlanks, evaluateReveal, loadFunnyWordsCatalog } from "@/lib/reveal-evaluator";

const liveRevealEvalEnabled = process.env.REVEAL_EVAL_LIVE === "1";

const seeds = [
  "A goofy dog steals a mayor's sandwich during a windy town picnic and sparks a chase through the gazebo.",
  "A substitute teacher tries to organize a science fair while a box of crickets gets loose in the gym.",
  "A choir rehearsal gets interrupted when the conductor's pet parrot starts copying every warm-up note."
];

describe.skipIf(!liveRevealEvalEnabled)("reveal evaluator live loop", () => {
  test(
    "generates, auto-fills, reveals, and evaluates a few stories end to end",
    async () => {
      const catalog = await loadFunnyWordsCatalog();
      const summaries: string[] = [];

      for (const [index, seed] of seeds.entries()) {
        const generated = await handleStoryGenerate({ seed, runId: crypto.randomUUID() }, `reveal-eval-${index}`);
        expect(generated.storyTemplate).toBeTruthy();
        const fills = autoFillBlanks(generated.blanks, catalog, index);
        const revealed = await handleStoryReveal(
          {
            runId: crypto.randomUUID(),
            storyTemplate: generated.storyTemplate,
            fills
          },
          `reveal-eval-${index}`
        );

        expect(revealed.revealedStory).toBeTruthy();
        const report = await evaluateReveal({
          seed,
          title: generated.title,
          storyTemplate: generated.storyTemplate,
          blanks: generated.blanks,
          fills,
          revealedStory: revealed.revealedStory,
          useModel: true
        });

        summaries.push(
          [
            `seed ${index + 1}`,
            `title="${generated.title}"`,
            `fallback=${generated.diagnostics?.fallbackUsed ? "yes" : "no"}`,
            `det=${report.deterministic.overallScore}/5`,
            `obj=${report.deterministic.objectBlankShare.toFixed(2)}`,
            `noun=${report.deterministic.nounFamilyShare.toFixed(2)}`,
            `model=${
              report.model
                ? `${report.model.pass ? "pass" : "flag"}:${report.model.naturalnessScore}/${report.model.humorFitScore}/${report.model.semanticDriftScore}`
                : `n/a:${report.modelError ?? "unknown"}`
            }`
          ].join(" ")
        );
      }

      console.log("\nReveal evaluation live run\n" + summaries.join("\n"));
      expect(summaries.length).toBe(seeds.length);
    },
    180_000
  );
});
