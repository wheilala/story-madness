import { z } from "zod";
import { autoFillBlanks, evaluateReveal, loadFunnyWordsCatalog } from "@/lib/reveal-evaluator";
import { handleStoryGenerate } from "@/lib/api/story-generate";
import { handleStoryReveal } from "@/lib/api/story-reveal";
import { RevealEvaluationRunResponse } from "@/lib/types";

const schema = z.object({
  seed: z.string().min(3).max(800),
  runId: z.string().uuid().optional(),
  variantIndex: z.number().int().min(0).max(500).optional(),
  useModel: z.boolean().optional()
});

export async function handleStoryEvaluateReveal(input: unknown): Promise<RevealEvaluationRunResponse> {
  const parsed = schema.parse(input);
  const runId = parsed.runId ?? crypto.randomUUID();
  const variantIndex = parsed.variantIndex ?? 0;
  const useModel = parsed.useModel ?? true;

  const generated = await handleStoryGenerate(
    {
      seed: parsed.seed,
      runId
    },
    `reveal-eval-generate-${runId}-${variantIndex}`
  );

  const catalog = await loadFunnyWordsCatalog();
  const fills = autoFillBlanks(generated.blanks, catalog, variantIndex);
  const revealed = await handleStoryReveal(
    {
      runId,
      storyTemplate: generated.storyTemplate,
      fills
    },
    `reveal-eval-reveal-${runId}-${variantIndex}`
  );

  const evaluation = await evaluateReveal({
    seed: parsed.seed,
    title: generated.title,
    storyTemplate: generated.storyTemplate,
    blanks: generated.blanks,
    fills,
    revealedStory: revealed.revealedStory,
    useModel
  });

  return {
    seed: parsed.seed,
    title: generated.title,
    storyTemplate: generated.storyTemplate,
    blanks: generated.blanks,
    fills,
    revealedStory: revealed.revealedStory,
    generationFallbackUsed: generated.diagnostics?.fallbackUsed ?? false,
    generationRetryUsed: generated.diagnostics?.retryUsed ?? false,
    evaluation
  };
}
