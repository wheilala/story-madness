import { getOpenAIClient } from "@/lib/openai-client";

export const COLORING_PROMPT_VERSION = "coloring-v1";

export function buildColoringPagePrompt(seed: string, storyTemplate: string): string {
  return [
    "Create a family-safe black-and-white coloring page line drawing for children.",
    "Requirements:",
    "- bold clean outlines",
    "- simple composition and clear characters",
    "- no color fills, no heavy detail, no text, no logos",
    "- no violence or unsafe imagery",
    "",
    `Seed context: ${seed}`,
    `Story context: ${storyTemplate.slice(0, 700)}`
  ].join("\n");
}

export async function generateColoringImageBase64(prompt: string): Promise<string | undefined> {
  const client = getOpenAIClient();
  if (!client) return undefined;

  const model = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1";
  const response = await client.images.generate({
    model,
    prompt,
    size: "1024x1024"
  });

  const first = response.data?.[0];
  return first?.b64_json;
}
