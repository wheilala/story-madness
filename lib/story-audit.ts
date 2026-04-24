import { StoryPipelineDiagnostics } from "@/lib/types";

export type StoryAuditSummary = {
  runCount: number;
  fallbackRate: number;
  retryRate: number;
  unreplacedTokenRate: number;
  grammarSlotFailureRate: number;
  averageStageDurationsMs: Record<string, number>;
};

export function summarizeStoryDiagnostics(entries: StoryPipelineDiagnostics[]): StoryAuditSummary {
  const runCount = entries.length;
  const stageTotals = new Map<string, { total: number; count: number }>();

  for (const entry of entries) {
    for (const timing of entry.timings) {
      const current = stageTotals.get(timing.stage) ?? { total: 0, count: 0 };
      current.total += timing.durationMs;
      current.count += 1;
      stageTotals.set(timing.stage, current);
    }
  }

  return {
    runCount,
    fallbackRate: runCount ? entries.filter((entry) => entry.fallbackUsed).length / runCount : 0,
    retryRate: runCount ? entries.filter((entry) => entry.retryUsed).length / runCount : 0,
    unreplacedTokenRate:
      runCount ? entries.filter((entry) => entry.unreplacedTokenCount > 0).length / runCount : 0,
    grammarSlotFailureRate:
      runCount ? entries.filter((entry) => entry.grammarSlotIssueCount > 0).length / runCount : 0,
    averageStageDurationsMs: Object.fromEntries(
      [...stageTotals.entries()].map(([stage, stats]) => [stage, stats.total / stats.count])
    )
  };
}
