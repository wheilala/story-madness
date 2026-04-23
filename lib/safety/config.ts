export const SOFT_REPLACEMENTS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bobese\b/gi, replacement: "very chubby" }
];

export const HARD_BLOCK_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "profanity-1", pattern: /\b(f+u+c+k+|s+h+i+t+|b+i+t+c+h+|a+s+s+h+o+l+e+|d+a+m+n+)\b/i },
  { name: "sexual-content", pattern: /\b(porn|nude|naked sex|blowjob|handjob|cum)\b/i },
  { name: "severe-violence", pattern: /\b(rape|murder|kill myself|suicide|self-harm)\b/i },
  { name: "hate-slur-proxy", pattern: /\b(nigger|faggot|kike|chink)\b/i }
];

export const BLOCK_CATEGORIES = new Set([
  "sexual",
  "sexual/minors",
  "hate",
  "hate/threatening",
  "harassment/threatening",
  "violence/graphic",
  "self-harm",
  "self-harm/intent",
  "self-harm/instructions",
  "illicit/violent"
]);

export const REWRITE_SCORE_THRESHOLDS: Record<string, number> = {
  harassment: 0.45,
  violence: 0.35,
  "violence/graphic": 0.2,
  hate: 0.2,
  sexual: 0.2,
  "self-harm": 0.15
};
