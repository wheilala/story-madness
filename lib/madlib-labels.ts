import { BlankToken } from "@/lib/types";

export const PROMPT_TYPE_ORDER = [
  "Noun",
  "Plural Noun",
  "Verb",
  "Past Tense Verb",
  "Verb Ending In Ing",
  "Adjective",
  "Adverb",
  "Person",
  "Place",
  "Object",
  "Animal",
  "Plural Animal",
  "Food",
  "Body Part",
  "Color",
  "Number",
  "Exclamation",
  "Sound Word",
  "Job",
  "Name",
  "Proper Noun",
  "Clothing",
  "Vehicle",
  "School Subject",
  "Holiday",
  "Emotion"
] as const;

export type PromptTypeKey = (typeof PROMPT_TYPE_ORDER)[number];

export type PromptSurfaceForm =
  | "singular_noun"
  | "plural_noun"
  | "base_verb"
  | "past_tense_verb"
  | "gerund_verb"
  | "adjective"
  | "adverb"
  | "interjection"
  | "number";

export type PromptTypeDefinition = {
  displayLabel: PromptTypeKey;
  prefix: string;
  surfaceForm: PromptSurfaceForm;
  intrinsicPlural: boolean;
  intrinsicTense: "none" | "past" | "ing";
  exampleHints: string[];
  tier: "core" | "common" | "optional";
  aliases: string[];
};

export const PROMPT_TYPE_REGISTRY: Record<PromptTypeKey, PromptTypeDefinition> = {
  Noun: {
    displayLabel: "Noun",
    prefix: "NOUN",
    surfaceForm: "singular_noun",
    intrinsicPlural: false,
    intrinsicTense: "none",
    exampleHints: ["wagon", "helmet"],
    tier: "core",
    aliases: ["noun", "thing", "idea", "concept", "movie title", "title", "activity", "community event"]
  },
  "Plural Noun": {
    displayLabel: "Plural Noun",
    prefix: "PLURAL_NOUN",
    surfaceForm: "plural_noun",
    intrinsicPlural: true,
    intrinsicTense: "none",
    exampleHints: ["socks", "cookies"],
    tier: "core",
    aliases: ["plural noun", "plural", "things plural", "objects plural", "cookie plural", "autumn leaves plural"]
  },
  Verb: {
    displayLabel: "Verb",
    prefix: "VERB",
    surfaceForm: "base_verb",
    intrinsicPlural: false,
    intrinsicTense: "none",
    exampleHints: ["jump", "zoom"],
    tier: "core",
    aliases: ["verb", "action", "action word"]
  },
  "Past Tense Verb": {
    displayLabel: "Past Tense Verb",
    prefix: "VERB_PAST",
    surfaceForm: "past_tense_verb",
    intrinsicPlural: false,
    intrinsicTense: "past",
    exampleHints: ["slipped", "laughed"],
    tier: "core",
    aliases: ["past tense verb", "verb past", "past action"]
  },
  "Verb Ending In Ing": {
    displayLabel: "Verb Ending In Ing",
    prefix: "VERB_ING",
    surfaceForm: "gerund_verb",
    intrinsicPlural: false,
    intrinsicTense: "ing",
    exampleHints: ["spinning", "skipping"],
    tier: "core",
    aliases: ["verb ending in -ing", "verb ending in ing", "gerund", "ing verb"]
  },
  Adjective: {
    displayLabel: "Adjective",
    prefix: "ADJECTIVE",
    surfaceForm: "adjective",
    intrinsicPlural: false,
    intrinsicTense: "none",
    exampleHints: ["sparkly", "mushy"],
    tier: "core",
    aliases: ["adjective", "describing word"]
  },
  Adverb: {
    displayLabel: "Adverb",
    prefix: "ADVERB",
    surfaceForm: "adverb",
    intrinsicPlural: false,
    intrinsicTense: "none",
    exampleHints: ["quickly", "gracefully"],
    tier: "core",
    aliases: ["adverb"]
  },
  Person: {
    displayLabel: "Person",
    prefix: "PERSON",
    surfaceForm: "singular_noun",
    intrinsicPlural: false,
    intrinsicTense: "none",
    exampleHints: ["teacher", "mail carrier"],
    tier: "common",
    aliases: ["person", "authority figure", "neighbor", "friend", "parent", "police", "principal", "teacher"]
  },
  Place: {
    displayLabel: "Place",
    prefix: "PLACE",
    surfaceForm: "singular_noun",
    intrinsicPlural: false,
    intrinsicTense: "none",
    exampleHints: ["laundry room", "skate park"],
    tier: "common",
    aliases: ["place", "town", "city", "street", "room", "park"]
  },
  Object: {
    displayLabel: "Object",
    prefix: "OBJECT",
    surfaceForm: "singular_noun",
    intrinsicPlural: false,
    intrinsicTense: "none",
    exampleHints: ["hairdryer", "backpack"],
    tier: "common",
    aliases: ["object", "tool", "item", "award", "material", "obstacle"]
  },
  Animal: {
    displayLabel: "Animal",
    prefix: "ANIMAL",
    surfaceForm: "singular_noun",
    intrinsicPlural: false,
    intrinsicTense: "none",
    exampleHints: ["zebra", "beetle"],
    tier: "common",
    aliases: ["animal", "dog", "cat", "puppy", "kitten", "bird", "bug", "insect", "hornet"]
  },
  "Plural Animal": {
    displayLabel: "Plural Animal",
    prefix: "PLURAL_ANIMAL",
    surfaceForm: "plural_noun",
    intrinsicPlural: true,
    intrinsicTense: "none",
    exampleHints: ["zebras", "beetles"],
    tier: "common",
    aliases: ["plural animal", "plural animals", "animals plural"]
  },
  Food: {
    displayLabel: "Food",
    prefix: "FOOD",
    surfaceForm: "singular_noun",
    intrinsicPlural: false,
    intrinsicTense: "none",
    exampleHints: ["taco", "ice cream sandwich"],
    tier: "common",
    aliases: ["food", "treat", "snack", "local treat", "cookie"]
  },
  "Body Part": {
    displayLabel: "Body Part",
    prefix: "BODY_PART",
    surfaceForm: "singular_noun",
    intrinsicPlural: false,
    intrinsicTense: "none",
    exampleHints: ["elbow", "nose"],
    tier: "common",
    aliases: ["body part"]
  },
  Color: {
    displayLabel: "Color",
    prefix: "COLOR",
    surfaceForm: "adjective",
    intrinsicPlural: false,
    intrinsicTense: "none",
    exampleHints: ["teal", "sunset orange"],
    tier: "common",
    aliases: ["color", "bright color"]
  },
  Number: {
    displayLabel: "Number",
    prefix: "NUMBER",
    surfaceForm: "number",
    intrinsicPlural: false,
    intrinsicTense: "none",
    exampleHints: ["7", "23"],
    tier: "common",
    aliases: ["number"]
  },
  Exclamation: {
    displayLabel: "Exclamation",
    prefix: "EXCLAMATION",
    surfaceForm: "interjection",
    intrinsicPlural: false,
    intrinsicTense: "none",
    exampleHints: ["Yikes", "Hooray"],
    tier: "common",
    aliases: ["exclamation"]
  },
  "Sound Word": {
    displayLabel: "Sound Word",
    prefix: "SOUND",
    surfaceForm: "interjection",
    intrinsicPlural: false,
    intrinsicTense: "none",
    exampleHints: ["zonk", "splat"],
    tier: "common",
    aliases: ["sound", "sound word"]
  },
  Job: {
    displayLabel: "Job",
    prefix: "JOB",
    surfaceForm: "singular_noun",
    intrinsicPlural: false,
    intrinsicTense: "none",
    exampleHints: ["lifeguard", "astronaut"],
    tier: "common",
    aliases: ["job", "profession", "occupation", "movie role", "role in movies"]
  },
  Name: {
    displayLabel: "Name",
    prefix: "NAME",
    surfaceForm: "singular_noun",
    intrinsicPlural: false,
    intrinsicTense: "none",
    exampleHints: ["Maya", "Zeke"],
    tier: "common",
    aliases: ["name", "name of the little girl"]
  },
  "Proper Noun": {
    displayLabel: "Proper Noun",
    prefix: "PROPER_NOUN",
    surfaceForm: "singular_noun",
    intrinsicPlural: false,
    intrinsicTense: "none",
    exampleHints: ["Disney World", "Granite Run Mall"],
    tier: "optional",
    aliases: ["proper noun"]
  },
  Clothing: {
    displayLabel: "Clothing",
    prefix: "CLOTHING",
    surfaceForm: "singular_noun",
    intrinsicPlural: false,
    intrinsicTense: "none",
    exampleHints: ["sneaker", "cape"],
    tier: "optional",
    aliases: ["clothing"]
  },
  Vehicle: {
    displayLabel: "Vehicle",
    prefix: "VEHICLE",
    surfaceForm: "singular_noun",
    intrinsicPlural: false,
    intrinsicTense: "none",
    exampleHints: ["bicycle", "bus"],
    tier: "optional",
    aliases: ["vehicle"]
  },
  "School Subject": {
    displayLabel: "School Subject",
    prefix: "SCHOOL_SUBJECT",
    surfaceForm: "singular_noun",
    intrinsicPlural: false,
    intrinsicTense: "none",
    exampleHints: ["science", "history"],
    tier: "optional",
    aliases: ["school subject"]
  },
  Holiday: {
    displayLabel: "Holiday",
    prefix: "HOLIDAY",
    surfaceForm: "singular_noun",
    intrinsicPlural: false,
    intrinsicTense: "none",
    exampleHints: ["Halloween", "Thanksgiving"],
    tier: "optional",
    aliases: ["holiday"]
  },
  Emotion: {
    displayLabel: "Emotion",
    prefix: "EMOTION",
    surfaceForm: "singular_noun",
    intrinsicPlural: false,
    intrinsicTense: "none",
    exampleHints: ["joy", "embarrassment"],
    tier: "optional",
    aliases: ["emotion", "feeling", "celebrity status"]
  }
};

export const CANONICAL_LABELS = PROMPT_TYPE_ORDER.filter(
  (key) => PROMPT_TYPE_REGISTRY[key].tier !== "optional"
);

const TYPE_SEQUENCE: PromptTypeKey[] = [
  "Noun",
  "Verb",
  "Adjective",
  "Adverb",
  "Plural Noun",
  "Verb Ending In Ing",
  "Past Tense Verb"
];

const ALL_DEFINITIONS = Object.values(PROMPT_TYPE_REGISTRY);
const PREFIX_ORDER = [...ALL_DEFINITIONS].sort((a, b) => b.prefix.length - a.prefix.length);

function looksVariableLike(input: string): boolean {
  return /^[A-Z0-9_]+$/.test(input.trim());
}

function normalizeWords(input: string): string {
  return input
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function simplifyDescriptiveLabel(label: string): string {
  const lowered = label.toLowerCase().trim();

  if (/\bname of\b/.test(lowered)) return "Name";
  if (/\badjective\b/.test(lowered)) return "Adjective";
  if (/\badverb\b/.test(lowered)) return "Adverb";
  if (/\bpast tense verb\b/.test(lowered)) return "Past Tense Verb";
  if (/\bverb ending in\b/.test(lowered)) return "Verb Ending In Ing";
  if (/\brole in movies\b|\bmovie role\b|\bprofession\b|\boccupation\b|\bjob\b/.test(lowered)) {
    return "Job";
  }
  if (/\bplural\b|\bplurals\b/.test(lowered) && /\banimals?\b|\bdogs?\b|\bcats?\b|\bbugs?\b|\binsects?\b|\bbirds?\b/.test(lowered)) {
    return "Plural Animal";
  }
  if (/\bplural\b|\bplurals\b/.test(lowered)) {
    return "Plural Noun";
  }

  const stripped = label
    .replace(/^(a|an|the)\s+/i, "")
    .replace(/^(type|kind|name)\s+of\s+/i, "")
    .replace(/^(another|favorite|local|simple|bright|small|future)\s+/i, "")
    .replace(/^(noun|verb|adjective|adverb)\s+describing\s+(a|an|the)\s+/i, "")
    .replace(/\s+for\s+.+$/i, "")
    .trim();

  return stripped || label;
}

export function typeFromTokenId(tokenId: string): PromptTypeKey | null {
  const normalized = tokenId.replace(/_\d+(?:_\d+)?$/, "");
  for (const def of PREFIX_ORDER) {
    if (normalized.startsWith(def.prefix)) return def.displayLabel;
  }
  return null;
}

export function fallbackTypeForIndex(index: number): PromptTypeKey {
  return TYPE_SEQUENCE[index % TYPE_SEQUENCE.length];
}

function findByAlias(normalizedLabel: string): PromptTypeKey | null {
  const lowered = normalizedLabel.toLowerCase();
  for (const def of ALL_DEFINITIONS) {
    if (def.aliases.some((alias) => lowered.includes(alias.toLowerCase()))) {
      return def.displayLabel;
    }
  }
  return null;
}

export function resolvePromptType(
  rawLabel: string | undefined,
  tokenId: string,
  index: number
): { type: PromptTypeKey; aliasCollapsedFrom?: string } {
  const tokenType = typeFromTokenId(tokenId);

  if (rawLabel && rawLabel.trim() && !looksVariableLike(rawLabel.trim())) {
    const simplified = normalizeWords(simplifyDescriptiveLabel(rawLabel.trim()));
    const direct = (PROMPT_TYPE_ORDER as readonly string[]).includes(simplified)
      ? (simplified as PromptTypeKey)
      : null;
    const aliasMatch = direct ?? findByAlias(simplified);
    if (aliasMatch) {
      return {
        type: aliasMatch,
        aliasCollapsedFrom: aliasMatch === simplified ? undefined : rawLabel.trim()
      };
    }
  }

  return {
    type: tokenType ?? fallbackTypeForIndex(index)
  };
}

export function humanLabel(rawLabel: string | undefined, tokenId: string, index: number): string {
  return resolvePromptType(rawLabel, tokenId, index).type;
}

export function tokenPrefixForLabel(label: string): string {
  const normalized = normalizeWords(label) as PromptTypeKey;
  return PROMPT_TYPE_REGISTRY[normalized]?.prefix ?? "WORD";
}

export function canonicalTokenId(rawLabel: string | undefined, rawTokenId: string, index: number): string {
  const { type } = resolvePromptType(rawLabel, rawTokenId, index);
  return `${PROMPT_TYPE_REGISTRY[type].prefix}_${index + 1}`;
}

export function promptDefinition(type: PromptTypeKey): PromptTypeDefinition {
  return PROMPT_TYPE_REGISTRY[type];
}

export function normalizeBlank(blank: Partial<BlankToken>, tokenId: string, index: number): BlankToken {
  const { type, aliasCollapsedFrom } = resolvePromptType(blank.label, tokenId, index);
  const definition = promptDefinition(type);
  const displayLabel = definition.displayLabel;
  return {
    id: tokenId,
    tokenId,
    label: displayLabel,
    displayLabel,
    type,
    surfaceForm: definition.surfaceForm,
    partOfSpeech: blank.partOfSpeech?.trim() || definition.surfaceForm,
    example: blank.example?.trim() || definition.exampleHints[0] || "",
    aliasCollapsedFrom
  };
}
