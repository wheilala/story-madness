import { z } from "zod";
import { assertRateLimit } from "@/lib/rate-limit";
import { StoryFunFactsResponse } from "@/lib/types";
import { fetchStoryFunFacts } from "@/lib/story-fun-facts";

const schema = z.object({
  seed: z.string().min(3).max(800),
  runId: z.string().uuid().optional()
});

export async function handleStoryFunFacts(input: unknown, ip: string): Promise<StoryFunFactsResponse | null> {
  assertRateLimit(`story-fun-facts:${ip}`, 80);
  const parsed = schema.parse(input);
  return fetchStoryFunFacts(parsed.seed);
}
