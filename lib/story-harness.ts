import { handleStoryGenerate } from "@/lib/api/story-generate";
import { summarizeStoryDiagnostics, StoryAuditSummary } from "@/lib/story-audit";
import { StoryGenerateResponse, StoryPipelineDiagnostics } from "@/lib/types";

export type StoryHarnessScenario = {
  id: string;
  seed: string;
};

export type StoryHarnessRun = {
  scenario: StoryHarnessScenario;
  response: StoryGenerateResponse;
  diagnostics?: StoryPipelineDiagnostics;
  issues: string[];
};

export type StoryHarnessIssueSummary = {
  issue: string;
  count: number;
};

export type StoryHarnessSuggestedAction = {
  trigger: string;
  count: number;
  recommendation: string;
};

export type StoryHarnessReport = {
  summary: StoryAuditSummary;
  runCount: number;
  fallbackCount: number;
  topIssues: StoryHarnessIssueSummary[];
  suggestedActions: StoryHarnessSuggestedAction[];
  runs: StoryHarnessRun[];
};

export const DEFAULT_HARNESS_SCENARIOS: StoryHarnessScenario[] = [
  {
    id: "neighbor-trash",
    seed: "Garth the grumpy neighbor meets chaos as the wind blows his trash cans down the road and leaves a trail of stinky garbage."
  },
  {
    id: "toddler-laundry",
    seed: "A stuttering toddler with chocolate all over his face accidentally walks into the laundry room and causes a silly mess."
  },
  {
    id: "tunny-mall",
    seed: "Tunny the seahorse escapes near Granite Run Mall and turns the shopping area into a goofy chase scene."
  },
  {
    id: "bike-leaves",
    seed: "Two siblings pedal through crunchy fall leaves when a gust of wind sends decorations flying across their street."
  },
  {
    id: "ice-cream-park",
    seed: "A little girl drops her giant ice cream in the park and invents a ridiculous cleanup team to save the day."
  },
  {
    id: "monster-bus-stop",
    seed: "A friendly fuzzy monster tries to help kids at the bus stop but keeps making the morning even sillier."
  }
];

const ACTION_RULES: Array<{ pattern: RegExp; trigger: string; recommendation: string }> = [
  {
    pattern: /weak or abrupt/i,
    trigger: "weak_resolution",
    recommendation:
      "Tighten the acceptance rule for endings or locally repair the final sentence into a clearer resolution beat before triggering fallback."
  },
  {
    pattern: /0 unique blanks|outside the allowed range/i,
    trigger: "blank_count",
    recommendation:
      "Bias local extraction toward a minimum viable blank set and allow accept-with-repair when the prose is good but extraction undershoots the target."
  },
  {
    pattern: /uses .* slot|glued/i,
    trigger: "slot_mismatch",
    recommendation:
      "Refine slot-shape heuristics or candidate phrase merging so local extraction repairs or drops mismatched spans before validation."
  },
  {
    pattern: /capitalized names not grounded|proper names/i,
    trigger: "proper_name_drift",
    recommendation:
      "Keep treating entity detection as advisory and expand the allowlist only when repeated names are clearly false positives."
  },
  {
    pattern: /matched .* seed keywords|anchor back to the seed|repeats a long slice of the seed/i,
    trigger: "seed_alignment",
    recommendation:
      "Relax exact-keyword matching and prefer anchor continuity checks so good stories are not rejected for surface-level wording changes."
  }
];

function flattenIssues(diagnostics?: StoryPipelineDiagnostics): string[] {
  if (!diagnostics) return [];

  const issues = new Set<string>();
  const attemptBuckets = diagnostics.attempts ?? [];
  for (const attempt of attemptBuckets) {
    for (const bucket of Object.values(attempt.failureCategories ?? {})) {
      for (const issue of bucket) {
        if (issue.trim()) issues.add(issue.trim());
      }
    }
  }

  if (issues.size === 0) {
    for (const bucket of Object.values(diagnostics.failureCategories)) {
      for (const issue of bucket) {
        if (issue.trim()) issues.add(issue.trim());
      }
    }
  }

  return [...issues];
}

function summarizeIssues(runs: StoryHarnessRun[]): StoryHarnessIssueSummary[] {
  const counts = new Map<string, number>();

  for (const run of runs) {
    for (const issue of run.issues) {
      counts.set(issue, (counts.get(issue) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([issue, count]) => ({ issue, count }))
    .sort((a, b) => b.count - a.count || a.issue.localeCompare(b.issue))
    .slice(0, 12);
}

function suggestActions(topIssues: StoryHarnessIssueSummary[]): StoryHarnessSuggestedAction[] {
  const actionCounts = new Map<string, StoryHarnessSuggestedAction>();

  for (const issue of topIssues) {
    for (const rule of ACTION_RULES) {
      if (!rule.pattern.test(issue.issue)) continue;
      const current = actionCounts.get(rule.trigger);
      if (current) {
        current.count += issue.count;
      } else {
        actionCounts.set(rule.trigger, {
          trigger: rule.trigger,
          count: issue.count,
          recommendation: rule.recommendation
        });
      }
    }
  }

  return [...actionCounts.values()].sort((a, b) => b.count - a.count || a.trigger.localeCompare(b.trigger));
}

export async function runStoryHarness(
  scenarios: StoryHarnessScenario[] = DEFAULT_HARNESS_SCENARIOS
): Promise<StoryHarnessReport> {
  const runs: StoryHarnessRun[] = [];

  for (const [index, scenario] of scenarios.entries()) {
    const response = await handleStoryGenerate(
      {
        seed: scenario.seed,
        runId: crypto.randomUUID()
      },
      `story-harness-${index}`
    );

    runs.push({
      scenario,
      response,
      diagnostics: response.diagnostics,
      issues: flattenIssues(response.diagnostics)
    });
  }

  const diagnostics = runs
    .map((run) => run.diagnostics)
    .filter((entry): entry is StoryPipelineDiagnostics => Boolean(entry));
  const topIssues = summarizeIssues(runs);

  return {
    summary: summarizeStoryDiagnostics(diagnostics),
    runCount: runs.length,
    fallbackCount: runs.filter((run) => run.diagnostics?.fallbackUsed).length,
    topIssues,
    suggestedActions: suggestActions(topIssues),
    runs
  };
}

export function formatHarnessReport(report: StoryHarnessReport): string {
  const lines = [
    `Runs: ${report.runCount}`,
    `Fallbacks: ${report.fallbackCount}`,
    `Fallback rate: ${(report.summary.fallbackRate * 100).toFixed(1)}%`,
    `Retry rate: ${(report.summary.retryRate * 100).toFixed(1)}%`,
    `Grammar slot failure rate: ${(report.summary.grammarSlotFailureRate * 100).toFixed(1)}%`,
    `Unreplaced token rate: ${(report.summary.unreplacedTokenRate * 100).toFixed(1)}%`
  ];

  if (Object.keys(report.summary.averageStageDurationsMs).length) {
    lines.push("Average stage durations (ms):");
    for (const [stage, duration] of Object.entries(report.summary.averageStageDurationsMs)) {
      lines.push(`- ${stage}: ${duration.toFixed(1)}`);
    }
  }

  if (report.topIssues.length) {
    lines.push("Top issues:");
    for (const issue of report.topIssues) {
      lines.push(`- (${issue.count}) ${issue.issue}`);
    }
  }

  if (report.suggestedActions.length) {
    lines.push("Suggested actions:");
    for (const action of report.suggestedActions) {
      lines.push(`- [${action.count}] ${action.recommendation}`);
    }
  }

  return lines.join("\n");
}
