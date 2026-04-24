import { BlankToken, StoryTemplatePayload } from "@/lib/types";
import { PromptTypeKey, normalizeBlank } from "@/lib/madlib-labels";
import { readDoc, wink } from "@/lib/wink";

type TokenInfo = {
  index: number;
  text: string;
  normal: string;
  pos: string;
  type: string;
  start: number;
  end: number;
};

type CandidateSource = "token" | "phrase" | "model";

type Candidate = {
  start: number;
  end: number;
  text: string;
  normalized: string;
  type: PromptTypeKey;
  score: number;
  source: CandidateSource;
};

export type HumorSpanRecommendation = {
  text: string;
  reason?: string;
};

export type HumorSpanRejectionReason =
  | "duplicate_text"
  | "no_match"
  | "ambiguous_match"
  | "partial_token"
  | "untyped"
  | "slot_incompatible"
  | "structural_risk"
  | "overlap"
  | "normalized_duplicate"
  | "type_cap_exceeded";

export type HumorSpanSelectionRejection = {
  text: string;
  reason: HumorSpanRejectionReason;
};

export type HumorSpanSelectionReport = {
  recommendedCount: number;
  acceptedCount: number;
  rejectedCount: number;
  backfilledCount: number;
  acceptedTexts: string[];
  rejections: HumorSpanSelectionRejection[];
};

const MAX_TYPE_COUNTS: Partial<Record<PromptTypeKey, number>> = {
  Noun: 6,
  Object: 3
};

const TARGET_BLANK_COUNT = 12;
const MIN_BLANK_COUNT = 10;

const PLACE_HEADS = new Set([
  "lobby",
  "mall",
  "park",
  "street",
  "road",
  "yard",
  "driveway",
  "sidewalk",
  "porch",
  "kitchen",
  "hallway",
  "room",
  "school",
  "classroom",
  "garage",
  "playground",
  "theater",
  "stadium",
  "store"
]);

const OBJECT_HEADS = new Set([
  "rack",
  "dishwasher",
  "helmet",
  "backpack",
  "ladder",
  "whistle",
  "broom",
  "hairdryer",
  "wagon",
  "bucket",
  "lid",
  "can",
  "trash",
  "towel",
  "basket",
  "ring"
]);

const PERSON_HEADS = new Set([
  "adult",
  "baby",
  "captain",
  "cashier",
  "child",
  "coach",
  "crossing",
  "crowd",
  "customer",
  "driver",
  "employee",
  "friend",
  "girl",
  "grandma",
  "grandpa",
  "guard",
  "helper",
  "kid",
  "librarian",
  "mail",
  "man",
  "mom",
  "mother",
  "neighbor",
  "parent",
  "passerby",
  "person",
  "principal",
  "reader",
  "shopper",
  "staff",
  "teacher",
  "toddler",
  "woman",
  "boy"
]);

const ANIMAL_HEADS = new Set([
  "beetle",
  "bird",
  "bug",
  "cat",
  "chicken",
  "dog",
  "duck",
  "elephant",
  "frog",
  "hamster",
  "hornet",
  "kitten",
  "llama",
  "monkey",
  "puppy",
  "seahorse",
  "turtle",
  "zebra"
]);

const FOOD_HEADS = new Set([
  "brownie",
  "burger",
  "cake",
  "candy",
  "cheeseburger",
  "chip",
  "cookie",
  "cupcake",
  "donut",
  "hotdog",
  "ice",
  "juice",
  "marshmallow",
  "meatball",
  "milkshake",
  "muffin",
  "noodle",
  "pancake",
  "pizza",
  "popcorn",
  "pretzel",
  "pudding",
  "sandwich",
  "sherbet",
  "snack",
  "soda",
  "spaghetti",
  "spring",
  "syrup",
  "taco",
  "waffle"
]);

const BODY_PART_HEADS = new Set([
  "ankle",
  "arm",
  "back",
  "belly",
  "cheek",
  "chin",
  "ear",
  "earlobe",
  "elbow",
  "eyebrow",
  "eye",
  "face",
  "finger",
  "foot",
  "hair",
  "hand",
  "head",
  "heel",
  "hip",
  "knee",
  "kneecap",
  "leg",
  "mouth",
  "neck",
  "nose",
  "shoulder",
  "toe"
]);

const CLOTHING_HEADS = new Set([
  "apron",
  "bandana",
  "boot",
  "cape",
  "coat",
  "costume",
  "dress",
  "glove",
  "goggles",
  "hat",
  "helmet",
  "hoodie",
  "jacket",
  "jeans",
  "patch",
  "raincoat",
  "scarf",
  "shirt",
  "shoe",
  "shorts",
  "skirt",
  "sneaker",
  "sock",
  "sunglasses",
  "sweater",
  "uniform",
  "vest"
]);

const VEHICLE_HEADS = new Set([
  "bicycle",
  "bike",
  "bus",
  "car",
  "cart",
  "scooter",
  "skateboard",
  "truck",
  "van",
  "wagon"
]);

const HUMOR_WORDS = new Set([
  "dishwasher",
  "rack",
  "gravy",
  "mustache",
  "dumpster",
  "turkey",
  "puddle",
  "spaghetti",
  "funnel",
  "trash",
  "garbage",
  "underpants",
  "toothbrush",
  "meatball",
  "leaf",
  "blower",
  "hotel",
  "lobby"
]);

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "so",
  "then",
  "that",
  "this",
  "those",
  "these",
  "with",
  "from",
  "into",
  "onto",
  "than",
  "ever",
  "very",
  "really"
]);

const IRREGULAR_PAST = new Set([
  "ran",
  "went",
  "said",
  "saw",
  "took",
  "made",
  "found",
  "felt",
  "caught",
  "threw",
  "blew",
  "grew",
  "drove",
  "wrote"
]);

const ACTION_DESTINATION_PREPOSITIONS = new Set([
  "across",
  "around",
  "behind",
  "beside",
  "down",
  "from",
  "inside",
  "into",
  "near",
  "off",
  "onto",
  "past",
  "through",
  "toward",
  "towards",
  "under",
  "up"
]);

const STRONG_ACTION_VERBS = new Set([
  "bump",
  "bumped",
  "catch",
  "caught",
  "chase",
  "chased",
  "clutch",
  "clutched",
  "crash",
  "crashed",
  "drop",
  "dropped",
  "fling",
  "flung",
  "grab",
  "grabbed",
  "hit",
  "knock",
  "knocked",
  "land",
  "landed",
  "lift",
  "lifted",
  "lose",
  "lost",
  "nudge",
  "nudged",
  "punt",
  "punted",
  "push",
  "pushed",
  "ram",
  "rammed",
  "slip",
  "slipped",
  "smack",
  "smacked",
  "spot",
  "spotted",
  "splash",
  "splashed",
  "throw",
  "threw",
  "toss",
  "tossed",
  "trip",
  "tripped"
]);

const CLAUSE_TRANSITION_WORDS = new Set([
  "and",
  "as",
  "before",
  "because",
  "creating",
  "sending",
  "so",
  "while"
]);

const ABSTRACT_RESULT_HEADS = new Set([
  "chain",
  "chaos",
  "comedy",
  "effect",
  "gold",
  "highlight",
  "legend",
  "magic",
  "mess",
  "moment",
  "scene",
  "spectacle",
  "surprise",
  "trouble"
]);

function isWordToken(token: TokenInfo): boolean {
  return token.type === "word";
}

function isCandidatePos(token: TokenInfo): boolean {
  return ["ADJ", "ADV", "NOUN", "PROPN", "VERB"].includes(token.pos);
}

function singularize(normalized: string): string {
  if (/ies$/.test(normalized)) return `${normalized.slice(0, -3)}y`;
  if (/(ches|shes|sses|xes|zes)$/.test(normalized)) return normalized.slice(0, -2);
  if (normalized.endsWith("s") && !normalized.endsWith("ss")) return normalized.slice(0, -1);
  return normalized;
}

function normalizedWords(text: string): string[] {
  return text
    .toLowerCase()
    .match(/[a-z]+(?:'[a-z]+)?/g)
    ?.map((word) => singularize(word)) ?? [];
}

function hasSemanticMatch(words: string[], heads: Set<string>): boolean {
  return words.some((word) => heads.has(word));
}

function normalizedSnippetEdge(input: string, fromEnd: boolean): string {
  const chunk = fromEnd ? input.slice(-40) : input.slice(0, 40);
  return chunk.replace(/\s+/g, " ").trim().toLowerCase();
}

function tokenizeWithOffsets(text: string): TokenInfo[] {
  const doc = readDoc(text);
  const tokenTexts = doc.tokens().out() as string[];
  const normals = doc.tokens().out(wink.its.normal) as string[];
  const poses = doc.tokens().out(wink.its.pos) as string[];
  const types = doc.tokens().out(wink.its.type) as string[];
  const tokens: TokenInfo[] = [];
  let cursor = 0;

  for (let index = 0; index < tokenTexts.length; index += 1) {
    const tokenText = tokenTexts[index];
    const start = text.indexOf(tokenText, cursor);
    if (start === -1) continue;
    const end = start + tokenText.length;
    tokens.push({
      index,
      text: tokenText,
      normal: normals[index] ?? tokenText.toLowerCase(),
      pos: poses[index] ?? "",
      type: types[index] ?? "",
      start,
      end
    });
    cursor = end;
  }

  return tokens;
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

type SlotShape =
  | "plural_countable_noun"
  | "noun_phrase"
  | "base_verb"
  | "past_tense_predicate"
  | "gerund_phrase"
  | "adjective_before_noun"
  | "adjective_predicate"
  | "adverb_modifier"
  | "freeform";

function inferSlotShape(before: string, after: string): SlotShape {
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

function slotAcceptsType(shape: SlotShape, type: PromptTypeKey): boolean {
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

function remapTypeForSlot(shape: SlotShape, type: PromptTypeKey): PromptTypeKey | null {
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
      if (["Noun", "Object", "Food", "Body Part", "Place", "Person", "Job"].includes(type)) {
        return "Plural Noun";
      }
      return null;
    case "adjective_before_noun":
    case "adjective_predicate":
      if (["Noun", "Object", "Food", "Emotion", "Proper Noun"].includes(type)) {
        return "Adjective";
      }
      if (type === "Place") return "Adjective";
      return null;
    case "noun_phrase":
      if (type === "Adjective" || type === "Color") return "Noun";
      return null;
    default:
      return null;
  }
}

function reconcileCandidateType(
  candidate: Omit<Candidate, "score">,
  storyBody: string
): Omit<Candidate, "score"> | null {
  const before = storyBody.slice(0, candidate.start);
  const after = storyBody.slice(candidate.end);
  const shape = inferSlotShape(before, after);
  const repairedType = remapTypeForSlot(shape, candidate.type);
  if (!repairedType) return null;

  return {
    ...candidate,
    type: repairedType
  };
}

function inferPromptType(text: string, pos: string, normalized: string): PromptTypeKey | null {
  if (!text || STOPWORDS.has(normalized)) return null;
  const words = normalizedWords(text);
  const head = singularize(words[words.length - 1] ?? normalized);
  if (pos === "ADJ") return "Adjective";
  if (pos === "ADV") return "Adverb";
  if (pos === "VERB") {
    if (/ing$/i.test(text)) return "Verb Ending In Ing";
    if (/ed$/i.test(text) || IRREGULAR_PAST.has(normalized)) return "Past Tense Verb";
    return "Verb";
  }
  if (pos === "PROPN") return "Proper Noun";
  if (pos === "NOUN") {
    if (hasSemanticMatch(words, PLACE_HEADS) || PLACE_HEADS.has(head)) return "Place";
    if (hasSemanticMatch(words, VEHICLE_HEADS) || VEHICLE_HEADS.has(head)) return "Vehicle";
    if (hasSemanticMatch(words, CLOTHING_HEADS) || CLOTHING_HEADS.has(head)) return "Clothing";
    if (hasSemanticMatch(words, BODY_PART_HEADS) || BODY_PART_HEADS.has(head)) return "Body Part";
    if (hasSemanticMatch(words, FOOD_HEADS) || FOOD_HEADS.has(head)) return "Food";
    if (hasSemanticMatch(words, ANIMAL_HEADS) || ANIMAL_HEADS.has(head)) return "Animal";
    if (hasSemanticMatch(words, PERSON_HEADS) || PERSON_HEADS.has(head)) return "Person";
    if (hasSemanticMatch(words, OBJECT_HEADS) || OBJECT_HEADS.has(head)) return "Object";
    return "Noun";
  }
  return null;
}

function phraseType(words: TokenInfo[]): PromptTypeKey | null {
  const text = words.map((word) => word.text).join(" ");
  const phraseWords = normalizedWords(text);
  const head = phraseWords[phraseWords.length - 1] ?? singularize(words[words.length - 1]?.normal ?? "");
  if (hasSemanticMatch(phraseWords, PLACE_HEADS) || PLACE_HEADS.has(head)) return "Place";
  if (hasSemanticMatch(phraseWords, VEHICLE_HEADS) || VEHICLE_HEADS.has(head)) return "Vehicle";
  if (hasSemanticMatch(phraseWords, CLOTHING_HEADS) || CLOTHING_HEADS.has(head)) return "Clothing";
  if (hasSemanticMatch(phraseWords, BODY_PART_HEADS) || BODY_PART_HEADS.has(head)) return "Body Part";
  if (hasSemanticMatch(phraseWords, FOOD_HEADS) || FOOD_HEADS.has(head)) return "Food";
  if (hasSemanticMatch(phraseWords, ANIMAL_HEADS) || ANIMAL_HEADS.has(head)) return "Animal";
  if (hasSemanticMatch(phraseWords, PERSON_HEADS) || PERSON_HEADS.has(head)) return "Person";
  if (hasSemanticMatch(phraseWords, OBJECT_HEADS) || OBJECT_HEADS.has(head)) return "Object";
  if (words.length >= 2 && ["NOUN", "PROPN"].includes(words[words.length - 1]?.pos ?? "")) return "Noun";
  return inferPromptType(text, words[words.length - 1]?.pos ?? "", head);
}

function rarityBonus(normalized: string): number {
  if (normalized.length >= 10) return 2.4;
  if (normalized.length >= 7) return 1.5;
  if (normalized.length >= 5) return 0.8;
  return 0;
}

function humorBonus(normalized: string): number {
  const pieces = normalized.split(/\s+/);
  return pieces.some((piece) => HUMOR_WORDS.has(piece)) ? 2.5 : 0;
}

function posWeight(type: PromptTypeKey): number {
  switch (type) {
    case "Body Part":
    case "Clothing":
    case "Food":
    case "Person":
    case "Vehicle":
      return 4.4;
    case "Place":
      return 4.5;
    case "Object":
      return 3.2;
    case "Adjective":
      return 4;
    case "Past Tense Verb":
    case "Verb Ending In Ing":
      return 3.6;
    case "Verb":
      return 2.8;
    case "Noun":
      return 3;
    case "Plural Noun":
      return 3.2;
    case "Animal":
    case "Plural Animal":
      return 3.8;
    default:
      return 2;
  }
}

function sentencePositionBonus(start: number, textLength: number): number {
  if (textLength <= 0) return 0;
  const ratio = start / textLength;
  if (ratio < 0.2) return 0.4;
  if (ratio < 0.75) return 1;
  return 0.2;
}

function anchorPenalty(normalized: string, protectedTerms: Set<string>): number {
  const pieces = normalized.split(/\s+/);
  return pieces.some((piece) => protectedTerms.has(piece)) ? 6 : 0;
}

function repeatedPenalty(normalized: string, counts: Map<string, number>): number {
  const count = counts.get(normalized) ?? 1;
  return count > 1 ? (count - 1) * 1.2 : 0;
}

function scoreCandidate(
  candidate: Omit<Candidate, "score">,
  storyBody: string,
  storyLength: number,
  counts: Map<string, number>,
  protectedTerms: Set<string>
): number {
  return (
    posWeight(candidate.type) +
    (candidate.source === "phrase" ? 2.2 : 0) +
    rarityBonus(candidate.normalized) +
    humorBonus(candidate.normalized) +
    sentencePositionBonus(candidate.start, storyLength) -
    structuralRiskPenalty(candidate, storyBody) -
    repeatedPenalty(candidate.normalized, counts) -
    anchorPenalty(candidate.normalized, protectedTerms) -
    (STOPWORDS.has(candidate.normalized) ? 5 : 0)
  );
}

function structuralRiskPenalty(candidate: Omit<Candidate, "score">, storyBody: string): number {
  const before = storyBody.slice(0, candidate.start);
  const after = storyBody.slice(candidate.end);
  const left = normalizedSnippetEdge(before, true);
  const right = normalizedSnippetEdge(after, false);
  const nounish = [
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
    "Vehicle"
  ].includes(candidate.type);

  if (!nounish) return 0;

  let penalty = 0;
  const words = normalizedWords(candidate.text);
  const head = words[words.length - 1] ?? "";

  if (
    new RegExp(
      `\\b(${[...ACTION_DESTINATION_PREPOSITIONS].join("|")})\\s+(the|a|an|my|your|his|her|their|our)?\\s*$`
    ).test(left)
  ) {
    penalty += 5;
  }

  if (
    new RegExp(
      `\\b(${[...STRONG_ACTION_VERBS].join("|")})\\s+(straight|right|carefully|wildly|suddenly|quickly)?\\s*(into|onto|under|through|toward|towards|across)?\\s*(the|a|an|my|your|his|her|their|our)?\\s*$`
    ).test(left)
  ) {
    penalty += 4.5;
  }

  if (
    /\b(his|her|their|our|my|your)\s*$/.test(left) &&
    /^[a-z]+(?:\s+[a-z]+)?$/i.test(candidate.text) &&
    /^\s+(is|was|were|kept|started|began|looked|stretched|stretching|flailing|swinging|untied|wobbling|dripping|clutching|holding|spinning)\b/i.test(
      after
    )
  ) {
    penalty += 9;
  }

  if (/^\s+of\s+(the|a|an|my|your|his|her|their|our)\b/.test(right)) {
    penalty += 4;
  }

  if (
    new RegExp(
      `^\\s*(,\\s*)?(${[...CLAUSE_TRANSITION_WORDS].join("|")})\\b`
    ).test(right)
  ) {
    penalty += 3.5;
  }

  if (
    /\b(became|become|turns|turned|creating|created|made|make)\b.*\b(into|as)?\s*$/.test(left) &&
    ABSTRACT_RESULT_HEADS.has(head)
  ) {
    penalty += 8;
  }

  if (
    /\b(a|an)\s*$/.test(left) &&
    ["Object", "Noun", "Food", "Body Part", "Vehicle", "Clothing"].includes(candidate.type)
  ) {
    penalty += 1.5;
  }

  if (/^\s+(that|who|which)\b/.test(right)) {
    penalty += 2;
  }

  if (candidate.source === "phrase" && candidate.text.trim().split(/\s+/).length >= 2) {
    penalty += 1;
  }

  return penalty;
}

function buildProtectedTermSet(seed: string, title: string): Set<string> {
  const terms = new Set<string>();
  for (const source of [seed, title]) {
    const matches = source.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? [];
    for (const match of matches) {
      if (match.length >= 3) terms.add(match);
    }
  }
  return terms;
}

function candidateCounts(candidates: Array<Omit<Candidate, "score">>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const candidate of candidates) {
    counts.set(candidate.normalized, (counts.get(candidate.normalized) ?? 0) + 1);
  }
  return counts;
}

function buildPhraseCandidates(tokens: TokenInfo[]): Array<Omit<Candidate, "score">> {
  const candidates: Array<Omit<Candidate, "score">> = [];

  for (let i = 0; i < tokens.length - 1; i += 1) {
    const first = tokens[i];
    const second = tokens[i + 1];
    if (!isWordToken(first) || !isWordToken(second)) continue;

    const twoWordPattern =
      (first.pos === "ADJ" && ["NOUN", "PROPN"].includes(second.pos)) ||
      (first.pos === "NOUN" && second.pos === "NOUN");

    if (twoWordPattern) {
      const span = tokens.slice(i, i + 2);
      const text = span.map((token) => token.text).join(" ");
      const normalized = span.map((token) => token.normal).join(" ");
      const type = phraseType(span);
      if (!type) continue;
      candidates.push({
        start: span[0].start,
        end: span[span.length - 1].end,
        text,
        normalized,
        type,
        source: "phrase"
      });
    }

    const third = tokens[i + 2];
    if (
      third &&
      isWordToken(third) &&
      first.pos === "ADJ" &&
      second.pos === "ADJ" &&
      ["NOUN", "PROPN"].includes(third.pos)
    ) {
      const span = tokens.slice(i, i + 3);
      const text = span.map((token) => token.text).join(" ");
      const normalized = span.map((token) => token.normal).join(" ");
      const type = phraseType(span);
      if (!type) continue;
      candidates.push({
        start: span[0].start,
        end: span[span.length - 1].end,
        text,
        normalized,
        type,
        source: "phrase"
      });
    }
  }

  return candidates;
}

function buildSingleTokenCandidates(tokens: TokenInfo[]): Array<Omit<Candidate, "score">> {
  const candidates: Array<Omit<Candidate, "score">> = [];
  for (const token of tokens) {
    if (!isWordToken(token) || !isCandidatePos(token)) continue;
    const type = inferPromptType(token.text, token.pos, token.normal);
    if (!type) continue;
    candidates.push({
      start: token.start,
      end: token.end,
      text: token.text,
      normalized: token.normal,
      type,
      source: "token"
    });
  }
  return candidates;
}

function chooseTopCandidates(candidates: Candidate[]): Candidate[] {
  const chosen: Candidate[] = [];
  const typeCounts = new Map<PromptTypeKey, number>();

  for (const candidate of candidates) {
    if (!tryAddCandidate(chosen, typeCounts, candidate)) continue;
  }

  return chosen.sort((a, b) => a.start - b.start);
}

function tryAddCandidate(
  chosen: Candidate[],
  typeCounts: Map<PromptTypeKey, number>,
  candidate: Candidate
): HumorSpanRejectionReason | null {
  if (chosen.length >= TARGET_BLANK_COUNT) return "type_cap_exceeded";
  const overlaps = chosen.some(
    (existing) => !(candidate.end <= existing.start || candidate.start >= existing.end)
  );
  if (overlaps) return "overlap";
  if (chosen.some((existing) => existing.normalized === candidate.normalized)) return "normalized_duplicate";
  const maxForType = MAX_TYPE_COUNTS[candidate.type];
  const currentTypeCount = typeCounts.get(candidate.type) ?? 0;
  if (typeof maxForType === "number" && currentTypeCount >= maxForType) return "type_cap_exceeded";
  chosen.push(candidate);
  typeCounts.set(candidate.type, currentTypeCount + 1);
  return null;
}

function tokenIdForCandidate(candidate: Candidate, index: number): string {
  const label = candidate.type;
  return normalizeBlank({ label, example: candidate.text }, `${label.toUpperCase().replaceAll(/\s+/g, "_")}_${index + 1}`, index).id;
}

export type BlankExtractionResult = {
  story: StoryTemplatePayload;
  candidateCount: number;
  chosenCount: number;
};

export function extractBlankedStory(seed: string, title: string, storyBody: string): BlankExtractionResult {
  const tokens = tokenizeWithOffsets(storyBody);
  const protectedTerms = buildProtectedTermSet(seed, title);
  const scored = scoreLocalCandidates(tokens, storyBody, protectedTerms);

  const chosen = chooseTopCandidates(scored);
  const story = buildStoryFromCandidates(title, storyBody, chosen);

  return {
    story,
    candidateCount: scored.length,
    chosenCount: chosen.length
  };
}

export function hasEnoughBlankCandidates(result: BlankExtractionResult): boolean {
  return result.chosenCount >= MIN_BLANK_COUNT && result.chosenCount <= TARGET_BLANK_COUNT;
}

function scoreLocalCandidates(
  tokens: TokenInfo[],
  storyBody: string,
  protectedTerms: Set<string>
): Candidate[] {
  const rawCandidates = [...buildPhraseCandidates(tokens), ...buildSingleTokenCandidates(tokens)]
    .map((candidate) => reconcileCandidateType(candidate, storyBody))
    .filter((candidate): candidate is Omit<Candidate, "score"> => candidate !== null);
  const counts = candidateCounts(rawCandidates);
  return rawCandidates
    .map((candidate) => ({
      ...candidate,
      score: scoreCandidate(candidate, storyBody, storyBody.length, counts, protectedTerms)
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.start - b.start);
}

function buildStoryFromCandidates(
  title: string,
  storyBody: string,
  candidates: Candidate[]
): StoryTemplatePayload {
  let storyTemplate = "";
  let cursor = 0;
  const blanks: BlankToken[] = [];

  candidates.forEach((candidate, index) => {
    const id = tokenIdForCandidate(candidate, index);
    storyTemplate += storyBody.slice(cursor, candidate.start);
    storyTemplate += `[${id}]`;
    cursor = candidate.end;
    blanks.push(normalizeBlank({ label: candidate.type, example: candidate.text }, id, index));
  });
  storyTemplate += storyBody.slice(cursor);

  return {
    title,
    storyTemplate,
    blanks
  };
}

function locateExactSpanMatches(storyBody: string, target: string): Array<{ start: number; end: number }> {
  const trimmedTarget = target.trim();
  if (!trimmedTarget) return [];
  const matches: Array<{ start: number; end: number }> = [];
  let cursor = 0;

  while (cursor < storyBody.length) {
    const index = storyBody.indexOf(trimmedTarget, cursor);
    if (index === -1) break;
    matches.push({ start: index, end: index + trimmedTarget.length });
    cursor = index + trimmedTarget.length;
  }

  return matches;
}

function candidateFromRecommendedSpan(
  storyBody: string,
  tokens: TokenInfo[],
  recommendation: HumorSpanRecommendation
): { candidate?: Candidate; rejection?: HumorSpanSelectionRejection } {
  const trimmedText = recommendation.text.trim();
  if (!trimmedText) {
    return {
      rejection: {
        text: recommendation.text,
        reason: "no_match"
      }
    };
  }

  const matches = locateExactSpanMatches(storyBody, trimmedText);
  if (matches.length === 0) {
    return {
      rejection: {
        text: trimmedText,
        reason: "no_match"
      }
    };
  }
  if (matches.length > 1) {
    return {
      rejection: {
        text: trimmedText,
        reason: "ambiguous_match"
      }
    };
  }

  const { start, end } = matches[0];
  const spanTokens = tokens.filter(
    (token) => isWordToken(token) && token.start >= start && token.end <= end
  );
  if (!spanTokens.length) {
    return {
      rejection: {
        text: trimmedText,
        reason: "partial_token"
      }
    };
  }

  if (spanTokens[0].start !== start || spanTokens[spanTokens.length - 1].end !== end) {
    return {
      rejection: {
        text: trimmedText,
        reason: "partial_token"
      }
    };
  }

  const text = storyBody.slice(start, end);
  const type =
    spanTokens.length === 1
      ? inferPromptType(spanTokens[0].text, spanTokens[0].pos, spanTokens[0].normal)
      : phraseType(spanTokens);
  if (!type) {
    return {
      rejection: {
        text,
        reason: "untyped"
      }
    };
  }

  const normalized = spanTokens.map((token) => token.normal).join(" ");
  const candidate = reconcileCandidateType(
    {
      start,
      end,
      text,
      normalized,
      type,
      source: "model"
    },
    storyBody
  );
  if (!candidate) {
    return {
      rejection: {
        text,
        reason: "slot_incompatible"
      }
    };
  }

  return {
    candidate: {
      ...candidate,
      score: 0
    }
  };
}

export function buildHumorShadowStory(
  seed: string,
  title: string,
  storyBody: string,
  recommendations: HumorSpanRecommendation[]
): { story: StoryTemplatePayload; report: HumorSpanSelectionReport; candidateCount: number; chosenCount: number } {
  const tokens = tokenizeWithOffsets(storyBody);
  const protectedTerms = buildProtectedTermSet(seed, title);
  const localScored = scoreLocalCandidates(tokens, storyBody, protectedTerms);
  const localCounts = new Map<string, number>();
  for (const candidate of localScored) {
    localCounts.set(candidate.normalized, (localCounts.get(candidate.normalized) ?? 0) + 1);
  }
  const chosen: Candidate[] = [];
  const typeCounts = new Map<PromptTypeKey, number>();
  const rejections: HumorSpanSelectionRejection[] = [];
  const seenTexts = new Set<string>();
  const acceptedTexts: string[] = [];
  const scoredModelCandidates: Candidate[] = [];

  for (const recommendation of recommendations) {
    const dedupeKey = recommendation.text.trim().toLowerCase();
    if (!dedupeKey) continue;
    if (seenTexts.has(dedupeKey)) {
      rejections.push({ text: recommendation.text, reason: "duplicate_text" });
      continue;
    }
    seenTexts.add(dedupeKey);

    const { candidate, rejection } = candidateFromRecommendedSpan(storyBody, tokens, recommendation);
    if (!candidate) {
      if (rejection) rejections.push(rejection);
      continue;
    }
    const structuralPenalty = structuralRiskPenalty(candidate, storyBody);
    if (structuralPenalty >= 8) {
      rejections.push({ text: candidate.text, reason: "structural_risk" });
      continue;
    }
    const score =
      scoreCandidate(candidate, storyBody, storyBody.length, localCounts, protectedTerms) +
      2.5;
    if (score <= 0.75) {
      rejections.push({ text: candidate.text, reason: "structural_risk" });
      continue;
    }
    scoredModelCandidates.push({ ...candidate, score });
  }

  scoredModelCandidates.sort((a, b) => b.score - a.score || a.start - b.start);

  for (const candidate of scoredModelCandidates) {
    const addResult = tryAddCandidate(chosen, typeCounts, candidate);
    if (addResult) {
      rejections.push({ text: candidate.text, reason: addResult });
      continue;
    }
    acceptedTexts.push(candidate.text);
  }

  const acceptedBeforeBackfill = chosen.length;

  for (const candidate of localScored) {
    if (chosen.length >= TARGET_BLANK_COUNT) break;
    tryAddCandidate(chosen, typeCounts, candidate);
  }

  const finalChosen = [...chosen].sort((a, b) => a.start - b.start);
  return {
    story: buildStoryFromCandidates(title, storyBody, finalChosen),
    report: {
      recommendedCount: recommendations.length,
      acceptedCount: acceptedBeforeBackfill,
      rejectedCount: rejections.length,
      backfilledCount: Math.max(0, finalChosen.length - acceptedBeforeBackfill),
      acceptedTexts,
      rejections
    },
    candidateCount: localScored.length,
    chosenCount: finalChosen.length
  };
}
