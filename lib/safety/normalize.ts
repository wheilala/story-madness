import { SOFT_REPLACEMENTS } from "@/lib/safety/config";

export function normalizeForSafety(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[@]/g, "a")
    .replace(/[!]/g, "i")
    .replace(/[$]/g, "s")
    .replace(/[0]/g, "o")
    .replace(/[1]/g, "i")
    .replace(/[3]/g, "e")
    .replace(/[4]/g, "a")
    .replace(/[5]/g, "s")
    .replace(/[7]/g, "t")
    .replace(/\s+/g, " ")
    .trim();
}

export function applySoftReplacements(input: string): { text: string; changed: boolean } {
  let text = input;
  for (const rule of SOFT_REPLACEMENTS) {
    text = text.replace(rule.pattern, rule.replacement);
  }
  return { text, changed: text !== input };
}
