import { BlankToken } from "@/lib/types";
import { PromptTypeKey } from "@/lib/madlib-labels";

export type FunnyVerbEntry = {
  base: string;
  past: string;
  ing: string;
};

export type FunnyWordsCatalog = {
  version: string;
  fallbackCategory: string;
  categories: Record<string, string[] | FunnyVerbEntry[]>;
};

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
