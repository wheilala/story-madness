import { HARD_BLOCK_PATTERNS } from "@/lib/safety/config";
import { normalizeForSafety } from "@/lib/safety/normalize";

export function findDeterministicHits(input: string): string[] {
  const normalized = normalizeForSafety(input);
  const compact = normalized.replace(/[\s._-]+/g, "");
  const hits: string[] = [];

  for (const rule of HARD_BLOCK_PATTERNS) {
    if (rule.pattern.test(normalized) || rule.pattern.test(compact)) {
      hits.push(rule.name);
    }
  }
  return [...new Set(hits)];
}

export function hasDeterministicBlock(input: string): boolean {
  return findDeterministicHits(input).length > 0;
}
