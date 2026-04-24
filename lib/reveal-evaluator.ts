import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { PromptTypeKey } from "@/lib/madlib-labels";
import { getOpenAIClient } from "@/lib/openai-client";
import { parseTokens } from "@/lib/story-format";
import {
  BlankToken,
  RevealEvaluationDeterministicReport,
  RevealEvaluationModelReport,
  RevealEvaluationReport
} from "@/lib/types";

type FunnyVerbEntry = {
  base: string;
  past: string;
  ing: string;
};

type FunnyWordsCatalog = {
  version: string;
  fallbackCategory: string;
  categories: Record<string, string[] | FunnyVerbEntry[]>;
};

const NOUN_FAMILY_TYPES = new Set<PromptTypeKey>([
  "Noun",
  "Plural Noun",
  "Object",
  "Place",
  "Animal",
  "Plural Animal",
  "Food",
  "Body Part",
  "Person",
  "Name",
  "Proper Noun",
  "Job",
  "Clothing",
  "Vehicle",
  "School Subject",
  "Holiday",
  "Emotion"
]);

const GENERIC_NOUN_TYPES = new Set<PromptTypeKey>(["Noun", "Plural Noun"]);

const EXTRA_CATEGORY_VALUES: Record<string, string[]> = {
  animal: ["zebra", "hamster", "duck", "puppy", "llama"],
  plural_animal: ["zebras", "hamsters", "ducks", "puppies", "llamas"],
  place: ["moon base", "pickle park", "wiggle station", "noodle plaza", "puddle alley"],
  person: ["mail carrier", "camp counselor", "crossing guard", "pickle detective", "lunch lady"],
  food: ["taco", "pancake stack", "pickle sandwich", "cupcake", "cheeseburger"],
  body_part: ["elbow", "kneecap", "eyebrow", "big toe", "nose"],
  color: ["teal", "sunset orange", "lime green", "bubblegum pink", "mustard yellow"],
  number: ["7", "12", "23", "108", "3000"],
  job: ["astronaut", "lifeguard", "news reporter", "detective", "baker"],
  exclamation: ["Yikes", "Whoa", "Hooray", "Oops", "Eek"],
  name: ["Maya", "Zeke", "Lulu", "Benny", "Tessa"],
  clothing: ["cape", "rain boot", "sneaker", "helmet", "apron"],
  vehicle: ["bicycle", "scooter", "school bus", "wagon", "soapbox car"],
  school_subject: ["science", "history", "music", "art", "math"],
  holiday: ["Halloween", "Thanksgiving", "Pajama Day", "Snow Day", "Field Day"],
  emotion: ["embarrassment", "delight", "confusion", "pride", "panic"]
};

const modelEvaluationSchema = z.object({
  coherenceScore: z.number().int().min(1).max(5),
  humorFitScore: z.number().int().min(1).max(5),
  naturalnessScore: z.number().int().min(1).max(5),
  semanticDriftScore: z.number().int().min(1).max(5),
  pass: z.boolean(),
  confidence: z.number().min(0).max(1),
  summary: z.string().min(1),
  flaggedSubstitutions: z.array(z.string()).max(5)
});

function startsWithVowelSound(word: string): boolean {
  const lowered = word.toLowerCase();
  if (!lowered) return false;
  if (/^(honest|honor|honour|hour|heir)/.test(lowered)) return true;
  if (/^(uni([^nmd]|$)|use|user|euro|one|once|ubiq|ufo)/.test(lowered)) return false;
  return /^[aeiou]/.test(lowered);
}

function expectedArticle(word: string): "a" | "an" {
  return startsWithVowelSound(word) ? "an" : "a";
}

function firstWord(text: string): string {
  const match = text.trim().match(/[A-Za-z][A-Za-z'-]*/);
  return match?.[0] ?? "";
}

function normalizeCategoryName(type: PromptTypeKey): string {
  switch (type) {
    case "Noun":
      return "noun";
    case "Plural Noun":
      return "plural_noun";
    case "Adjective":
      return "adjective";
    case "Adverb":
      return "adverb";
    case "Verb":
    case "Past Tense Verb":
    case "Verb Ending In Ing":
      return "verb";
    case "Proper Noun":
      return "proper_noun";
    case "Sound Word":
    case "Exclamation":
      return "sound_word";
    case "Object":
      return "object";
    case "Place":
      return "place";
    case "Person":
      return "person";
    case "Food":
      return "food";
    case "Body Part":
      return "body_part";
    case "Color":
      return "color";
    case "Number":
      return "number";
    case "Job":
      return "job";
    case "Name":
      return "name";
    case "Clothing":
      return "clothing";
    case "Vehicle":
      return "vehicle";
    case "School Subject":
      return "school_subject";
    case "Holiday":
      return "holiday";
    case "Emotion":
      return "emotion";
    case "Animal":
      return "animal";
    case "Plural Animal":
      return "plural_animal";
  }
}

function chooseFromList(list: string[], variantIndex: number, offset: number): string {
  return list[(variantIndex + offset) % list.length];
}

function chooseVerbForm(entries: FunnyVerbEntry[], type: PromptTypeKey, variantIndex: number, offset: number): string {
  const chosen = entries[(variantIndex + offset) % entries.length];
  switch (type) {
    case "Past Tense Verb":
      return chosen.past;
    case "Verb Ending In Ing":
      return chosen.ing;
    default:
      return chosen.base;
  }
}

function chooseUniqueString(
  list: string[],
  usedValues: Set<string>,
  variantIndex: number,
  offset: number
): string {
  for (let step = 0; step < list.length; step += 1) {
    const candidate = chooseFromList(list, variantIndex, offset + step);
    const normalized = candidate.trim().toLowerCase();
    if (!usedValues.has(normalized)) {
      usedValues.add(normalized);
      return candidate;
    }
  }

  const fallback = chooseFromList(list, variantIndex, offset);
  usedValues.add(fallback.trim().toLowerCase());
  return fallback;
}

function chooseUniqueVerbForm(
  entries: FunnyVerbEntry[],
  type: PromptTypeKey,
  usedValues: Set<string>,
  variantIndex: number,
  offset: number
): string {
  for (let step = 0; step < entries.length; step += 1) {
    const candidate = chooseVerbForm(entries, type, variantIndex, offset + step);
    const normalized = candidate.trim().toLowerCase();
    if (!usedValues.has(normalized)) {
      usedValues.add(normalized);
      return candidate;
    }
  }

  const fallback = chooseVerbForm(entries, type, variantIndex, offset);
  usedValues.add(fallback.trim().toLowerCase());
  return fallback;
}

export async function loadFunnyWordsCatalog(
  catalogPath = path.join(process.cwd(), "funny-words.json")
): Promise<FunnyWordsCatalog> {
  const raw = await fs.readFile(catalogPath, "utf8");
  return JSON.parse(raw) as FunnyWordsCatalog;
}

export function autoFillBlanks(
  blanks: BlankToken[],
  catalog: FunnyWordsCatalog,
  variantIndex = 0
): Record<string, string> {
  const fills: Record<string, string> = {};
  const usedValues = new Set<string>();

  blanks.forEach((blank, index) => {
    const type = blank.type as PromptTypeKey;
    const categoryName = normalizeCategoryName(type);
    const entries = catalog.categories[categoryName];

    if (categoryName === "verb" && Array.isArray(entries) && entries.length && typeof entries[0] === "object") {
      fills[blank.id] = chooseUniqueVerbForm(entries as FunnyVerbEntry[], type, usedValues, variantIndex, index);
      return;
    }

    if (Array.isArray(entries) && entries.length && typeof entries[0] === "string") {
      fills[blank.id] = chooseUniqueString(entries as string[], usedValues, variantIndex, index);
      return;
    }

    const extras = EXTRA_CATEGORY_VALUES[categoryName];
    if (extras?.length) {
      fills[blank.id] = chooseUniqueString(extras, usedValues, variantIndex, index);
      return;
    }

    const fallbackEntries = catalog.categories[catalog.fallbackCategory];
    if (Array.isArray(fallbackEntries) && fallbackEntries.length && typeof fallbackEntries[0] === "string") {
      fills[blank.id] = chooseUniqueString(fallbackEntries as string[], usedValues, variantIndex, index);
      return;
    }

    const fallback = blank.example || blank.displayLabel.toLowerCase();
    usedValues.add(fallback.trim().toLowerCase());
    fills[blank.id] = fallback;
  });

  return fills;
}

export function evaluateRevealDeterministically(params: {
  storyTemplate: string;
  revealedStory: string;
  blanks: BlankToken[];
  fills: Record<string, string>;
}): RevealEvaluationDeterministicReport {
  const unresolvedTokenCount = parseTokens(params.revealedStory).length;
  const articleMatches = [...params.revealedStory.matchAll(/\b(a|an)\s+([A-Za-z][A-Za-z'-]*)/gi)];
  const articleMismatchCount = articleMatches.filter((match) => {
    const actual = match[1].toLowerCase();
    const word = match[2];
    return actual !== expectedArticle(word);
  }).length;

  const objectCount = params.blanks.filter((blank) => blank.type === "Object").length;
  const genericNounCount = params.blanks.filter((blank) => GENERIC_NOUN_TYPES.has(blank.type as PromptTypeKey)).length;
  const nounFamilyCount = params.blanks.filter((blank) => NOUN_FAMILY_TYPES.has(blank.type as PromptTypeKey)).length;
  const objectBlankShare = params.blanks.length ? objectCount / params.blanks.length : 0;
  const genericNounShare = params.blanks.length ? genericNounCount / params.blanks.length : 0;
  const nounFamilyShare = params.blanks.length ? nounFamilyCount / params.blanks.length : 0;
  const repeatedFillCount =
    Object.values(params.fills).length - new Set(Object.values(params.fills).map((value) => value.trim().toLowerCase())).size;

  const suspiciousLabels: string[] = [];
  if (objectBlankShare >= 0.4) suspiciousLabels.push("Object-heavy blank set");
  if (genericNounShare >= 0.55) suspiciousLabels.push("Generic-noun-heavy blank set");
  if (repeatedFillCount > 0) suspiciousLabels.push("Repeated auto-fill words");
  if (articleMismatchCount > 0) suspiciousLabels.push("Article mismatches after reveal");
  if (unresolvedTokenCount > 0) suspiciousLabels.push("Unresolved tokens in reveal");

  const warnings: string[] = [];
  if (objectBlankShare >= 0.4) {
    warnings.push("The blank selection may be over-indexing on Object, which can make reveals feel mechanically noun-heavy.");
  }
  if (genericNounShare >= 0.55) {
    warnings.push("Most replacements are generic noun prompts, which can flatten the comedic texture of the reveal.");
  }
  if (articleMismatchCount > 0) {
    warnings.push("The filled story still contains a/an mismatches after insertion.");
  }
  if (unresolvedTokenCount > 0) {
    warnings.push("One or more placeholders were not resolved in the final reveal.");
  }

  let overallScore = 5;
  if (objectBlankShare >= 0.4) overallScore -= 1;
  if (genericNounShare >= 0.55) overallScore -= 1;
  if (repeatedFillCount > 0) overallScore -= 1;
  if (articleMismatchCount > 0) overallScore -= 1;
  if (unresolvedTokenCount > 0) overallScore -= 2;

  return {
    unresolvedTokenCount,
    articleMismatchCount,
    objectBlankShare,
    genericNounShare,
    nounFamilyShare,
    repeatedFillCount,
    suspiciousLabels,
    warnings,
    overallScore: Math.max(1, overallScore)
  };
}

function createRevealEvaluationPrompt(params: {
  seed: string;
  title: string;
  storyTemplate: string;
  fills: Record<string, string>;
  revealedStory: string;
  blanks: BlankToken[];
  deterministic: RevealEvaluationDeterministicReport;
}): string {
  return [
    "You are judging whether a filled silly-story reveal still feels like something a human editor would approve.",
    "Be strict about awkward substitutions, but do not fail just because a few inserted words are intentionally silly.",
    "",
    "Score these dimensions from 1 to 5:",
    "- coherenceScore: Is the final story still understandable and locally coherent?",
    "- humorFitScore: Do the inserted words create playful comedy instead of random noise?",
    "- naturalnessScore: Do the substitutions feel like choices a human author might actually keep?",
    "- semanticDriftScore: Does the reveal preserve the original scaffold's scene and action logic?",
    "",
    "Mark pass=true only if the reveal is still broadly readable, funny, and not dragged down by obviously awkward substitutions.",
    "Return at most 5 flagged substitutions or short phrase issues.",
    "",
    `Seed: ${params.seed}`,
    `Title: ${params.title}`,
    "",
    "Blank list:",
    ...params.blanks.map((blank) => `- ${blank.id}: ${blank.type} -> ${params.fills[blank.id]}`),
    "",
    "Original blanked scaffold:",
    params.storyTemplate,
    "",
    "Filled reveal:",
    params.revealedStory,
    "",
    "Deterministic evaluator notes:",
    `- overallScore=${params.deterministic.overallScore}`,
    `- objectBlankShare=${params.deterministic.objectBlankShare.toFixed(2)}`,
    `- genericNounShare=${params.deterministic.genericNounShare.toFixed(2)}`,
    `- nounFamilyShare=${params.deterministic.nounFamilyShare.toFixed(2)}`,
    `- repeatedFillCount=${params.deterministic.repeatedFillCount}`,
    `- articleMismatchCount=${params.deterministic.articleMismatchCount}`,
    ...(params.deterministic.warnings.length ? params.deterministic.warnings.map((item) => `- ${item}`) : ["- none"])
  ].join("\n");
}

export async function evaluateRevealWithModel(params: {
  seed: string;
  title: string;
  storyTemplate: string;
  fills: Record<string, string>;
  revealedStory: string;
  blanks: BlankToken[];
  deterministic: RevealEvaluationDeterministicReport;
}): Promise<{ report?: RevealEvaluationModelReport; error?: string }> {
  const client = getOpenAIClient();
  if (!client) return { error: "OpenAI client unavailable." };

  try {
    const response = await client.responses.create({
      model: process.env.OPENAI_STORY_MODEL ?? "gpt-4.1-mini",
      input: createRevealEvaluationPrompt(params),
      max_output_tokens: 800,
      store: false,
      text: {
        format: zodTextFormat(modelEvaluationSchema, "reveal_evaluation")
      }
    });

    const text = response.output_text?.trim();
    if (!text) return { error: "Empty model evaluation response." };
    return { report: modelEvaluationSchema.parse(JSON.parse(text)) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: message };
  }
}

export async function evaluateReveal(params: {
  seed: string;
  title: string;
  storyTemplate: string;
  blanks: BlankToken[];
  fills: Record<string, string>;
  revealedStory: string;
  useModel?: boolean;
}): Promise<RevealEvaluationReport> {
  const deterministic = evaluateRevealDeterministically(params);
  const modelResult = params.useModel
    ? await evaluateRevealWithModel({
        ...params,
        deterministic
      })
    : undefined;

  return {
    seed: params.seed,
    title: params.title,
    fills: params.fills,
    deterministic,
    model: modelResult?.report,
    modelError: modelResult?.error
  };
}
