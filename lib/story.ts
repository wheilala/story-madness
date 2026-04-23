import { BlankToken, StoryTemplatePayload } from "@/lib/types";
import { getOpenAIClient } from "@/lib/openai-client";

const FALLBACK_STORY: StoryTemplatePayload = {
  title: "John and the Twig Mission",
  storyTemplate:
    "One [ADJ_1] afternoon, John was [VERB_ING_1] down [PLACE_1] when he tripped over a tiny [NOUN_1].\n" +
    "He stood up, took [NUMBER_1] deep breaths, and decided to become a firefighter so people could stay safe.\n" +
    "At the fire station, Captain [NAME_1] taught him to carry a [NOUN_2], climb [PLURAL_NOUN_1], and [VERB_1] calmly.\n" +
    "Soon John became the town's most [ADJ_2] helper, reminding everyone to watch for twigs and protect their [PLURAL_NOUN_2].",
  blanks: [
    { id: "ADJ_1", label: "adjective", partOfSpeech: "adjective", example: "sunny" },
    { id: "VERB_ING_1", label: "verb ending in -ing", partOfSpeech: "verb", example: "walking" },
    { id: "PLACE_1", label: "place", partOfSpeech: "noun", example: "Maple Street" },
    { id: "NOUN_1", label: "noun", partOfSpeech: "noun", example: "twig" },
    { id: "NUMBER_1", label: "number", partOfSpeech: "number", example: "three" },
    { id: "NAME_1", label: "person name", partOfSpeech: "proper noun", example: "Lee" },
    { id: "NOUN_2", label: "noun", partOfSpeech: "noun", example: "hose" },
    { id: "PLURAL_NOUN_1", label: "plural noun", partOfSpeech: "noun", example: "ladders" },
    { id: "VERB_1", label: "verb", partOfSpeech: "verb", example: "focus" },
    { id: "ADJ_2", label: "adjective", partOfSpeech: "adjective", example: "brave" },
    { id: "PLURAL_NOUN_2", label: "plural noun", partOfSpeech: "noun", example: "ankles" }
  ]
};

function createStoryPrompt(seed: string): string {
  return [
    "Create a family-safe madlib story JSON using this seed:",
    seed,
    "",
    "Requirements:",
    "- One page style short story around 250-450 words.",
    "- Use [TOKEN] blanks in the storyTemplate.",
    "- Include 12-22 blanks.",
    "- Tokens must appear in blanks array with id, label, partOfSpeech, example.",
    "- Keep tone funny, non-violent, kid-safe.",
    "",
    "Return strict JSON with keys:",
    "title, storyTemplate, blanks"
  ].join("\n");
}

export function parseTokens(template: string): string[] {
  const matches = [...template.matchAll(/\[([A-Z0-9_]+)\]/g)].map((m) => m[1]);
  return [...new Set(matches)];
}

function toBlankToken(id: string): BlankToken {
  return {
    id,
    label: id.replaceAll("_", " ").toLowerCase(),
    partOfSpeech: "word",
    example: ""
  };
}

export async function generateStory(seed: string): Promise<StoryTemplatePayload> {
  const client = getOpenAIClient();
  if (!client) return FALLBACK_STORY;

  const model = process.env.OPENAI_STORY_MODEL ?? "gpt-4.1-mini";
  const response = await client.responses.create({
    model,
    input: createStoryPrompt(seed),
    max_output_tokens: 1800
  });

  const text = response.output_text?.trim();
  if (!text) return FALLBACK_STORY;

  try {
    const parsed = JSON.parse(text) as Partial<StoryTemplatePayload>;
    if (!parsed.storyTemplate || !parsed.title) return FALLBACK_STORY;
    const tokens = parseTokens(parsed.storyTemplate);
    const blanks = Array.isArray(parsed.blanks) && parsed.blanks.length > 0
      ? parsed.blanks
      : tokens.map(toBlankToken);
    return {
      title: parsed.title,
      storyTemplate: parsed.storyTemplate,
      blanks
    };
  } catch {
    return FALLBACK_STORY;
  }
}

export function fillStoryTemplate(storyTemplate: string, fills: Record<string, string>): string {
  let output = storyTemplate;
  const tokens = parseTokens(storyTemplate);
  for (const token of tokens) {
    const value = (fills[token] ?? `(${token.toLowerCase()})`).trim();
    output = output.replaceAll(`[${token}]`, value);
  }
  return output;
}
