import { promises as fs } from "node:fs";
import path from "node:path";
import { parseTokenOccurrences } from "@/lib/story-format";
import { readDoc, wink } from "@/lib/wink";
import { BlankToken, RevealLintIssue, RevealLintReport } from "@/lib/types";

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

function normalizedSnippetEdge(input: string, fromEnd: boolean): string {
  const chunk = fromEnd ? input.slice(-50) : input.slice(0, 50);
  return chunk.replace(/\s+/g, " ").trim().toLowerCase();
}

function firstPos(text: string): string | null {
  const normalized = text.trim();
  if (!normalized) return null;
  const poses = readDoc(normalized).tokens().out(wink.its.pos) as string[] | undefined;
  return poses?.[0] ?? null;
}

function inferSlotShape(before: string, after: string): SlotShape {
  const left = normalizedSnippetEdge(before, true);
  const nextPos = firstPos(after);

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
  if (/\b(for|with|under|inside|near|around|into|onto|beside|behind|at|of)\s*$/.test(left)) return "noun_phrase";
  if (/\b(is|are|was|were|feel|seem|look)\s*$/.test(left)) return "adjective_predicate";
  if (/\b(very|really|super|too)\s*$/.test(left)) return "adjective_predicate";
  if (/\b(moved|ran|worked|laughed|spoke|walked|zoomed|grinned|tiptoed|fell|went|flew|turned)\s*$/.test(left)) {
    return "adverb_modifier";
  }
  return "freeform";
}

function excerptAround(text: string, phrase: string): string {
  const index = text.toLowerCase().indexOf(phrase.toLowerCase());
  if (index === -1) return phrase;
  const start = Math.max(0, index - 30);
  const end = Math.min(text.length, index + phrase.length + 30);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function pushIssue(
  issues: RevealLintIssue[],
  issue: RevealLintIssue
) {
  const key = `${issue.category}:${issue.excerpt}:${issue.tokenId ?? ""}`;
  if (!issues.some((existing) => `${existing.category}:${existing.excerpt}:${existing.tokenId ?? ""}` === key)) {
    issues.push(issue);
  }
}

function lintBlankOccurrence(
  issues: RevealLintIssue[],
  occurrence: ReturnType<typeof parseTokenOccurrences>[number],
  blank: BlankToken | undefined,
  fill: string,
  revealedStory: string
) {
  const shape = inferSlotShape(occurrence.before, occurrence.after);
  const pos = firstPos(fill) ?? "";
  const excerpt = excerptAround(revealedStory, fill);
  const normalizedFill = fill.trim().toLowerCase();

  if ((shape === "base_verb" || shape === "past_tense_predicate") && (pos === "ADV" || pos === "ADJ" || pos === "NOUN")) {
    pushIssue(issues, {
      category: "verb_slot_naturalness",
      message: `Fill "${fill}" landed in a verb-shaped slot but reads more like ${pos.toLowerCase()}.`,
      excerpt,
      tokenId: occurrence.id,
      fill
    });
  }

  if (shape === "noun_phrase" && (pos === "ADV" || pos === "VERB" || pos === "ADJ")) {
    pushIssue(issues, {
      category: "noun_phrase_completion",
      message: `Fill "${fill}" landed in a noun phrase slot but reads more like ${pos.toLowerCase()}.`,
      excerpt,
      tokenId: occurrence.id,
      fill
    });
  }

  if ((shape === "adjective_before_noun" || shape === "adjective_predicate") && (pos === "NOUN" || pos === "VERB")) {
    pushIssue(issues, {
      category: "adjective_slot_naturalness",
      message: `Fill "${fill}" landed in an adjective-shaped slot but reads more like ${pos.toLowerCase()}.`,
      excerpt,
      tokenId: occurrence.id,
      fill
    });
  }

  if (
    blank?.type === "Plural Noun" &&
    !normalizedFill.endsWith("s") &&
    !normalizedFill.endsWith("ies")
  ) {
    pushIssue(issues, {
      category: "countability_issue",
      message: `Fill "${fill}" is in a plural noun slot but does not look plural.`,
      excerpt,
      tokenId: occurrence.id,
      fill
    });
  }

  if (
    blank?.type === "Person" &&
    /(toothbrush|bucket|spatula|sock|rubber duck|crayon|helmet|lunchbox)/.test(normalizedFill)
  ) {
    pushIssue(issues, {
      category: "semantic_class_mismatch",
      message: `Fill "${fill}" looks like an object in a person-like role.`,
      excerpt,
      tokenId: occurrence.id,
      fill
    });
  }
}

function lintSurfacePatterns(issues: RevealLintIssue[], revealedStory: string) {
  const patterns: Array<{ pattern: RegExp; category: RevealLintIssue["category"]; message: string }> = [
    {
      pattern: /\b(?:it|he|she|they|[A-Z][a-z]+)\s+[A-Za-z'-]+ly\s+(?:into|onto|under|through|toward|towards|across)\b/g,
      category: "verb_slot_naturalness",
      message: "An adverb appears where the sentence likely wants an action verb."
    },
    {
      pattern: /\b(?:a|an|the)\s+[A-Za-z'-]+ly\b/g,
      category: "noun_phrase_completion",
      message: "A determiner is followed by an adverb-like word, which often reads as a broken noun phrase."
    },
    {
      pattern: /\b(?:and|then)\s+[A-Za-z'-]+ly\b/g,
      category: "verb_slot_naturalness",
      message: "A transition phrase is followed by an adverb-like word where an action may be missing."
    }
  ];

  for (const { pattern, category, message } of patterns) {
    for (const match of revealedStory.matchAll(pattern)) {
      const excerpt = excerptAround(revealedStory, match[0]);
      pushIssue(issues, {
        category,
        message,
        excerpt,
        fill: match[0]
      });
    }
  }
}

export function evaluateRevealLint(params: {
  storyTemplate: string;
  blanks?: BlankToken[];
  fills: Record<string, string>;
  revealedStory: string;
}): RevealLintReport {
  const issues: RevealLintIssue[] = [];
  const blanksById = new Map((params.blanks ?? []).map((blank) => [blank.id, blank]));

  for (const occurrence of parseTokenOccurrences(params.storyTemplate)) {
    const fill = params.fills[occurrence.id];
    if (!fill?.trim()) continue;
    lintBlankOccurrence(issues, occurrence, blanksById.get(occurrence.id), fill, params.revealedStory);
  }

  lintSurfacePatterns(issues, params.revealedStory);

  const categoryCounts = issues.reduce<Record<string, number>>((counts, issue) => {
    counts[issue.category] = (counts[issue.category] ?? 0) + 1;
    return counts;
  }, {});

  return {
    issueCount: issues.length,
    categoryCounts,
    issues
  };
}

export async function retainRevealLintRecord(params: {
  runId: string;
  storyTemplate: string;
  revealedStory: string;
  fills: Record<string, string>;
  lint: RevealLintReport;
}): Promise<string> {
  const artifactsDir = path.join(process.cwd(), "artifacts");
  const logPath = path.join(artifactsDir, "reveal-lint-log.jsonl");
  await fs.mkdir(artifactsDir, { recursive: true });
  await fs.appendFile(
    logPath,
    JSON.stringify({
      timestamp: new Date().toISOString(),
      runId: params.runId,
      storyTemplate: params.storyTemplate,
      revealedStory: params.revealedStory,
      fills: params.fills,
      lint: params.lint
    }) + "\n",
    "utf8"
  );
  return logPath;
}
