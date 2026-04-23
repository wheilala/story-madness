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
  label: string;
  partOfSpeech: string;
  example: string;
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
