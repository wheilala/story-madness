import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { getOpenAIClient } from "@/lib/openai-client";
import {
  CANONICAL_LABELS,
  PromptTypeKey,
  normalizeBlank,
  promptDefinition
} from "@/lib/madlib-labels";
import {
  fillStoryTemplate as fillStoryTemplateWithContext,
  parseTokenOccurrences,
  parseTokens as parseTemplateTokens
} from "@/lib/story-format";
import {
  buildHumorShadowStory,
  extractBlankedStory,
  hasEnoughBlankCandidates
} from "@/lib/story-candidates";
import { recommendFunnyBlankSpans } from "@/lib/story-humor-selector";
import { readDoc, wink } from "@/lib/wink";
import {
  BlankToken,
  StoryGenerationAttemptDiagnostic,
  StoryPipelineDiagnostics,
  StoryTemplatePayload
} from "@/lib/types";

export type StoryQualityReport = {
  passes: boolean;
  reasons: string[];
  categories: {
    blanks: string[];
    schema: string[];
    cohesion: string[];
  };
  grammarSlotIssueCount: number;
  unreplacedTokenCount: number;
};

export type SeedAdherenceReport = {
  passes: boolean;
  reasons: string[];
  matchedKeywords: string[];
  targetKeywords: string[];
};

export type StoryValidationResult = {
  decision: "accept" | "accept_with_blank_repair" | "retry";
  quality: StoryQualityReport;
  seed: SeedAdherenceReport;
  cohesionReasons: string[];
};

export type GenerateStoryResult = {
  story: StoryTemplatePayload;
  diagnostics: StoryPipelineDiagnostics;
};

type AuthoredStoryScaffold = {
  title: string;
  storyBody: string;
};

type RepairStats = {
  candidateCount: number;
  chosenCount: number;
  slotRepairCount: number;
  selector: "local" | "humor_shadow";
};

const TARGET_BLANK_COUNT = 12;
const MIN_BLANK_COUNT = 10;

const storyResponseSchema = z.object({
  title: z.string().min(1),
  storyBody: z.string().min(80)
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

const COMMON_CAPITALIZED_WORDS = new Set([
  "A",
  "An",
  "The",
  "That",
  "This",
  "One",
  "Two",
  "Three",
  "By",
  "At",
  "In",
  "On",
  "After",
  "Before",
  "Then",
  "Later",
  "Everyone",
  "Meanwhile"
]);

const ENABLE_WEAK_ENDING_CHECK = false;

function dedupeReasons(items: string[]): string[] {
  return [...new Set(items)];
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

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
      "One [ADJECTIVE_2] neighbor [VERB_PAST_3] toward the doorway while a wobbling pile of [PLURAL_NOUN_4] tipped sideways and made the mess look even bigger. " +
      "The main troublemaker blinked, lifted a sticky [BODY_PART_5], and let out a tiny \"[SOUND_6]!\" that somehow made the room feel funnier than scarier.\n\n" +
      "Someone pointed at a [OBJECT_7] near the corner. Another helper tried to [VERB_8] the crowd before the panic spread farther down the hall. " +
      "A helpful kid moved [ADVERB_9] across the floor, grabbed [PLURAL_NOUN_10], and started wiping up the mess. " +
      "Even a curious [ANIMAL_11] peered in as the whole scene buzzed with laughter, confusion, and relief.\n\n" +
      "By the end, everybody agreed the adventure felt [ADJECTIVE_12] and unforgettable.",
    blanks: [
      { id: "PLACE_1", label: "Place", partOfSpeech: "singular_noun", example: "laundry room" },
      { id: "ADJECTIVE_2", label: "Adjective", partOfSpeech: "adjective", example: "frazzled" },
      { id: "VERB_PAST_3", label: "Past Tense Verb", partOfSpeech: "past_tense_verb", example: "sprinted" },
      { id: "PLURAL_NOUN_4", label: "Plural Noun", partOfSpeech: "plural_noun", example: "socks" },
      { id: "BODY_PART_5", label: "Body Part", partOfSpeech: "singular_noun", example: "elbow" },
      { id: "SOUND_6", label: "Sound Word", partOfSpeech: "interjection", example: "eep" },
      { id: "OBJECT_7", label: "Object", partOfSpeech: "singular_noun", example: "basket" },
      { id: "VERB_8", label: "Verb", partOfSpeech: "base_verb", example: "calm" },
      { id: "ADVERB_9", label: "Adverb", partOfSpeech: "adverb", example: "carefully" },
      { id: "PLURAL_NOUN_10", label: "Plural Noun", partOfSpeech: "plural_noun", example: "towels" },
      { id: "ANIMAL_11", label: "Animal", partOfSpeech: "singular_noun", example: "puppy" },
      { id: "ADJECTIVE_12", label: "Adjective", partOfSpeech: "adjective", example: "ridiculous" }
    ].map((blank, index) => normalizeBlank(blank, blank.id, index))
  };
}

function createStoryPrompt(seed: string): string {
  return [
    "Create a family-safe silly story JSON using this seed:",
    seed,
    "",
    "Requirements:",
    "- One page style short story around 250-430 words.",
    "- Follow a clear four-beat arc: setup, conflict, escalating chaos, and satisfying resolution.",
    "- Open directly inside the story world, not with commentary about the idea, the seed, or how the story began.",
    "- Stay tightly anchored to the seed's main character, setting, and inciting incident from beginning to end.",
    "- Mention at least two concrete details from the seed in the title or story body, not just once in the opening line.",
    "- Do not introduce recurring named characters, mascots, or proper nouns unless they are already present in the seed.",
    "- Do not quote or restate the seed over and over. Use the seed as story grounding, not repeated filler text.",
    "- Keep the setting physically consistent unless the story clearly moves to a new nearby place.",
    "- Make the story funny, surprising, and coherent for kids.",
    "- Use visual comedy and specific actions like wobbling, chasing, slipping, shouting, overreacting, spilling, or neighborhood commotion.",
    "- Use vivid, concrete wording so a later local blank-selection system can find funny replaceable words and phrases.",
    "- Do not include any [TOKEN] placeholders or blank markers in the story.",
    "- Avoid repetitive filler words like scene, crowd, situation, or adventure unless they are truly needed.",
    "- No markdown, no explanation text, only JSON object.",
    "",
    "Return strict JSON with keys:",
    "title, storyBody"
  ].join("\n");
}

function createRetryStoryPrompt(seed: string, previousIssues: string[] = []): string {
  return [
    "You previously generated output that did not meet quality requirements.",
    "Regenerate now as strict JSON with stronger compliance.",
    "",
    "Seed:",
    seed,
    "",
    "Hard requirements:",
    "- 280-450 words in storyTemplate.",
    "- Keep the story clearly about the original seed all the way through.",
    "- Use a clear setup, conflict, escalation, and resolution arc.",
    "- Start in-scene and never recap the seed or describe the premise from outside the story.",
    "- Keep the physical setting consistent and concrete.",
    "- Write the story as clean prose with no placeholder tokens.",
    "- Use vivid, replaceable wording so a later local blank-selection system can extract around 10-12 funny blanks.",
    "- Keep the humor lively and the story coherent.",
    "- No markdown, no explanation text, only JSON object.",
    ...(previousIssues.length
      ? [
          "",
          "Fix these specific problems from the last attempt:",
          ...previousIssues.slice(0, 8).map((issue) => `- ${issue}`)
        ]
      : [])
  ].join("\n");
}

export function parseTokens(template: string): string[] {
  return parseTemplateTokens(template);
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function normalizedSnippetEdge(input: string, fromEnd: boolean): string {
  const chunk = fromEnd ? input.slice(-40) : input.slice(0, 40);
  return chunk.replace(/\s+/g, " ").trim().toLowerCase();
}

function tokenPosList(text: string): string[] {
  const normalized = text.trim();
  if (!normalized) return [];
  return (readDoc(normalized).tokens().out(wink.its.pos) as string[]).filter(Boolean);
}

function firstLexicalPos(text: string): string | null {
  const list = tokenPosList(text);
  return list[0] ?? null;
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

  return keywords.slice(0, 8);
}

async function extractOrRepairBlanks(
  seed: string,
  scaffold: AuthoredStoryScaffold
): Promise<{ story: StoryTemplatePayload; repairStats: RepairStats; selectorDurationMs: number }> {
  const selectorStartedAt = now();
  const extracted = extractBlankedStory(seed, scaffold.title, scaffold.storyBody);
  const localSlotRepaired = reconcileBlankTypesWithSlots(extracted.story);

  let selectedStory = localSlotRepaired.story;
  let repairStats: RepairStats = {
    candidateCount: extracted.candidateCount,
    chosenCount: extracted.chosenCount,
    slotRepairCount: localSlotRepaired.slotRepairCount,
    selector: "local"
  };

  const recommendations = await recommendFunnyBlankSpans({
    seed,
    title: scaffold.title,
    storyBody: scaffold.storyBody
  });

  if (recommendations.recommendations.length) {
    const humorSelected = buildHumorShadowStory(
      seed,
      scaffold.title,
      scaffold.storyBody,
      recommendations.recommendations
    );
    const humorSlotRepaired = reconcileBlankTypesWithSlots(humorSelected.story);
    const humorResult = {
      story: humorSlotRepaired.story,
      candidateCount: humorSelected.candidateCount,
      chosenCount: humorSelected.chosenCount
    };

    if (hasEnoughBlankCandidates(humorResult)) {
      selectedStory = humorResult.story;
      repairStats = {
        candidateCount: humorSelected.candidateCount,
        chosenCount: humorSelected.chosenCount,
        slotRepairCount: humorSlotRepaired.slotRepairCount,
        selector: "humor_shadow"
      };
    }
  }

  return {
    story: selectedStory,
    repairStats,
    selectorDurationMs: now() - selectorStartedAt
  };
}

function inferSlotShape(before: string, after: string):
  | "plural_countable_noun"
  | "noun_phrase"
  | "base_verb"
  | "past_tense_predicate"
  | "gerund_phrase"
  | "adjective_before_noun"
  | "adjective_predicate"
  | "adverb_modifier"
  | "freeform" {
  const left = normalizedSnippetEdge(before, true);
  const right = normalizedSnippetEdge(after, false);
  const nextPos = firstLexicalPos(after);

  if (/\b(many|several|few|those|these)\s*$/.test(left)) return "plural_countable_noun";
  if (/\b(to|can|should|will|must|might|could)\s*$/.test(left)) return "base_verb";
  if (/\b(had|has|have)\s*$/.test(left)) return "past_tense_predicate";
  if (/\b(kept|started|began|went|was|were)\s*$/.test(left)) return "gerund_phrase";
  if (
    /\b(a|an|the|this|that|my|your|his|her|their|our)\s*$/.test(left) &&
    (nextPos === "NOUN" || nextPos === "PROPN")
  ) {
    return "adjective_before_noun";
  }
  if (/\b(a|an|the|this|that|my|your|his|her|their|our)\s*$/.test(left)) return "noun_phrase";
  if (/\b(for|with|under|inside|near|around|into|onto|beside|behind|at)\s*$/.test(left)) return "noun_phrase";
  if (/\b(is|are|was|were|feel|seem|look)\s*$/.test(left) && /^[\s]*[,.;!?]/.test(after)) {
    return "adjective_predicate";
  }
  if (/\b(very|really|super|too)\s*$/.test(left)) return "adjective_predicate";
  if (/\b(moved|ran|worked|laughed|spoke|walked|zoomed|grinned|tiptoed)\s*$/.test(left)) {
    return "adverb_modifier";
  }
  return "freeform";
}

function slotAcceptsType(shape: ReturnType<typeof inferSlotShape>, type: PromptTypeKey): boolean {
  const singularNounish: PromptTypeKey[] = [
    "Noun",
    "Person",
    "Place",
    "Object",
    "Animal",
    "Food",
    "Body Part",
    "Job",
    "Name",
    "Proper Noun",
    "Clothing",
    "Vehicle",
    "School Subject",
    "Holiday",
    "Emotion"
  ];

  switch (shape) {
    case "plural_countable_noun":
      return type === "Plural Noun" || type === "Plural Animal";
    case "noun_phrase":
      return singularNounish.includes(type) || type === "Plural Noun" || type === "Plural Animal" || type === "Number";
    case "base_verb":
      return type === "Verb";
    case "past_tense_predicate":
      return type === "Past Tense Verb";
    case "gerund_phrase":
      return type === "Verb Ending In Ing";
    case "adjective_before_noun":
    case "adjective_predicate":
      return type === "Adjective" || type === "Color";
    case "adverb_modifier":
      return type === "Adverb";
    case "freeform":
      return true;
  }
}

function remapTypeForSlot(shape: ReturnType<typeof inferSlotShape>, type: PromptTypeKey): PromptTypeKey | null {
  if (slotAcceptsType(shape, type)) return type;

  switch (shape) {
    case "gerund_phrase":
      if (type === "Verb") return "Verb Ending In Ing";
      return null;
    case "past_tense_predicate":
      if (type === "Verb") return "Past Tense Verb";
      return null;
    case "plural_countable_noun":
      if (type === "Animal") return "Plural Animal";
      if (
        [
          "Noun",
          "Object",
          "Food",
          "Body Part",
          "Place",
          "Person",
          "Job"
        ].includes(type)
      ) {
        return "Plural Noun";
      }
      return null;
    case "adjective_before_noun":
    case "adjective_predicate":
      if (
        ["Noun", "Object", "Food", "Emotion", "Proper Noun"].includes(type)
      ) {
        return "Adjective";
      }
      return null;
    case "noun_phrase":
      if (type === "Adjective") return "Noun";
      return null;
    default:
      return null;
  }
}

function rebuildBlankWithType(blank: BlankToken, nextType: PromptTypeKey): BlankToken {
  const definition = promptDefinition(nextType);
  return {
    ...blank,
    label: definition.displayLabel,
    displayLabel: definition.displayLabel,
    type: definition.displayLabel,
    surfaceForm: definition.surfaceForm,
    partOfSpeech: definition.surfaceForm
  };
}

function reconcileBlankTypesWithSlots(story: StoryTemplatePayload): { story: StoryTemplatePayload; slotRepairCount: number } {
  const blanksById = new Map(story.blanks.map((blank) => [blank.id, blank]));
  let slotRepairCount = 0;

  for (const occurrence of parseTokenOccurrences(story.storyTemplate)) {
    const blank = blanksById.get(occurrence.id);
    if (!blank) continue;
    const shape = inferSlotShape(occurrence.before, occurrence.after);
    const repairedType = remapTypeForSlot(shape, blank.type as PromptTypeKey);
    if (repairedType && repairedType !== blank.type) {
      blanksById.set(blank.id, rebuildBlankWithType(blank, repairedType));
      slotRepairCount += 1;
    }
  }

  return {
    story: {
      ...story,
      blanks: story.blanks.map((blank) => blanksById.get(blank.id) ?? blank)
    },
    slotRepairCount
  };
}

function assessStoryCohesion(seed: string, story: StoryTemplatePayload): string[] {
  const reasons: string[] = [];
  const text = `${story.title} ${story.storyTemplate}`;
  const seedSummary = summarizeSeed(seed).toLowerCase();
  const normalizedStory = story.storyTemplate.toLowerCase();
  const openingWindow = normalizedStory.slice(0, 220);

  if (seedSummary.length > 30 && text.toLowerCase().includes(seedSummary)) {
    reasons.push("Story repeats a long slice of the seed instead of naturally reusing its details.");
  }

  if (
    /\beveryone kept talking about\b|\bwhat kicked this off\b|\bthe wild idea\b|\bthe original idea\b|\bthis all started because\b/.test(openingWindow)
  ) {
    reasons.push("Story opens with meta recap language instead of diving into the scene.");
  }

  const sentences = story.storyTemplate
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const starters = new Map<string, number>();
  for (const sentence of sentences) {
    const starter = sentence.toLowerCase().split(/\s+/).slice(0, 2).join(" ");
    if (!starter) continue;
    starters.set(starter, (starters.get(starter) ?? 0) + 1);
  }
  if ([...starters.values()].some((count) => count >= 3)) {
    reasons.push("Story reuses the same sentence openings too often, making the rhythm feel flat.");
  }

  const seedKeywords = new Set(extractSeedKeywords(seed).map((keyword) => titleCase(keyword)));
  const entityDetails = (readDoc(text).entities().out(wink.its.detail) as Array<{ value?: string; type?: string }>).filter(Boolean);
  const personEntityCounts = new Map<string, number>();
  for (const entity of entityDetails) {
    if (entity.type !== "PERSON" || !entity.value) continue;
    const value = entity.value.trim();
    if (!value) continue;
    personEntityCounts.set(value, (personEntityCounts.get(value) ?? 0) + 1);
  }
  const repeatedForeignNames = [...personEntityCounts.entries()]
    .filter(([name, count]) => count > 1 && !COMMON_CAPITALIZED_WORDS.has(name) && !seedKeywords.has(name))
    .map(([name]) => name);
  if (repeatedForeignNames.length) {
    reasons.push(`Story introduces recurring capitalized names not grounded in the seed: ${repeatedForeignNames.join(", ")}.`);
  }

  const streetSeed = /\bstreet\b|\broad\b|\bsidewalk\b|\bdriveway\b|\byard\b|\bneighborhood\b|\btrash can\b|\btrash cans\b/.test(seed.toLowerCase());
  const indoorDriftWithoutMove =
    streetSeed &&
    /\broom\b|\bhallway\b|\bcorner\b/.test(normalizedStory) &&
    !/\bhouse\b|\bgarage\b|\binside\b|\bindoors\b|\binto\b/.test(normalizedStory);
  if (indoorDriftWithoutMove) {
    reasons.push("Story drifts into an indoor-feeling setting without clearly moving there from the original outdoor seed.");
  }

  const genericScenePhrases = normalizedStory.match(/\b(the whole scene|the crowd|the situation|the adventure)\b/g) ?? [];
  if (genericScenePhrases.length >= 3) {
    reasons.push("Story leans on generic scene language too often instead of specific visual details.");
  }

  if (ENABLE_WEAK_ENDING_CHECK) {
    const resolutionWindow = sentences.slice(-2).join(" ").toLowerCase();
    const hasResolutionCue = /\b(finally|at last|by the end|after that|once|soon|in the end|eventually)\b/.test(resolutionWindow);
    const hasResolutionOutcome =
      /\b(settled|settled down|calmed|safe|saved|clean|cleaned|back where|home again|back to normal|normal again|under control|smiled|laughed|cheered|relieved|proud|learned|promised|agreed|returned|restored|rescued|fixed|tidy|caught|contained|organized|peaceful|quiet again|back on track)\b/.test(
        resolutionWindow
      );
    if (!hasResolutionCue && !hasResolutionOutcome) {
      reasons.push("Story ending feels weak or abrupt instead of landing a clear resolution beat.");
    }
  }

  return reasons;
}

function classifyQualityReason(reason: string): "blanks" | "schema" | "cohesion" {
  if (reason.includes("outside the allowed range") || reason.includes("word count")) return "schema";
  if (
    reason.includes("Token") ||
    reason.includes("reuses token ids") ||
    reason.includes("storyTemplate") ||
    reason.includes("unmatched")
  ) {
    return "blanks";
  }
  return "cohesion";
}

function lintOccurrence(blank: BlankToken, before: string, after: string): string[] {
  const reasons: string[] = [];
  const shape = inferSlotShape(before, after);

  if (!slotAcceptsType(shape, blank.type as PromptTypeKey)) {
    reasons.push(`Token ${blank.id} uses ${blank.type} in a ${shape.replaceAll("_", " ")} slot.`);
  }

  if (/^[A-Za-z]/.test(after)) {
    reasons.push(`Token ${blank.id} is glued to following letters instead of standing alone as a full word.`);
  }

  if (/[A-Za-z]$/.test(before)) {
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
  const categories = {
    blanks: [] as string[],
    schema: [] as string[],
    cohesion: [] as string[]
  };

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
  const unreplacedTokenCount = occurrences.filter((occurrence) => !blanksById.has(occurrence.id)).length;
  if (unreplacedTokenCount > 0) {
    reasons.push(`Story has ${unreplacedTokenCount} unmatched tokens without blank metadata.`);
  }

  for (const occurrence of occurrences) {
    const blank = blanksById.get(occurrence.id) ?? normalizeBlank({}, occurrence.id, occurrence.index);
    reasons.push(...lintOccurrence(blank, occurrence.before, occurrence.after));
  }

  for (const reason of reasons) {
    categories[classifyQualityReason(reason)].push(reason);
  }

  return {
    passes: reasons.length === 0,
    reasons,
    categories,
    grammarSlotIssueCount: reasons.filter((reason) => reason.includes("slot") || reason.includes("glued")).length,
    unreplacedTokenCount
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
  const openingMatches = keywords.filter((keyword) => opener.includes(keyword));
  const minimumMatches = keywords.length >= 5 ? 3 : 2;
  const minimumOpeningMatches = keywords.length >= 4 ? 1 : Math.min(1, keywords.length);
  const reasons: string[] = [];

  if (matchedKeywords.length < minimumMatches) {
    reasons.push(`Story only matched ${matchedKeywords.length} of ${keywords.length} seed keywords.`);
  }

  if (openingMatches.length < minimumOpeningMatches) {
    reasons.push("Story opening does not clearly anchor back to the seed.");
  }

  return {
    passes: reasons.length === 0,
    reasons,
    matchedKeywords,
    targetKeywords: keywords
  };
}

export function validateStoryDraft(seed: string, story: StoryTemplatePayload, repairStats?: RepairStats): StoryValidationResult {
  const quality = assessStoryQuality(story);
  const seedReport = assessSeedAdherence(seed, story);
  const cohesionReasons = assessStoryCohesion(seed, story);

  if (repairStats && (repairStats.chosenCount < MIN_BLANK_COUNT || repairStats.chosenCount > TARGET_BLANK_COUNT)) {
    quality.reasons.push(`Local blank extraction produced ${repairStats.chosenCount} blanks, outside the allowed range.`);
    quality.categories.schema.push(`Local blank extraction produced ${repairStats.chosenCount} blanks, outside the allowed range.`);
    quality.passes = false;
  }

  if (!quality.passes || !seedReport.passes || cohesionReasons.length > 0) {
    return {
      decision: "retry",
      quality: {
        ...quality,
        categories: {
          ...quality.categories,
          cohesion: [...quality.categories.cohesion, ...cohesionReasons]
        }
      },
      seed: seedReport,
      cohesionReasons
    };
  }

  const repaired = Boolean(
    repairStats &&
      repairStats.slotRepairCount > 0
  );

  return {
    decision: repaired ? "accept_with_blank_repair" : "accept",
    quality,
    seed: seedReport,
    cohesionReasons
  };
}

async function authorStoryFromSeed(
  seed: string,
  retry = false,
  previousIssues: string[] = []
): Promise<{ scaffold: AuthoredStoryScaffold | null; durationMs: number }> {
  const startedAt = now();
  const client = getOpenAIClient();
  if (!client) {
    return { scaffold: null, durationMs: now() - startedAt };
  }

  const model = process.env.OPENAI_STORY_MODEL ?? "gpt-4.1-mini";
  try {
    const response = await client.responses.create({
      model,
      input: retry ? createRetryStoryPrompt(seed, previousIssues) : createStoryPrompt(seed),
      max_output_tokens: 2200,
      store: false,
      text: {
        format: zodTextFormat(storyResponseSchema, "story_payload")
      }
    });

    const text = response.output_text?.trim();
    if (!text) return { scaffold: null, durationMs: now() - startedAt };
    const parsed = storyResponseSchema.parse(JSON.parse(text));
    return {
      scaffold: parsed,
      durationMs: now() - startedAt
    };
  } catch {
    return {
      scaffold: null,
      durationMs: now() - startedAt
    };
  }
}

function diagnosticsFromValidation(
  validation: StoryValidationResult,
  baseTimings: StoryPipelineDiagnostics["timings"],
  retryUsed: boolean,
  fallbackUsed: boolean,
  attempts: StoryGenerationAttemptDiagnostic[],
  finalOutcome: StoryPipelineDiagnostics["finalOutcome"]
): StoryPipelineDiagnostics {
  return {
    fallbackUsed,
    retryUsed,
    unreplacedTokenCount: validation.quality.unreplacedTokenCount,
    grammarSlotIssueCount: validation.quality.grammarSlotIssueCount,
    finalOutcome,
    failureCategories: {
      seed: dedupeReasons(validation.seed.reasons),
      blanks: dedupeReasons(validation.quality.categories.blanks),
      schema: dedupeReasons(validation.quality.categories.schema),
      cohesion: dedupeReasons([...validation.quality.categories.cohesion, ...validation.cohesionReasons])
    },
    attempts,
    timings: baseTimings
  };
}

export async function generateStory(seed: string): Promise<GenerateStoryResult> {
  const timings: StoryPipelineDiagnostics["timings"] = [];
  const attempts: StoryGenerationAttemptDiagnostic[] = [];
  let retryIssues: string[] = [];
  const firstAttempt = await authorStoryFromSeed(seed, false);
  timings.push({ stage: "story_model_initial", durationMs: firstAttempt.durationMs });

  if (firstAttempt.scaffold) {
    const normalizeStart = now();
    const repaired = await extractOrRepairBlanks(seed, firstAttempt.scaffold);
    timings.push({ stage: "normalize_initial", durationMs: now() - normalizeStart });
    timings.push({ stage: "selector_initial", durationMs: repaired.selectorDurationMs });
    const validation = validateStoryDraft(seed, repaired.story, repaired.repairStats);
    if (validation.decision !== "retry") {
      attempts.push({
        attempt: "initial",
        outcome: "accepted",
        summary:
          validation.decision === "accept_with_blank_repair"
            ? "Initial model output passed after local blank repair."
            : "Initial model output passed quality checks.",
        failureCategories: diagnosticsFromValidation(
          validation,
          [],
          false,
          false,
          [],
          validation.decision === "accept_with_blank_repair" ? "accepted_with_repairs" : "accepted"
        ).failureCategories
      });
      return {
        story: repaired.story,
        diagnostics: diagnosticsFromValidation(
          validation,
          timings,
          false,
          false,
          attempts,
          validation.decision === "accept_with_blank_repair" ? "accepted_with_repairs" : "accepted"
        )
      };
    }

    attempts.push({
      attempt: "initial",
      outcome: "retry_requested",
      summary: "Initial model output did not pass quality checks and triggered a retry.",
      failureCategories: {
        seed: dedupeReasons(validation.seed.reasons),
        blanks: dedupeReasons(validation.quality.categories.blanks),
        schema: dedupeReasons(validation.quality.categories.schema),
        cohesion: dedupeReasons([...validation.quality.categories.cohesion, ...validation.cohesionReasons])
      }
    });
    retryIssues = dedupeReasons([
      ...validation.seed.reasons,
      ...validation.quality.categories.blanks,
      ...validation.quality.categories.schema,
      ...validation.quality.categories.cohesion,
      ...validation.cohesionReasons
    ]);
  } else {
    attempts.push({
      attempt: "initial",
      outcome: "model_error",
      summary: "Initial model output was missing or invalid."
    });
  }

  const retryAttempt = await authorStoryFromSeed(seed, true, retryIssues);
  timings.push({ stage: "story_model_retry", durationMs: retryAttempt.durationMs });

  if (retryAttempt.scaffold) {
    const normalizeStart = now();
    const repaired = await extractOrRepairBlanks(seed, retryAttempt.scaffold);
    timings.push({ stage: "normalize_retry", durationMs: now() - normalizeStart });
    timings.push({ stage: "selector_retry", durationMs: repaired.selectorDurationMs });
    const validation = validateStoryDraft(seed, repaired.story, repaired.repairStats);
    if (validation.decision !== "retry") {
      attempts.push({
        attempt: "retry",
        outcome: "accepted",
        summary:
          validation.decision === "accept_with_blank_repair"
            ? "Retry output passed after local blank repair."
            : "Retry output passed quality checks.",
        failureCategories: diagnosticsFromValidation(
          validation,
          [],
          true,
          false,
          [],
          validation.decision === "accept_with_blank_repair" ? "accepted_with_repairs" : "accepted"
        ).failureCategories
      });
      return {
        story: repaired.story,
        diagnostics: diagnosticsFromValidation(
          validation,
          timings,
          true,
          false,
          attempts,
          validation.decision === "accept_with_blank_repair" ? "accepted_with_repairs" : "accepted"
        )
      };
    }

    attempts.push({
      attempt: "retry",
      outcome: "retry_requested",
      summary: "Retry output still did not pass quality checks.",
      failureCategories: {
        seed: dedupeReasons(validation.seed.reasons),
        blanks: dedupeReasons(validation.quality.categories.blanks),
        schema: dedupeReasons(validation.quality.categories.schema),
        cohesion: dedupeReasons([...validation.quality.categories.cohesion, ...validation.cohesionReasons])
      }
    });
  } else {
    attempts.push({
      attempt: "retry",
      outcome: "model_error",
      summary: "Retry output was missing or invalid."
    });
  }

  const fallbackStart = now();
  const fallback = buildFallbackStory(seed);
  timings.push({ stage: "fallback", durationMs: now() - fallbackStart });
  const fallbackValidation = validateStoryDraft(seed, fallback);
  attempts.push({
    attempt: "fallback",
    outcome: "fallback_used",
    summary: "Fallback scaffold was used because authored model output never passed quality checks."
  });

  return {
    story: fallback,
    diagnostics: diagnosticsFromValidation(fallbackValidation, timings, true, true, attempts, "fallback")
  };
}

export function fillStoryTemplate(storyTemplate: string, fills: Record<string, string>): string {
  return fillStoryTemplateWithContext(storyTemplate, fills);
}
