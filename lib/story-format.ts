export type StoryPart = {
  isFill: boolean;
  tokenId?: string;
  text: string;
};

export type TokenOccurrence = {
  id: string;
  index: number;
  start: number;
  end: number;
  before: string;
  after: string;
};

const tokenPattern = /\[([^\]\r\n]+)\]/g;

export function parseTokenOccurrences(template: string): TokenOccurrence[] {
  const occurrences: TokenOccurrence[] = [];
  tokenPattern.lastIndex = 0;

  let match = tokenPattern.exec(template);
  while (match) {
    const [full, id] = match;
    occurrences.push({
      id,
      index: occurrences.length,
      start: match.index,
      end: match.index + full.length,
      before: template.slice(0, match.index),
      after: template.slice(match.index + full.length)
    });
    match = tokenPattern.exec(template);
  }

  return occurrences;
}

export function parseTokens(template: string): string[] {
  const matches = parseTokenOccurrences(template).map((m) => m.id);
  return [...new Set(matches)];
}

function shouldCapitalizeAtBoundary(textBefore: string): boolean {
  if (!textBefore.trim()) return true;
  let i = textBefore.length - 1;
  while (i >= 0 && /\s/.test(textBefore[i])) i -= 1;
  while (i >= 0 && /["'”’)\]}]/.test(textBefore[i])) i -= 1;
  if (i < 0) return true;
  return /[.!?\n]/.test(textBefore[i]);
}

function normalizeFillForContext(raw: string, capitalize: boolean): string {
  const cleaned = raw.trim().replace(/\s+/g, " ");
  if (!cleaned) return cleaned;

  let value = cleaned;

  if (capitalize) {
    value = value.charAt(0).toUpperCase() + value.slice(1);
  }
  return value;
}

export function buildStoryParts(storyTemplate: string, fills: Record<string, string>): StoryPart[] {
  const parts: StoryPart[] = [];
  let resultSoFar = "";
  let cursor = 0;
  tokenPattern.lastIndex = 0;

  let match = tokenPattern.exec(storyTemplate);
  while (match) {
    const [full, tokenId] = match;
    const literal = storyTemplate.slice(cursor, match.index);
    if (literal) {
      parts.push({ isFill: false, text: literal });
      resultSoFar += literal;
    }

    const userValue = fills[tokenId] ?? `(${tokenId.toLowerCase()})`;
    const normalized = normalizeFillForContext(userValue, shouldCapitalizeAtBoundary(resultSoFar));
    parts.push({ isFill: true, tokenId, text: normalized });
    resultSoFar += normalized;
    cursor = match.index + full.length;
    match = tokenPattern.exec(storyTemplate);
  }

  const tail = storyTemplate.slice(cursor);
  if (tail) parts.push({ isFill: false, text: tail });
  return parts;
}

export function fillStoryTemplate(storyTemplate: string, fills: Record<string, string>): string {
  return buildStoryParts(storyTemplate, fills)
    .map((part) => part.text)
    .join("");
}
