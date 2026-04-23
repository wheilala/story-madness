import { BlankToken, StoryTemplatePayload } from "@/lib/types";
import { getOpenAIClient } from "@/lib/openai-client";

function buildFallbackStory(seed: string): StoryTemplatePayload {
  return {
    title: "Neighborhood Hero Training Day",
    storyTemplate:
      `The whole adventure started when this happened: "${seed}".\n\n` +
      "By lunchtime, [NAME_1] had already [VERB_PAST_1] into a [ADJ_1] plan to help everyone stay safe. " +
      "At [PLACE_1], a small crowd gathered around a pile of [PLURAL_NOUN_1] while [NAME_1] explained that teamwork, not panic, was the secret move. " +
      "A coach with a [ADJ_2] whistle shouted, \"Let's practice!\" and everyone began [VERB_ING_1] in a neat line. " +
      "Someone carried a [NOUN_1], someone brought [PLURAL_NOUN_2], and someone else wrote a checklist on a [NOUN_2] using [COLOR_1] marker.\n\n" +
      "The first drill was simple: if you spot a problem, count to [NUMBER_1], take a deep breath, and [VERB_1]. " +
      "The second drill was sillier: walk [ADVERB_1] around a [NOUN_3] without bumping it, then give your teammate a [ADJ_3] high-five. " +
      "When a pretend emergency bell rang with a loud \"[SOUND_1],\" the team moved quickly but calmly. " +
      "[NAME_1] pointed to the map, called out \"[EXCLAMATION_1]!\", and led everyone to [PLACE_2] where a rescue dummy made of [MATERIAL_1] waited to be carried.\n\n" +
      "By sunset, the neighborhood was cheering. " +
      "Parents handed out [FOOD_1], kids made thank-you signs, and even the grumpy [ANIMAL_1] from next door looked impressed. " +
      "People said the day felt [ADJ_4], [ADJ_5], and totally unforgettable. " +
      "[NAME_1] smiled and said, \"Big heroes start with small choices.\" " +
      "From then on, whenever trouble popped up, everyone knew exactly what to do: stay kind, stay calm, and [VERB_2] together.",
    blanks: [
      { id: "NAME_1", label: "name", partOfSpeech: "proper noun", example: "Jordan" },
      { id: "VERB_PAST_1", label: "past tense verb", partOfSpeech: "verb", example: "jumped" },
      { id: "ADJ_1", label: "adjective", partOfSpeech: "adjective", example: "brave" },
      { id: "PLACE_1", label: "place", partOfSpeech: "noun", example: "city field" },
      { id: "PLURAL_NOUN_1", label: "plural noun", partOfSpeech: "noun", example: "cones" },
      { id: "ADJ_2", label: "adjective", partOfSpeech: "adjective", example: "striped" },
      { id: "VERB_ING_1", label: "verb ending in -ing", partOfSpeech: "verb", example: "marching" },
      { id: "NOUN_1", label: "noun", partOfSpeech: "noun", example: "helmet" },
      { id: "PLURAL_NOUN_2", label: "plural noun", partOfSpeech: "noun", example: "boots" },
      { id: "NOUN_2", label: "noun", partOfSpeech: "noun", example: "clipboard" },
      { id: "COLOR_1", label: "color", partOfSpeech: "noun", example: "blue" },
      { id: "NUMBER_1", label: "number", partOfSpeech: "number", example: "five" },
      { id: "VERB_1", label: "verb", partOfSpeech: "verb", example: "focus" },
      { id: "ADVERB_1", label: "adverb", partOfSpeech: "adverb", example: "carefully" },
      { id: "NOUN_3", label: "noun", partOfSpeech: "noun", example: "ladder" },
      { id: "ADJ_3", label: "adjective", partOfSpeech: "adjective", example: "giant" },
      { id: "SOUND_1", label: "sound word", partOfSpeech: "noun", example: "ding-ding" },
      { id: "EXCLAMATION_1", label: "exclamation", partOfSpeech: "noun", example: "Let's go" },
      { id: "PLACE_2", label: "place", partOfSpeech: "noun", example: "the training tent" },
      { id: "MATERIAL_1", label: "material", partOfSpeech: "noun", example: "cardboard" },
      { id: "FOOD_1", label: "food", partOfSpeech: "noun", example: "orange slices" },
      { id: "ANIMAL_1", label: "animal", partOfSpeech: "noun", example: "cat" },
      { id: "ADJ_4", label: "adjective", partOfSpeech: "adjective", example: "hopeful" },
      { id: "ADJ_5", label: "adjective", partOfSpeech: "adjective", example: "proud" },
      { id: "VERB_2", label: "verb", partOfSpeech: "verb", example: "work" }
    ]
  };
}

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

function createRetryStoryPrompt(seed: string): string {
  return [
    "You previously generated output that did not meet quality requirements.",
    "Regenerate now as strict JSON with stronger compliance.",
    "",
    "Seed:",
    seed,
    "",
    "Hard requirements:",
    "- 300-500 words in storyTemplate.",
    "- 14-24 blanks using [TOKEN] format.",
    "- Family-safe humor and coherent narrative.",
    "- No markdown, no explanation text, only JSON object.",
    "",
    "JSON keys only: title, storyTemplate, blanks"
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

function normalizeBlanks(
  rawBlanks: unknown,
  tokens: string[]
): BlankToken[] {
  const byId = new Map<string, BlankToken>();
  const rawArray = Array.isArray(rawBlanks) ? rawBlanks : [];

  for (const item of rawArray) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as Partial<BlankToken>;
    const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
    if (!id || !tokens.includes(id)) continue;
    byId.set(id, {
      id,
      label: typeof candidate.label === "string" && candidate.label.trim()
        ? candidate.label
        : toBlankToken(id).label,
      partOfSpeech: typeof candidate.partOfSpeech === "string" && candidate.partOfSpeech.trim()
        ? candidate.partOfSpeech
        : "word",
      example: typeof candidate.example === "string" ? candidate.example : ""
    });
  }

  return tokens.map((id) => byId.get(id) ?? toBlankToken(id));
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function qualityPasses(story: StoryTemplatePayload): boolean {
  const wc = wordCount(story.storyTemplate);
  const tokenCount = parseTokens(story.storyTemplate).length;
  return wc >= 220 && wc <= 550 && tokenCount >= 12 && tokenCount <= 28;
}

function parseStoryJson(text: string): StoryTemplatePayload | null {
  try {
    const parsed = JSON.parse(text) as Partial<StoryTemplatePayload>;
    if (!parsed.storyTemplate || !parsed.title) return null;
    const tokens = parseTokens(parsed.storyTemplate);
    const blanks = normalizeBlanks(parsed.blanks, tokens);
    return {
      title: parsed.title,
      storyTemplate: parsed.storyTemplate,
      blanks
    };
  } catch {
    return null;
  }
}

async function requestStoryFromModel(seed: string, retry = false): Promise<StoryTemplatePayload | null> {
  const client = getOpenAIClient();
  if (!client) return null;

  const model = process.env.OPENAI_STORY_MODEL ?? "gpt-4.1-mini";
  const response = await client.responses.create({
    model,
    input: retry ? createRetryStoryPrompt(seed) : createStoryPrompt(seed),
    max_output_tokens: 2200
  });

  const text = response.output_text?.trim();
  if (!text) return null;
  return parseStoryJson(text);
}

export async function generateStory(seed: string): Promise<StoryTemplatePayload> {
  const firstAttempt = await requestStoryFromModel(seed, false);
  if (firstAttempt && qualityPasses(firstAttempt)) return firstAttempt;

  const retryAttempt = await requestStoryFromModel(seed, true);
  if (retryAttempt && qualityPasses(retryAttempt)) return retryAttempt;

  if (firstAttempt) return firstAttempt;
  if (retryAttempt) return retryAttempt;
  return buildFallbackStory(seed);
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
