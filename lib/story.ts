import { BlankToken, StoryTemplatePayload } from "@/lib/types";
import { getOpenAIClient } from "@/lib/openai-client";
import { zodTextFormat } from "openai/helpers/zod";
import {
  fillStoryTemplate as fillStoryTemplateWithContext,
  parseTokenOccurrences,
  parseTokens as parseTemplateTokens
} from "@/lib/story-format";
import { CANONICAL_LABELS, canonicalTokenId, normalizeBlank } from "@/lib/madlib-labels";
import { z } from "zod";

export type StoryQualityReport = {
  passes: boolean;
  reasons: string[];
};

export type SeedAdherenceReport = {
  passes: boolean;
  reasons: string[];
  matchedKeywords: string[];
  targetKeywords: string[];
};

const TARGET_BLANK_COUNT = 12;
const MIN_BLANK_COUNT = 10;

const blankSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  partOfSpeech: z.string().min(1),
  example: z.string()
});

const storyResponseSchema = z.object({
  title: z.string().min(1),
  storyTemplate: z.string().min(20),
  blanks: z.array(blankSchema)
});

const SEED_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "had",
  "has",
  "have",
  "he",
  "her",
  "his",
  "i",
  "in",
  "into",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "she",
  "starts",
  "start",
  "that",
  "the",
  "their",
  "them",
  "there",
  "they",
  "this",
  "to",
  "up",
  "was",
  "were",
  "when",
  "with"
]);

function titleCase(input: string): string {
  return input.replace(/\b\w/g, (match) => match.toUpperCase());
}

function summarizeSeed(seed: string): string {
  const compact = seed.trim().replace(/\s+/g, " ");
  return compact.length <= 84 ? compact : `${compact.slice(0, 81).trimEnd()}...`;
}

function buildFallbackStory(seed: string): StoryTemplatePayload {
  const seedSummary = summarizeSeed(seed);
  const anchorTitle =
    extractSeedKeywords(seed)
      .slice(0, 2)
      .map((word) => titleCase(word))
      .join(" ") || "Story";

  return {
    title: `${anchorTitle} Story Shuffle`,
    storyTemplate:
      `Everyone kept talking about the wild idea that kicked this off: "${seedSummary}".\n\n` +
      "At [PLACE_1], the whole crowd froze for one second, then burst into motion. " +
      "One [ADJ_1] neighbor [VERB_PAST_1] toward the doorway while a wobbling pile of [PLURAL_NOUN_1] tipped sideways and made the mess look even bigger. " +
      "The toddler blinked, lifted a chocolate-smeared [BODY_PART_1], and let out a tiny \"[SOUND_1]!\" that somehow made the room feel funnier than scarier.\n\n" +
      "Someone pointed at a [NOUN_1] near the washing machine. Another person tried to [VERB_1] the crowd before the panic spread past the hallway. " +
      "A helpful kid moved [ADVERB_1] across the floor, grabbed [PLURAL_NOUN_2], and started wiping up the sticky trail. " +
      "Even a curious [ANIMAL_1] peered in as the laundry room buzzed with laughter, confusion, and relief.\n\n" +
      "By the end, everybody agreed the whole adventure felt [ADJ_2] and unforgettable. " +
      "The chocolate-covered toddler just grinned, hugged a [NOUN_2], and turned the neighborhood panic into a silly story people would repeat for weeks.",
    blanks: [
      { id: "PLACE_1", label: "place", partOfSpeech: "noun", example: "laundry room" },
      { id: "ADJ_1", label: "adjective", partOfSpeech: "adjective", example: "frazzled" },
      { id: "VERB_PAST_1", label: "past tense verb", partOfSpeech: "verb", example: "jumped" },
      { id: "PLURAL_NOUN_1", label: "plural noun", partOfSpeech: "noun", example: "socks" },
      { id: "BODY_PART_1", label: "body part", partOfSpeech: "noun", example: "hand" },
      { id: "SOUND_1", label: "sound word", partOfSpeech: "noun", example: "eep" },
      { id: "NOUN_1", label: "noun", partOfSpeech: "noun", example: "basket" },
      { id: "VERB_1", label: "verb", partOfSpeech: "verb", example: "focus" },
      { id: "ADVERB_1", label: "adverb", partOfSpeech: "adverb", example: "carefully" },
      { id: "PLURAL_NOUN_2", label: "plural noun", partOfSpeech: "noun", example: "towels" },
      { id: "ANIMAL_1", label: "animal", partOfSpeech: "noun", example: "puppy" },
      { id: "ADJ_2", label: "adjective", partOfSpeech: "adjective", example: "ridiculous" },
      { id: "NOUN_2", label: "noun", partOfSpeech: "noun", example: "blanket" }
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
    "- Stay tightly anchored to the seed's main character, setting, and inciting incident from beginning to end.",
    "- Mention at least two concrete details from the seed in the title or story body, not just once in the opening line.",
    "- Do not introduce recurring named characters, mascots, or proper nouns unless they are already present in the seed.",
    "- Do not quote or restate the seed over and over. Use the seed as story grounding, not repeated filler text.",
    "- Use [TOKEN] blanks in the storyTemplate.",
    `- Include exactly ${TARGET_BLANK_COUNT} blanks.`,
    "- Every blank token must appear exactly once in storyTemplate. Never reuse the same token id twice.",
    "- Use machine-style token ids like [NOUN_1], [VERB_PAST_1], or [PLURAL_NOUN_1], not human labels inside brackets.",
    "- Do not attach letters to a blank to force grammar, such as [ANIMAL_1]s or [VERB_1]ed. The blank label must already match the final surface form.",
    "- Tokens must appear in blanks array with id, label, partOfSpeech, example.",
    "- Each blank must sit in a grammatically correct slot for its label.",
    "- If a slot needs a noun, do not label it as a verb. If a slot needs an action, do not label it as a noun.",
    `- Use labels only from this allowed set: ${CANONICAL_LABELS.join(", ")}.`,
    "- Keep labels simple and canonical.",
    "- Qualifiers are okay only when they are part of the allowed set, such as 'Plural Noun', 'Past Tense Verb', or 'Verb Ending In Ing'.",
    "- Avoid made-up contextual labels like 'small obstacle on street plural', 'cookie plural', or 'name of the little girl'.",
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
    "- The story must clearly remain about the original seed and repeat concrete seed details naturally across the story.",
    "- Do not invent a recurring named helper or narrator unless the seed includes one.",
    "- Avoid repeated restatements of the seed text.",
    `- Include exactly ${TARGET_BLANK_COUNT} blanks using [TOKEN] format.`,
    `- Use labels only from this allowed set: ${CANONICAL_LABELS.join(", ")}.`,
    "- Keep labels simple and canonical, with qualifiers only when they are part of the allowed set.",
    "- Use machine token ids like [NOUN_1] and never attach suffixes like s, ed, or ing to a blank in the template.",
    "- Every token id is unique and used exactly once in the storyTemplate.",
    "- Every blank must fit its grammar slot naturally.",
    "- Family-safe humor and coherent narrative.",
    "- No markdown, no explanation text, only JSON object.",
    "",
    "JSON keys only: title, storyTemplate, blanks"
  ].join("\n");
}

export function parseTokens(template: string): string[] {
  return parseTemplateTokens(template);
}

function toBlankToken(id: string): BlankToken {
  return normalizeBlank({}, id, 0);
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
    const index = tokens.indexOf(id);
    byId.set(id, normalizeBlank(candidate, id, index >= 0 ? index : 0));
  }

  return tokens.map((id, index) => byId.get(id) ?? normalizeBlank({}, id, index));
}

function fillTokenWithExample(storyTemplate: string, tokenId: string, example: string): string {
  const replacement = example.trim() || tokenId;
  return storyTemplate.replaceAll(`[${tokenId}]`, replacement);
}

function trimBlankBudget(
  storyTemplate: string,
  blanks: BlankToken[],
  targetCount: number
): { storyTemplate: string; blanks: BlankToken[] } {
  if (blanks.length <= targetCount) {
    return { storyTemplate, blanks };
  }

  const kept = blanks.slice(0, targetCount);
  const removed = blanks.slice(targetCount);
  let nextTemplate = storyTemplate;

  for (const blank of removed) {
    nextTemplate = fillTokenWithExample(nextTemplate, blank.id, blank.example);
  }

  return {
    storyTemplate: nextTemplate,
    blanks: kept
  };
}

function dedupeStoryTemplate(
  storyTemplate: string,
  rawBlanks: unknown
): { storyTemplate: string; blanks: unknown } {
  const occurrences = parseTokenOccurrences(storyTemplate);
  const rawArray = Array.isArray(rawBlanks) ? rawBlanks : [];
  const blankById = new Map<string, Partial<BlankToken>>();

  for (const item of rawArray) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as Partial<BlankToken>;
    const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
    if (!id || blankById.has(id)) continue;
    blankById.set(id, candidate);
  }

  const usedIds = new Set<string>();
  const duplicateCounts = new Map<string, number>();
  const replacements: Array<{ start: number; end: number; nextId: string }> = [];
  const normalizedBlanks: BlankToken[] = [];

  for (const occurrence of occurrences) {
    const sourceBlank = rawArray[occurrence.index] as Partial<BlankToken> | undefined;
    const baseId = canonicalTokenId(sourceBlank?.label, occurrence.id, occurrence.index);
    const seenCount = duplicateCounts.get(baseId) ?? 0;
    let nextId = baseId;

    if (seenCount > 0 || usedIds.has(baseId)) {
      let suffix = seenCount + 1;
      do {
        nextId = `${baseId}_${suffix}`;
        suffix += 1;
      } while (usedIds.has(nextId));
    }

    duplicateCounts.set(baseId, seenCount + 1);
    usedIds.add(nextId);
    replacements.push({ start: occurrence.start, end: occurrence.end, nextId });
    normalizedBlanks.push(
      normalizeBlank(sourceBlank ?? blankById.get(occurrence.id) ?? blankById.get(baseId) ?? {}, nextId, normalizedBlanks.length)
    );
  }

  if (!replacements.some((item, index) => item.nextId !== occurrences[index]?.id)) {
    return {
      storyTemplate,
      blanks: rawBlanks
    };
  }

  let rebuilt = "";
  let cursor = 0;
  for (const replacement of replacements) {
    rebuilt += storyTemplate.slice(cursor, replacement.start);
    rebuilt += `[${replacement.nextId}]`;
    cursor = replacement.end;
  }
  rebuilt += storyTemplate.slice(cursor);

  return {
    storyTemplate: rebuilt,
    blanks: normalizedBlanks
  };
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function normalizedSnippetEdge(input: string, fromEnd: boolean): string {
  const chunk = fromEnd ? input.slice(-40) : input.slice(0, 40);
  return chunk.replace(/\s+/g, " ").trim().toLowerCase();
}

function looksVerbLabel(label: string): boolean {
  return /\bverb\b/.test(label) || /\bverb ending in -ing\b/.test(label) || /\bpast tense verb\b/.test(label);
}

function looksAdverbLabel(label: string): boolean {
  return /\badverb\b/.test(label);
}

function looksAdjectiveLabel(label: string): boolean {
  return /\badjective\b/.test(label) && !looksAdverbLabel(label);
}

function looksNounLabel(label: string): boolean {
  return [
    "noun",
    "plural noun",
    "animal",
    "body part",
    "place",
    "name",
    "number",
    "sound word",
    "exclamation",
    "color",
    "material",
    "food"
  ].some((candidate) => label.includes(candidate));
}

function hasAnyPattern(input: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(input));
}

function extractSeedKeywords(seed: string): string[] {
  const matches = seed.match(/[A-Za-z0-9']+/g) ?? [];
  const keywords: string[] = [];

  for (const raw of matches) {
    const normalized = raw.toLowerCase();
    if (normalized.length < 3) continue;
    if (SEED_STOP_WORDS.has(normalized)) continue;
    if (!keywords.includes(normalized)) keywords.push(normalized);
  }

  return keywords.slice(0, 6);
}

function lintOccurrence(blank: BlankToken, before: string, after: string): string[] {
  const reasons: string[] = [];
  const label = blank.label.trim().toLowerCase();
  const left = normalizedSnippetEdge(before, true);
  const right = normalizedSnippetEdge(after, false);

  const articleOrDeterminerBefore = [
    /\b(a|an|the|this|that|these|those|my|your|his|her|their|our)\s*$/i
  ];
  const infinitiveBefore = [/\bto\s*$/i, /\bshould\s*$/i, /\bcan\s*$/i, /\bwill\s*$/i, /\bmust\s*$/i];
  const beVerbBefore = [/\b(is|are|was|were|be|been|being|feel|seem|look)\s*$/i];
  const prepositionBefore = [/\b(for|with|under|inside|near|around|into|onto|beside|behind)\s*$/i];
  const nounishAfter = [/^\s*[a-z]+/i];

  if (looksVerbLabel(label) && hasAnyPattern(left, articleOrDeterminerBefore)) {
    reasons.push(`Token ${blank.id} is labeled as a verb but appears after an article/determiner.`);
  }

  if (looksAdverbLabel(label) && hasAnyPattern(left, articleOrDeterminerBefore)) {
    reasons.push(`Token ${blank.id} is labeled as an adverb but appears after an article/determiner.`);
  }

  if (label.includes("verb ending in -ing") && hasAnyPattern(left, articleOrDeterminerBefore)) {
    reasons.push(`Token ${blank.id} is labeled as a verb ending in -ing but appears in a noun-style slot.`);
  }

  if (looksAdjectiveLabel(label) && hasAnyPattern(left, infinitiveBefore)) {
    reasons.push(`Token ${blank.id} is labeled as an adjective but appears where a verb is expected.`);
  }

  if (looksNounLabel(label) && hasAnyPattern(left, infinitiveBefore)) {
    reasons.push(`Token ${blank.id} is labeled as a noun-like word but appears where a verb is expected.`);
  }

  if (looksAdjectiveLabel(label) && hasAnyPattern(left, articleOrDeterminerBefore) && !hasAnyPattern(right, nounishAfter)) {
    reasons.push(`Token ${blank.id} is labeled as an adjective but is not followed by a noun-like word.`);
  }

  if (looksAdverbLabel(label) && hasAnyPattern(left, prepositionBefore)) {
    reasons.push(`Token ${blank.id} is labeled as an adverb but appears after a preposition that usually takes a noun phrase.`);
  }

  if (looksNounLabel(label) && hasAnyPattern(left, beVerbBefore) && /^[\s]*[,.;!?]/.test(after)) {
    reasons.push(`Token ${blank.id} is labeled as a noun-like word but appears where an adjective is more likely.`);
  }

  if (/^[A-Za-z]/.test(after)) {
    reasons.push(`Token ${blank.id} is glued to following letters instead of standing alone as a full word.`);
  }

  if (/[A-Za-z]$/.test(left)) {
    reasons.push(`Token ${blank.id} is glued to preceding letters instead of standing alone as a full word.`);
  }

  return reasons;
}

export function assessStoryQuality(story: StoryTemplatePayload): StoryQualityReport {
  const wc = wordCount(story.storyTemplate);
  const occurrences = parseTokenOccurrences(story.storyTemplate);
  const tokenIds = occurrences.map((item) => item.id);
  const uniqueTokenCount = new Set(tokenIds).size;
  const reasons: string[] = [];

  if (wc < 130 || wc > 550) {
    reasons.push(`Story word count ${wc} is outside the allowed range.`);
  }

  if (uniqueTokenCount < MIN_BLANK_COUNT || uniqueTokenCount > TARGET_BLANK_COUNT) {
    reasons.push(`Story has ${uniqueTokenCount} unique blanks, outside the allowed range.`);
  }

  if (occurrences.length !== uniqueTokenCount) {
    const duplicates = [...new Set(tokenIds.filter((id, index) => tokenIds.indexOf(id) !== index))];
    reasons.push(`Story reuses token ids: ${duplicates.join(", ")}.`);
  }

  const blanksById = new Map(story.blanks.map((blank) => [blank.id, blank]));

  for (const occurrence of occurrences) {
    const blank = blanksById.get(occurrence.id) ?? normalizeBlank({}, occurrence.id, occurrence.index);
    reasons.push(...lintOccurrence(blank, occurrence.before, occurrence.after));
  }

  return {
    passes: reasons.length === 0,
    reasons
  };
}

export function assessSeedAdherence(seed: string, story: StoryTemplatePayload): SeedAdherenceReport {
  const keywords = extractSeedKeywords(seed);
  if (!keywords.length) {
    return {
      passes: true,
      reasons: [],
      matchedKeywords: [],
      targetKeywords: []
    };
  }

  const combined = `${story.title} ${story.storyTemplate}`.toLowerCase();
  const opener = `${story.title} ${story.storyTemplate.slice(0, 220)}`.toLowerCase();
  const matchedKeywords = keywords.filter((keyword) => combined.includes(keyword));
  const minimumMatches = keywords.length >= 4 ? 2 : 1;
  const reasons: string[] = [];

  if (matchedKeywords.length < minimumMatches) {
    reasons.push(
      `Story only matched ${matchedKeywords.length} of ${keywords.length} seed keywords.`
    );
  }

  if (!matchedKeywords.some((keyword) => opener.includes(keyword))) {
    reasons.push("Story opening does not clearly anchor back to the seed.");
  }

  return {
    passes: reasons.length === 0,
    reasons,
    matchedKeywords,
    targetKeywords: keywords
  };
}

function qualityPasses(seed: string, story: StoryTemplatePayload): boolean {
  return assessStoryQuality(story).passes && assessSeedAdherence(seed, story).passes;
}

function normalizeParsedStory(parsed: Partial<StoryTemplatePayload>): StoryTemplatePayload | null {
  if (!parsed.storyTemplate || !parsed.title) return null;
  const deduped = dedupeStoryTemplate(parsed.storyTemplate, parsed.blanks);
  const tokens = parseTokens(deduped.storyTemplate);
  const normalized = normalizeBlanks(deduped.blanks, tokens);
  const budgeted = trimBlankBudget(deduped.storyTemplate, normalized, TARGET_BLANK_COUNT);
  const finalTokens = parseTokens(budgeted.storyTemplate);
  const blanks = normalizeBlanks(budgeted.blanks, finalTokens);
  return {
    title: parsed.title,
    storyTemplate: budgeted.storyTemplate,
    blanks
  };
}

async function requestStoryFromModel(seed: string, retry = false): Promise<StoryTemplatePayload | null> {
  const client = getOpenAIClient();
  if (!client) return null;

  const model = process.env.OPENAI_STORY_MODEL ?? "gpt-4.1-mini";
  try {
    const response = await client.responses.create({
      model,
      input: retry ? createRetryStoryPrompt(seed) : createStoryPrompt(seed),
      max_output_tokens: 2200,
      store: false,
      text: {
        format: zodTextFormat(storyResponseSchema, "story_payload")
      }
    });

    const text = response.output_text?.trim();
    if (!text) return null;
    const parsed = storyResponseSchema.parse(JSON.parse(text));
    return normalizeParsedStory(parsed);
  } catch {
    return null;
  }
}

export async function generateStory(seed: string): Promise<StoryTemplatePayload> {
  const firstAttempt = await requestStoryFromModel(seed, false);
  if (firstAttempt && qualityPasses(seed, firstAttempt)) return firstAttempt;

  const retryAttempt = await requestStoryFromModel(seed, true);
  if (retryAttempt && qualityPasses(seed, retryAttempt)) return retryAttempt;

  if (retryAttempt) return retryAttempt;
  if (firstAttempt) return firstAttempt;
  return buildFallbackStory(seed);
}

export function fillStoryTemplate(storyTemplate: string, fills: Record<string, string>): string {
  return fillStoryTemplateWithContext(storyTemplate, fills);
}
