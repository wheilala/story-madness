import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { getOpenAIClient } from "@/lib/openai-client";
import { StoryFunFactsResponse } from "@/lib/types";

const MAX_FACT_LENGTH = 110;
const CACHE_TTL_MS = 5 * 60 * 1000;

const funFactsSchema = z.object({
  topic: z.string().min(1).max(60),
  facts: z.array(z.string().min(1).max(MAX_FACT_LENGTH)).length(3)
});

const funFactsCache = new Map<string, { value: StoryFunFactsResponse; expiresAt: number }>();

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function normalizeSeed(seed: string): string {
  return seed.trim().replace(/\s+/g, " ").toLowerCase();
}

function createFunFactsPrompt(seed: string): string {
  return [
    "You create delightful, factual, kid-safe fun facts based on a story seed.",
    "Pick one vivid, concrete thing from the seed.",
    "Prefer an animal, object, place, food, or natural phenomenon over a generic person unless nothing better exists.",
    "Return exactly 3 short, positive, factual fun facts about that one topic.",
    "Each fact must be a single sentence fragment or sentence under 18 words.",
    "Do not mention the story, the seed, or that you are choosing a topic.",
    "Do not include numbering, markdown, warnings, or extra explanation.",
    "",
    `Seed: ${seed}`
  ].join("\n");
}

export function validateFunFactsPayload(payload: unknown): StoryFunFactsResponse | null {
  try {
    const parsed = funFactsSchema.parse(payload);
    const normalizedFacts = parsed.facts.map((fact) => fact.trim());
    const dedupedFacts = new Set(normalizedFacts.map((fact) => fact.toLowerCase()));
    if (dedupedFacts.size !== 3) return null;
    if (!parsed.topic.trim()) return null;
    if (normalizedFacts.some((fact) => fact.length > MAX_FACT_LENGTH)) return null;
    return {
      topic: parsed.topic.trim(),
      facts: normalizedFacts
    };
  } catch {
    return null;
  }
}

function getCachedFunFacts(seed: string): StoryFunFactsResponse | null {
  const key = normalizeSeed(seed);
  const cached = funFactsCache.get(key);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    funFactsCache.delete(key);
    return null;
  }
  return cached.value;
}

function setCachedFunFacts(seed: string, value: StoryFunFactsResponse) {
  funFactsCache.set(normalizeSeed(seed), {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS
  });
}

export async function fetchStoryFunFacts(seed: string): Promise<StoryFunFactsResponse | null> {
  const cached = getCachedFunFacts(seed);
  if (cached) return cached;

  const client = getOpenAIClient();
  if (!client) return null;

  const startedAt = now();

  try {
    const response = await client.responses.create({
      model: process.env.OPENAI_FUN_FACTS_MODEL ?? "gpt-5-nano",
      input: createFunFactsPrompt(seed),
      max_output_tokens: 220,
      store: false,
      text: {
        format: zodTextFormat(funFactsSchema, "story_fun_facts")
      }
    });

    const text = response.output_text?.trim();
    if (!text) return null;

    const validated = validateFunFactsPayload(JSON.parse(text));
    if (!validated) return null;

    const payload = {
      ...validated,
      latencyMs: Math.round(now() - startedAt)
    };
    setCachedFunFacts(seed, payload);
    return payload;
  } catch {
    return null;
  }
}
