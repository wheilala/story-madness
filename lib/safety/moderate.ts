import { getOpenAIClient } from "@/lib/openai-client";
import { ModerationResult } from "@/lib/types";

const EMPTY: ModerationResult = {
  flagged: false,
  categories: {},
  categoryScores: {},
  model: undefined
};

export async function moderateText(input: string): Promise<ModerationResult> {
  const client = getOpenAIClient();
  if (!client) return EMPTY;

  const response = await client.moderations.create({
    model: "omni-moderation-latest",
    input
  });

  const result = response.results?.[0];
  if (!result) return EMPTY;

  return {
    flagged: result.flagged ?? false,
    categories: (result.categories ?? {}) as unknown as Record<string, boolean>,
    categoryScores: (result.category_scores ?? {}) as unknown as Record<string, number>,
    model: response.model
  };
}
