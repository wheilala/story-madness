import { z } from "zod";
import { handleStoryGenerate } from "@/lib/api/story-generate";
import { handleStoryReveal } from "@/lib/api/story-reveal";
import { buildHumorShadowStory } from "@/lib/story-candidates";
import { autoFillBlanks, evaluateReveal, loadFunnyWordsCatalog } from "@/lib/reveal-evaluator";
import { recommendFunnyBlankSpans, reconstructStoryBodyFromExamples } from "@/lib/story-humor-selector";
import {
  RevealEvaluationReport,
  SelectorComparisonEntry,
  SelectorComparisonRunResponse,
  SelectorComparisonSummary
} from "@/lib/types";

const schema = z.object({
  seed: z.string().min(3).max(800),
  runId: z.string().uuid().optional(),
  variantIndex: z.number().int().min(0).max(500).optional(),
  useModel: z.boolean().optional(),
  existingStory: z.object({
    title: z.string().min(1),
    storyTemplate: z.string().min(20),
    blanks: z.array(
      z.object({
        id: z.string().min(1),
        tokenId: z.string().min(1),
        label: z.string().min(1),
        displayLabel: z.string().min(1),
        type: z.string().min(1),
        surfaceForm: z.string().min(1),
        partOfSpeech: z.string().min(1),
        example: z.string()
      })
    ).min(1)
  }).optional()
});

function selectorScore(report: RevealEvaluationReport): number {
  const modelScore = report.model
    ? report.model.naturalnessScore + report.model.humorFitScore + report.model.coherenceScore + report.model.semanticDriftScore
    : 0;
  return report.deterministic.overallScore * 2 + modelScore;
}

function compareSelectorEntries(
  local: SelectorComparisonEntry,
  humorShadow?: SelectorComparisonEntry
): SelectorComparisonSummary {
  if (!humorShadow) {
    return {
      winner: "skipped",
      reason: "Humor shadow selector was skipped for this run.",
      comparedOn: []
    };
  }

  const localPass = local.evaluation.model?.pass ?? false;
  const humorPass = humorShadow.evaluation.model?.pass ?? false;
  if (localPass !== humorPass) {
    return {
      winner: humorPass ? "humor_shadow" : "local",
      reason: humorPass
        ? "Humor shadow passed the model judge while the local selector did not."
        : "Local selector passed the model judge while the humor shadow did not.",
      comparedOn: ["model.pass"]
    };
  }

  const localScore = selectorScore(local.evaluation);
  const humorScore = selectorScore(humorShadow.evaluation);
  if (localScore === humorScore) {
    return {
      winner: "tie",
      reason: "Both selectors produced equivalent reveal quality by current scoring.",
      comparedOn: ["deterministic.overallScore", "model.naturalnessScore", "model.humorFitScore", "model.coherenceScore", "model.semanticDriftScore"]
    };
  }

  return {
    winner: humorScore > localScore ? "humor_shadow" : "local",
    reason:
      humorScore > localScore
        ? "Humor shadow achieved a stronger combined reveal score."
        : "Local selector achieved a stronger combined reveal score.",
    comparedOn: ["deterministic.overallScore", "model.naturalnessScore", "model.humorFitScore", "model.coherenceScore", "model.semanticDriftScore"]
  };
}

async function buildSelectorEntry(params: {
  selector: "local" | "humor_shadow";
  seed: string;
  title: string;
  storyTemplate: string;
  blanks: SelectorComparisonEntry["blanks"];
  runId: string;
  variantIndex: number;
  useModel: boolean;
  catalog: Awaited<ReturnType<typeof loadFunnyWordsCatalog>>;
  diagnostics?: SelectorComparisonEntry["diagnostics"];
}): Promise<SelectorComparisonEntry> {
  const fills = autoFillBlanks(params.blanks, params.catalog, params.variantIndex);
  const revealed = await handleStoryReveal(
    {
      runId: params.runId,
      storyTemplate: params.storyTemplate,
      fills
    },
    `selector-compare-${params.selector}-${params.runId}-${params.variantIndex}`
  );

  const evaluation = await evaluateReveal({
    seed: params.seed,
    title: params.title,
    storyTemplate: params.storyTemplate,
    blanks: params.blanks,
    fills,
    revealedStory: revealed.revealedStory,
    useModel: params.useModel
  });

  return {
    selector: params.selector,
    storyTemplate: params.storyTemplate,
    blanks: params.blanks,
    fills,
    revealedStory: revealed.revealedStory,
    evaluation,
    diagnostics: params.diagnostics
  };
}

export async function handleStoryCompareSelectors(input: unknown): Promise<SelectorComparisonRunResponse> {
  const parsed = schema.parse(input);
  const runId = parsed.runId ?? crypto.randomUUID();
  const variantIndex = parsed.variantIndex ?? 0;
  const useModel = parsed.useModel ?? true;

  const generated = parsed.existingStory
    ? {
        ...parsed.existingStory,
        moderationDecision: "ALLOW" as const,
        moderationReason: "Using provided generated story.",
        diagnostics: {
          fallbackUsed: false,
          retryUsed: false,
          unreplacedTokenCount: 0,
          grammarSlotIssueCount: 0,
          failureCategories: {
            seed: [],
            blanks: [],
            schema: [],
            cohesion: []
          },
          timings: []
        }
      }
    : await handleStoryGenerate(
        {
          seed: parsed.seed,
          runId
        },
        `selector-compare-generate-${runId}-${variantIndex}`
      );

  const storyBody = reconstructStoryBodyFromExamples(generated.storyTemplate, generated.blanks);
  const catalog = await loadFunnyWordsCatalog();
  const local = await buildSelectorEntry({
    selector: "local",
    seed: parsed.seed,
    title: generated.title,
    storyTemplate: generated.storyTemplate,
    blanks: generated.blanks,
    runId,
    variantIndex,
    useModel,
    catalog
  });

  let humorShadow: SelectorComparisonEntry | undefined;
  if (!generated.diagnostics?.fallbackUsed && storyBody.trim()) {
    const recommendations = await recommendFunnyBlankSpans({
      seed: parsed.seed,
      title: generated.title,
      storyBody
    });
    const shadow = buildHumorShadowStory(parsed.seed, generated.title, storyBody, recommendations.recommendations);
    humorShadow = await buildSelectorEntry({
      selector: "humor_shadow",
      seed: parsed.seed,
      title: generated.title,
      storyTemplate: shadow.story.storyTemplate,
      blanks: shadow.story.blanks,
      runId,
      variantIndex,
      useModel,
      catalog,
      diagnostics: {
        selector: "humor_shadow",
        recommendedCount: shadow.report.recommendedCount,
        acceptedCount: shadow.report.acceptedCount,
        rejectedCount: shadow.report.rejectedCount,
        backfilledCount: shadow.report.backfilledCount,
        acceptedTexts: shadow.report.acceptedTexts,
        rejections: shadow.report.rejections,
        recommendationError: recommendations.error
      }
    });
  }

  return {
    seed: parsed.seed,
    title: generated.title,
    storyBody,
    generationFallbackUsed: generated.diagnostics?.fallbackUsed ?? false,
    generationRetryUsed: generated.diagnostics?.retryUsed ?? false,
    local,
    humorShadow,
    comparison: compareSelectorEntries(local, humorShadow)
  };
}
