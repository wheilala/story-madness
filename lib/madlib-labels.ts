import { BlankToken } from "@/lib/types";

export const CANONICAL_LABELS = [
  "Name",
  "Person",
  "Place",
  "Object",
  "Food",
  "Animal",
  "Plural Animal",
  "Body Part",
  "Color",
  "Number",
  "Noun",
  "Plural Noun",
  "Verb",
  "Past Tense Verb",
  "Verb Ending In Ing",
  "Adjective",
  "Adverb",
  "Exclamation",
  "Sound Word",
  "Job"
] as const;

const TYPE_SEQUENCE = [
  "Noun",
  "Verb",
  "Adjective",
  "Adverb",
  "Plural noun",
  "Verb ending in -ing",
  "Past tense verb"
];

const PREFIX_MAP: Array<{ prefix: string; label: string }> = [
  { prefix: "PLURAL_ANIMAL", label: "Plural Animal" },
  { prefix: "VERB_ING", label: "Verb ending in -ing" },
  { prefix: "VERB_PAST", label: "Past tense verb" },
  { prefix: "PLURAL_NOUN", label: "Plural noun" },
  { prefix: "ADJECTIVE", label: "Adjective" },
  { prefix: "ADJ", label: "Adjective" },
  { prefix: "ADVERB", label: "Adverb" },
  { prefix: "VERB", label: "Verb" },
  { prefix: "NOUN", label: "Noun" },
  { prefix: "PLACE", label: "Place" },
  { prefix: "NAME", label: "Name" },
  { prefix: "NUMBER", label: "Number" },
  { prefix: "EXCLAMATION", label: "Exclamation" },
  { prefix: "SOUND", label: "Sound word" },
  { prefix: "COLOR", label: "Color adjective" },
  { prefix: "ANIMAL", label: "Animal" },
  { prefix: "BODY_PART", label: "Body part" },
  { prefix: "MATERIAL", label: "Material" },
  { prefix: "FOOD", label: "Food" }
];

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

  const mentionsPlural = /\bplural\b|\bplurals\b/.test(lowered);
  const mentionsJob = /\bprofession\b|\boccupation\b|\bjob\b|\brole in movies\b|\bmovie role\b/.test(lowered);
  const mentionsAnimal = /\banimals?\b|\bdogs?\b|\bcats?\b|\bpupp(?:y|ies)\b|\bkittens?\b|\bbirds?\b|\bbugs?\b|\binsects?\b/.test(lowered);

  if (mentionsJob) return "Job";
  if (mentionsPlural && mentionsAnimal) return "Plural Animal";
  if (mentionsPlural) return "Plural Noun";

  const directMap: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /\bverb ending in -ing\b/, label: "Verb Ending In Ing" },
    { pattern: /\bpast tense verb\b/, label: "Past Tense Verb" },
    { pattern: /\bplural noun\b/, label: "Plural Noun" },
    { pattern: /\bauthority figure\b|\bteacher\b|\bpolice\b|\bprincipal\b|\bneighbor\b|\bfriend\b|\bparent\b|\bperson\b/, label: "Person" },
    { pattern: /\badjective\b/, label: "Adjective" },
    { pattern: /\badverb\b/, label: "Adverb" },
    { pattern: /\bbody part\b/, label: "Body Part" },
    { pattern: /\bmovie title\b|\btitle\b/, label: "Noun" },
    { pattern: /\bmovie role\b|\brole in movies\b/, label: "Job" },
    { pattern: /\bcommunity event\b/, label: "Noun" },
    { pattern: /\bcelebrity status\b/, label: "Noun" },
    { pattern: /\bchildhood activity\b|\bactivity\b/, label: "Noun" },
    { pattern: /\btreat or food\b|\bfood\b/, label: "Food" },
    { pattern: /\bcookie\b/, label: "Food" },
    { pattern: /\baward\b/, label: "Object" },
    { pattern: /\btown\b|\bcity\b|\bstreet\b|\broom\b|\bpark\b/, label: "Place" },
    { pattern: /\bobstacle\b|\btool\b|\bitem\b|\bobject\b/, label: "Object" },
    { pattern: /\bprofession\b|\boccupation\b|\bjob\b/, label: "Job" },
    { pattern: /\bname\b/, label: "Name" },
    { pattern: /\bcolor\b/, label: "Color" },
    { pattern: /\banimal\b/, label: "Animal" },
    { pattern: /\bplace\b/, label: "Place" },
    { pattern: /\bnumber\b/, label: "Number" },
    { pattern: /\bmaterial\b/, label: "Object" },
    { pattern: /\bexclamation\b/, label: "Exclamation" },
    { pattern: /\bsound\b/, label: "Sound Word" },
    { pattern: /\bnoun\b/, label: "Noun" },
    { pattern: /\bverb\b/, label: "Verb" }
  ];

  for (const candidate of directMap) {
    if (candidate.pattern.test(lowered)) return candidate.label;
  }

  const stripped = label
    .replace(/^(a|an|the)\s+/i, "")
    .replace(/^(type|kind|name)\s+of\s+/i, "")
    .replace(/^(another|favorite|local|simple|bright)\s+/i, "")
    .replace(/^(noun|verb|adjective|adverb)\s+describing\s+(a|an|the)\s+/i, "")
    .replace(/\s+for\s+.+$/i, "")
    .trim();

  if (!stripped) return label;
  return stripped;
}

export function typeFromTokenId(tokenId: string): string | null {
  const normalized = tokenId.replace(/_\d+$/, "");
  for (const candidate of PREFIX_MAP) {
    if (normalized.startsWith(candidate.prefix)) return candidate.label;
  }
  return null;
}

export function fallbackTypeForIndex(index: number): string {
  return TYPE_SEQUENCE[index % TYPE_SEQUENCE.length];
}

export function humanLabel(rawLabel: string | undefined, tokenId: string, index: number): string {
  if (rawLabel && rawLabel.trim()) {
    const trimmed = rawLabel.trim();
    if (!looksVariableLike(trimmed)) {
      const normalized = normalizeWords(simplifyDescriptiveLabel(trimmed));
      if (normalized.toLowerCase() !== "word") {
        if ((CANONICAL_LABELS as readonly string[]).includes(normalized)) return normalized;
        return typeFromTokenId(tokenId) ?? fallbackTypeForIndex(index);
      }
    }
  }
  return typeFromTokenId(tokenId) ?? fallbackTypeForIndex(index);
}

export function tokenPrefixForLabel(label: string): string {
  const normalized = normalizeWords(label);
  const prefixMap: Record<string, string> = {
    Name: "NAME",
    Person: "PERSON",
    Place: "PLACE",
    Object: "OBJECT",
    Food: "FOOD",
    Animal: "ANIMAL",
    "Plural Animal": "PLURAL_ANIMAL",
    "Body Part": "BODY_PART",
    Color: "COLOR",
    Number: "NUMBER",
    Noun: "NOUN",
    "Plural Noun": "PLURAL_NOUN",
    Verb: "VERB",
    "Past Tense Verb": "VERB_PAST",
    "Verb Ending In Ing": "VERB_ING",
    Adjective: "ADJECTIVE",
    Adverb: "ADVERB",
    Exclamation: "EXCLAMATION",
    "Sound Word": "SOUND",
    Job: "JOB"
  };

  return prefixMap[normalized] ?? "WORD";
}

export function canonicalTokenId(rawLabel: string | undefined, rawTokenId: string, index: number): string {
  const label = humanLabel(rawLabel, rawTokenId, index);
  return `${tokenPrefixForLabel(label)}_${index + 1}`;
}

export function normalizeBlank(blank: Partial<BlankToken>, tokenId: string, index: number): BlankToken {
  const label = humanLabel(blank.label, tokenId, index);
  return {
    id: tokenId,
    label,
    partOfSpeech: blank.partOfSpeech?.trim() || label.toLowerCase(),
    example: blank.example ?? ""
  };
}
