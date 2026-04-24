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

type Candidate = {
  start: number;
  end: number;
  text: string;
  normalized: string;
  type: PromptTypeKey;
  score: number;
  source: "token" | "phrase";
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

function isWordToken(token: TokenInfo): boolean {
  return token.type === "word";
}

function isCandidatePos(token: TokenInfo): boolean {
  return ["ADJ", "ADV", "NOUN", "PROPN", "VERB"].includes(token.pos);
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
  if (pos === "ADJ") return "Adjective";
  if (pos === "ADV") return "Adverb";
  if (pos === "VERB") {
    if (/ing$/i.test(text)) return "Verb Ending In Ing";
    if (/ed$/i.test(text) || IRREGULAR_PAST.has(normalized)) return "Past Tense Verb";
    return "Verb";
  }
  if (pos === "PROPN") return "Proper Noun";
  if (pos === "NOUN") {
    if (PLACE_HEADS.has(normalized)) return "Place";
    if (OBJECT_HEADS.has(normalized)) return "Object";
    return "Noun";
  }
  return null;
}

function phraseType(words: TokenInfo[]): PromptTypeKey | null {
  const normalized = words.map((word) => word.normal);
  const head = normalized[normalized.length - 1];
  if (PLACE_HEADS.has(head)) return "Place";
  if (OBJECT_HEADS.has(head) || normalized.length >= 2) return "Object";
  return inferPromptType(words.map((word) => word.text).join(" "), words[words.length - 1]?.pos ?? "", head);
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
    case "Object":
    case "Place":
      return 4.5;
    case "Adjective":
      return 4;
    case "Past Tense Verb":
    case "Verb Ending In Ing":
      return 3.6;
    case "Verb":
      return 2.8;
    case "Noun":
    case "Plural Noun":
    case "Animal":
    case "Plural Animal":
    case "Food":
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
    repeatedPenalty(candidate.normalized, counts) -
    anchorPenalty(candidate.normalized, protectedTerms) -
    (STOPWORDS.has(candidate.normalized) ? 5 : 0)
  );
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

  for (const candidate of candidates) {
    if (chosen.length >= TARGET_BLANK_COUNT) break;
    const overlaps = chosen.some(
      (existing) => !(candidate.end <= existing.start || candidate.start >= existing.end)
    );
    if (overlaps) continue;
    if (chosen.some((existing) => existing.normalized === candidate.normalized)) continue;
    chosen.push(candidate);
  }

  return chosen.sort((a, b) => a.start - b.start);
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
  const rawCandidates = [...buildPhraseCandidates(tokens), ...buildSingleTokenCandidates(tokens)]
    .map((candidate) => reconcileCandidateType(candidate, storyBody))
    .filter((candidate): candidate is Omit<Candidate, "score"> => candidate !== null);
  const counts = candidateCounts(rawCandidates);
  const scored = rawCandidates
    .map((candidate) => ({
      ...candidate,
      score: scoreCandidate(candidate, storyBody.length, counts, protectedTerms)
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.start - b.start);

  const chosen = chooseTopCandidates(scored);
  let storyTemplate = "";
  let cursor = 0;
  const blanks: BlankToken[] = [];

  chosen.forEach((candidate, index) => {
    const id = tokenIdForCandidate(candidate, index);
    storyTemplate += storyBody.slice(cursor, candidate.start);
    storyTemplate += `[${id}]`;
    cursor = candidate.end;
    blanks.push(normalizeBlank({ label: candidate.type, example: candidate.text }, id, index));
  });
  storyTemplate += storyBody.slice(cursor);

  return {
    story: {
      title,
      storyTemplate,
      blanks
    },
    candidateCount: scored.length,
    chosenCount: chosen.length
  };
}

export function hasEnoughBlankCandidates(result: BlankExtractionResult): boolean {
  return result.chosenCount >= MIN_BLANK_COUNT && result.chosenCount <= TARGET_BLANK_COUNT;
}
