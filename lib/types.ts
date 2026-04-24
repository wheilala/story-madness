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
};

export type ImageGenerateResponse = {
  imageBase64?: string;
  imageUrl?: string;
  promptVersion: string;
  moderationDecision: SafetyDecision;
  moderationReason: string;
};
