export type SafetyDecision = "ALLOW" | "REWRITE" | "BLOCK";

export type ModerationCategoryFlags = Record<string, boolean>;
export type ModerationCategoryScores = Record<string, number>;

export type ModerationResult = {
  flagged: boolean;
  categories: ModerationCategoryFlags;
  categoryScores: ModerationCategoryScores;
  model?: string;
};

export type SafetyEvaluation = {
  decision: SafetyDecision;
  reason: string;
  normalizedText: string;
  rewrittenText?: string;
  deterministicHits: string[];
  moderation: ModerationResult;
};

export type BlankToken = {
  id: string;
  tokenId: string;
  label: string;
  displayLabel: string;
  type: string;
  surfaceForm: string;
  partOfSpeech: string;
  example: string;
  aliasCollapsedFrom?: string;
};

export type StoryTemplatePayload = {
  title: string;
  storyTemplate: string;
  blanks: BlankToken[];
};

export type StoryGenerateResponse = StoryTemplatePayload & {
  moderationDecision: SafetyDecision;
  moderationReason: string;
  rewriteApplied?: boolean;
  rewrittenSeed?: string;
  generationWarning?: string;
  diagnostics?: StoryPipelineDiagnostics;
};

export type StoryStageTiming = {
  stage: string;
  durationMs: number;
};

export type StoryGenerationAttemptDiagnostic = {
  attempt: "initial" | "retry" | "fallback";
  outcome: "accepted" | "retry_requested" | "model_error" | "fallback_used";
  summary: string;
  failureCategories?: {
    seed: string[];
    blanks: string[];
    schema: string[];
    cohesion: string[];
  };
};

export type StoryPipelineDiagnostics = {
  fallbackUsed: boolean;
  retryUsed: boolean;
  unreplacedTokenCount: number;
  grammarSlotIssueCount: number;
  finalOutcome?: "accepted" | "accepted_with_repairs" | "fallback";
  failureCategories: {
    seed: string[];
    blanks: string[];
    schema: string[];
    cohesion: string[];
  };
  attempts?: StoryGenerationAttemptDiagnostic[];
  timings: StoryStageTiming[];
};

export type StoryRevealResponse = {
  revealedStory: string;
  moderationDecision: SafetyDecision;
  moderationReason: string;
  lint?: RevealLintReport;
};

export type RevealLintIssue = {
  category:
    | "verb_slot_naturalness"
    | "noun_phrase_completion"
    | "adjective_slot_naturalness"
    | "semantic_class_mismatch"
    | "countability_issue";
  message: string;
  excerpt: string;
  tokenId?: string;
  fill?: string;
};

export type RevealLintReport = {
  issueCount: number;
  categoryCounts: Record<string, number>;
  issues: RevealLintIssue[];
  retainedLogPath?: string;
};

export type ImageGenerateResponse = {
  imageBase64?: string;
  imageUrl?: string;
  promptVersion: string;
  moderationDecision: SafetyDecision;
  moderationReason: string;
};

export type RevealEvaluationDeterministicReport = {
  unresolvedTokenCount: number;
  articleMismatchCount: number;
  objectBlankShare: number;
  genericNounShare: number;
  nounFamilyShare: number;
  repeatedFillCount: number;
  suspiciousLabels: string[];
  warnings: string[];
  overallScore: number;
};

export type RevealEvaluationModelReport = {
  coherenceScore: number;
  humorFitScore: number;
  naturalnessScore: number;
  semanticDriftScore: number;
  pass: boolean;
  confidence: number;
  summary: string;
  flaggedSubstitutions: string[];
};

export type RevealEvaluationReport = {
  seed: string;
  title: string;
  fills: Record<string, string>;
  deterministic: RevealEvaluationDeterministicReport;
  model?: RevealEvaluationModelReport;
  modelError?: string;
};

export type RevealEvaluationRunResponse = {
  seed: string;
  title: string;
  storyTemplate: string;
  blanks: BlankToken[];
  fills: Record<string, string>;
  revealedStory: string;
  generationFallbackUsed: boolean;
  generationRetryUsed: boolean;
  evaluation: RevealEvaluationReport;
};

export type SelectorKind = "local" | "humor_shadow";

export type SelectorShadowDiagnostics = {
  selector: SelectorKind;
  recommendedCount: number;
  acceptedCount: number;
  rejectedCount: number;
  backfilledCount: number;
  acceptedTexts: string[];
  rejections: Array<{
    text: string;
    reason: string;
  }>;
  recommendationError?: string;
};

export type SelectorComparisonEntry = {
  selector: SelectorKind;
  storyTemplate: string;
  blanks: BlankToken[];
  fills: Record<string, string>;
  revealedStory: string;
  evaluation: RevealEvaluationReport;
  diagnostics?: SelectorShadowDiagnostics;
};

export type SelectorComparisonSummary = {
  winner: SelectorKind | "tie" | "skipped";
  reason: string;
  comparedOn: string[];
};

export type SelectorComparisonRunResponse = {
  seed: string;
  title: string;
  storyBody: string;
  generationFallbackUsed: boolean;
  generationRetryUsed: boolean;
  local: SelectorComparisonEntry;
  humorShadow?: SelectorComparisonEntry;
  comparison: SelectorComparisonSummary;
};
