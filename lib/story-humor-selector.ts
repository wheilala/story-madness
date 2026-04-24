import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { getOpenAIClient } from "@/lib/openai-client";
import { fillStoryTemplate } from "@/lib/story-format";
import { BlankToken } from "@/lib/types";
import { HumorSpanRecommendation } from "@/lib/story-candidates";

const humorRecommendationSchema = z.object({
  recommendations: z.array(
    z.object({
      text: z.string().min(1),
      reason: z.string()
    })
  ).min(12).max(14)
});

function createHumorSpanPrompt(seed: string, title: string, storyBody: string): string {
  return [
    "You are helping choose the funniest safe spans to blank out in a silly story.",
    "Return exact text spans copied from the story body that would be especially fun to replace with madlib-style fill-ins.",
    "",
    "Pick spans that are:",
    "- vivid, funny, or highly visual",
    "- short words or short phrases",
    "- swappable without breaking the story's main logic",
    "- likely to become funnier if replaced with an absurd word",
    "- a balanced mix of adjectives, verbs, props, places, foods, clothing, animals, and body parts",
    "",
    "Avoid spans that are:",
    "- core seed anchors or plot-critical references",
    "- repeated text that appears multiple times",
    "- whole clauses or long phrases",
    "- punctuation-heavy",
    "- spans that depend on glued suffixes or surrounding grammar to make sense",
    "- too many plain generic nouns when more vivid choices are available",
    "- possessives or spans with trailing punctuation",
    "",
    "Return 12 to 14 candidate spans in descending humor potential.",
    "Each text must be an exact substring from the story body.",
    "Copy the text exactly, but exclude surrounding quotes, commas, periods, possessive apostrophes, and dashes.",
    "Do not invent labels, tokens, or rewrite the story.",
    "",
    `Seed: ${seed}`,
    `Title: ${title}`,
    "",
    "Story body:",
    storyBody
  ].join("\n");
}

export function reconstructStoryBodyFromExamples(storyTemplate: string, blanks: BlankToken[]): string {
  const fills = Object.fromEntries(blanks.map((blank) => [blank.id, blank.example]));
  return fillStoryTemplate(storyTemplate, fills);
}

export async function recommendFunnyBlankSpans(params: {
  seed: string;
  title: string;
  storyBody: string;
}): Promise<{ recommendations: HumorSpanRecommendation[]; durationMs: number; error?: string }> {
  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  const client = getOpenAIClient();
  if (!client) {
    const durationMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt;
    return {
      recommendations: [],
      durationMs,
      error: "OpenAI client unavailable."
    };
  }

  try {
    const response = await client.responses.create({
      model: process.env.OPENAI_STORY_MODEL ?? "gpt-4.1-mini",
      input: createHumorSpanPrompt(params.seed, params.title, params.storyBody),
      max_output_tokens: 1200,
      store: false,
      text: {
        format: zodTextFormat(humorRecommendationSchema, "humor_span_recommendations")
      }
    });

    const text = response.output_text?.trim();
    if (!text) {
      const durationMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt;
      return {
        recommendations: [],
        durationMs,
        error: "Empty humor selector response."
      };
    }

    const parsed = humorRecommendationSchema.parse(JSON.parse(text));
    const durationMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt;
    return {
      recommendations: parsed.recommendations,
      durationMs
    };
  } catch (error) {
    const durationMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt;
    return {
      recommendations: [],
      durationMs,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
