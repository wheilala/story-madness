"use client";

import React, { startTransition, useEffect, useState } from "react";
import {
  BlankToken,
  ImageGenerateResponse,
  StoryGenerateResponse,
  StoryRevealResponse
} from "@/lib/types";
import { hasDeterministicBlock } from "@/lib/safety/word-filter";
import { buildStoryParts } from "@/lib/story-format";
import { humanLabel } from "@/lib/madlib-labels";
import { autoFillBlanks, FunnyWordsCatalog } from "@/lib/funny-words";
import funnyWordsCatalogJson from "@/funny-words.json";

type UiStatus = { kind: "ok" | "warn" | "block"; text: string } | null;
type StepKey = "compose" | "fills" | "reveal" | "image";
type LoadingStage = "story" | "reveal" | null;
const SHOW_GENERATION_TEST_MODE = true;
const funnyWordsCatalog = funnyWordsCatalogJson as FunnyWordsCatalog;

const defaultSeed = "";
const sampleSeeds = [
  "A goalie slips on a wet soccer ball and starts a neighborhood safety club.",
  "Maya drops her giant ice cream at the park and invents a super-cleanup team.",
  "Two siblings crash their bike into a pile of leaves and decide to become crossing guards."
];

const loadingMessages: Record<
  Exclude<LoadingStage, null>,
  Array<{ title: string; body: string; progress: number }>
> = {
  story: [
    {
      title: "Catching your seed",
      body: "Razzle is keeping the story close to your original idea so the silly plot does not wander off.",
      progress: 0.2
    },
    {
      title: "Picking the goofy blanks",
      body: "We are choosing word prompts that fit the story cleanly and only get used once.",
      progress: 0.74
    },
    {
      title: "Tuning the chaos",
      body: "The story is being checked for kid-safe fun, smooth grammar slots, and extra nonsense.",
      progress: 1
    }
  ],
  reveal: [
    {
      title: "Dropping in your words",
      body: "Razzle is weaving each fill into the story so every joke lands in the right place.",
      progress: 0.34
    },
    {
      title: "Polishing the reveal",
      body: "We are checking the finished story and making sure the final version still feels playful and readable.",
      progress: 0.74
    },
    {
      title: "Getting ready for the big laugh",
      body: "Almost there. The full silly story is about to pop onto the page.",
      progress: 1
    }
  ]
};

const defaultLoadingDurations: Record<Exclude<LoadingStage, null>, number> = {
  story: 5600,
  reveal: 2200
};

const stepLabels: Array<{ key: StepKey; short: string; title: string }> = [
  { key: "compose", short: "1", title: "Seed" },
  { key: "fills", short: "2", title: "Words" },
  { key: "reveal", short: "3", title: "Reveal" },
  { key: "image", short: "4", title: "Color" }
];

function createRunId(): string {
  if (
    typeof globalThis !== "undefined" &&
    globalThis.crypto &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function stepIndex(step: StepKey): number {
  return stepLabels.findIndex((item) => item.key === step);
}

function placeholderForLabel(label: string): string {
  const lowered = label.trim().toLowerCase();
  if (!lowered) return "Enter a word";
  const article = /^[aeiou]/.test(lowered) ? "an" : "a";
  return `Enter ${article} ${lowered}`;
}

function summarizeGenerationIssue(story: StoryGenerateResponse): string | null {
  if (story.generationWarning) return story.generationWarning;
  if (story.diagnostics?.retryUsed) {
    return "Story generation needed extra repair passes before it was ready.";
  }
  return null;
}

function renderFailureList(items: string[]) {
  if (!items.length) return null;
  return (
    <ul className="qualityList">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function renderLintIssueList(
  items: Array<{ message: string; excerpt: string }>
) {
  if (!items.length) return null;
  return (
    <ul className="qualityList">
      {items.map((item, index) => (
        <li key={`${item.message}-${index}`}>
          <strong>{item.message}</strong>
          <div className="tiny lintExcerpt">{item.excerpt}</div>
        </li>
      ))}
    </ul>
  );
}

export default function HomePage() {
  const [runId] = useState<string>(() => createRunId());
  const [seed, setSeed] = useState(defaultSeed);
  const [generatedSeed, setGeneratedSeed] = useState<string>("");
  const [seedStatus, setSeedStatus] = useState<UiStatus>(null);
  const [story, setStory] = useState<StoryGenerateResponse | null>(null);
  const [fills, setFills] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [reveal, setReveal] = useState<StoryRevealResponse | null>(null);
  const [image, setImage] = useState<ImageGenerateResponse | null>(null);
  const [loadingImage, setLoadingImage] = useState(false);
  const [rewriteSuggestion, setRewriteSuggestion] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState<StepKey>("compose");
  const [loadingStage, setLoadingStage] = useState<LoadingStage>(null);
  const [loadingStartedAt, setLoadingStartedAt] = useState<number | null>(null);
  const [loadingDurationTargets, setLoadingDurationTargets] = useState(defaultLoadingDurations);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const storyIsStale = Boolean(story?.storyTemplate && generatedSeed.trim() !== seed.trim());

  const currentLoadingMessages = loadingStage ? loadingMessages[loadingStage] : [];

  useEffect(() => {
    if (!loadingStage) {
      setLoadingMessageIndex(0);
      setLoadingStartedAt(null);
      return;
    }

    setLoadingMessageIndex(0);
    const startedAt = Date.now();
    setLoadingStartedAt(startedAt);
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const targetDuration = loadingDurationTargets[loadingStage];
      const progress = Math.min(0.98, elapsed / Math.max(targetDuration, 1200));
      const nextIndex = loadingMessages[loadingStage].findIndex((message) => progress < message.progress);
      setLoadingMessageIndex(
        nextIndex === -1 ? loadingMessages[loadingStage].length - 1 : nextIndex
      );
    }, 120);

    return () => window.clearInterval(timer);
  }, [loadingDurationTargets, loadingStage]);

  const currentLoadingMessage = currentLoadingMessages[loadingMessageIndex] ?? null;
  const canShowFills = Boolean(story?.storyTemplate);
  const canShowReveal = Boolean(reveal);
  const canShowImage = Boolean(image);

  const filledCount = Object.values(fills).filter((value) => value.trim()).length;

  function prettyTokenLabel(blank: BlankToken, index: number): string {
    return humanLabel(blank.label, blank.id, index);
  }

  function renderHighlightedStory() {
    if (!story?.storyTemplate) return null;
    const parts = buildStoryParts(story.storyTemplate, fills);
    return parts.map((part, idx) =>
      part.isFill ? (
        <strong key={`${part.tokenId ?? "fill"}-${idx}`}>{part.text}</strong>
      ) : (
        <React.Fragment key={`text-${idx}`}>{part.text}</React.Fragment>
      )
    );
  }

  function renderGenerationDiagnostics() {
    if (!SHOW_GENERATION_TEST_MODE || !story?.diagnostics) return null;

    const diagnostics = story.diagnostics;
    if (diagnostics.finalOutcome === "accepted" && !diagnostics.retryUsed && !diagnostics.fallbackUsed) {
      return null;
    }

    return (
      <div className="status warn qualityBanner generationDebug noPrint">
        <strong>Test mode: generation diagnostics</strong>
        <p className="tiny debugIntro">
          Final outcome: {diagnostics.finalOutcome ?? "unknown"}.
          {diagnostics.fallbackUsed ? " Fallback was used." : " Fallback was not used."}
          {diagnostics.retryUsed ? " Retry logic ran." : " Retry logic did not run."}
        </p>
        {diagnostics.attempts?.map((attempt) => (
          <div key={`${attempt.attempt}-${attempt.outcome}`} className="debugAttempt">
            <p className="tiny">
              <strong>{attempt.attempt}</strong>: {attempt.summary}
            </p>
            {attempt.failureCategories?.seed?.length ? (
              <>
                <p className="tiny debugLabel">Seed / anchor issues</p>
                {renderFailureList(attempt.failureCategories.seed)}
              </>
            ) : null}
            {attempt.failureCategories?.blanks?.length ? (
              <>
                <p className="tiny debugLabel">Blank / token issues</p>
                {renderFailureList(attempt.failureCategories.blanks)}
              </>
            ) : null}
            {attempt.failureCategories?.schema?.length ? (
              <>
                <p className="tiny debugLabel">Schema / structure issues</p>
                {renderFailureList(attempt.failureCategories.schema)}
              </>
            ) : null}
            {attempt.failureCategories?.cohesion?.length ? (
              <>
                <p className="tiny debugLabel">Story quality issues</p>
                {renderFailureList(attempt.failureCategories.cohesion)}
              </>
            ) : null}
          </div>
        ))}
      </div>
    );
  }

  function renderRevealDiagnostics() {
    if (!SHOW_GENERATION_TEST_MODE || !reveal?.lint?.issueCount) return null;

    return (
      <div className="status warn qualityBanner generationDebug noPrint">
        <strong>Test mode: reveal lint</strong>
        <p className="tiny debugIntro">
          {reveal.lint.issueCount} potential naturalness issue{reveal.lint.issueCount === 1 ? "" : "s"} spotted.
        </p>
        {renderLintIssueList(reveal.lint.issues.slice(0, 6))}
      </div>
    );
  }

  function resetGeneratedState() {
    setStory(null);
    setGeneratedSeed("");
    setFills({});
    setFieldErrors({});
    setReveal(null);
    setImage(null);
    setRewriteSuggestion(null);
  }

  function onSeedChange(value: string) {
    setSeed(value);
    if (story?.storyTemplate && value.trim() !== generatedSeed.trim()) {
      setSeedStatus({
        kind: "warn",
        text: "Seed changed. Generate the story again to refresh the whole adventure."
      });
      setReveal(null);
      setImage(null);
      setActiveStep("compose");
    }
  }

  function chooseSampleSeed(value: string) {
    setSeed(value);
    setSeedStatus({
      kind: "ok",
      text: "Example added. Generate the story when you are ready."
    });
    if (story?.storyTemplate && value.trim() !== generatedSeed.trim()) {
      setReveal(null);
      setImage(null);
    }
  }

  function updateField(id: string, value: string) {
    setFills((prev) => ({ ...prev, [id]: value }));
    if (!value.trim()) {
      setFieldErrors((prev) => ({ ...prev, [id]: "" }));
      return;
    }
    if (hasDeterministicBlock(value)) {
      setFieldErrors((prev) => ({
        ...prev,
        [id]: "Try a different word (kid-safe words only)."
      }));
    } else {
      setFieldErrors((prev) => ({ ...prev, [id]: "" }));
    }
  }

  function autoFillFunnyWords() {
    if (!story?.blanks?.length) return;
    const variantIndex = Math.floor(Date.now() / 1000) % 1000;
    const nextFills = autoFillBlanks(story.blanks, funnyWordsCatalog, variantIndex);
    startTransition(() => {
      setFills(nextFills);
      setFieldErrors({});
    });
  }

  async function onGenerateStory() {
    if (!seed.trim()) return;
    if (hasDeterministicBlock(seed)) {
      setSeedStatus({ kind: "block", text: "That seed is blocked by the safety filter." });
      return;
    }

    const startedAt = Date.now();
    setLoadingStage("story");
    setSeedStatus(null);
    resetGeneratedState();

    try {
      const response = await fetch("/api/story/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seed, runId })
      });
      const data = (await response.json()) as StoryGenerateResponse | { error: string };

      if (!response.ok) {
        setSeedStatus({ kind: "block", text: "Story generation failed. Please try again." });
        setActiveStep("compose");
        return;
      }

      const storyResult = data as StoryGenerateResponse;
      if (storyResult.moderationDecision === "BLOCK") {
        setSeedStatus({ kind: "block", text: storyResult.moderationReason });
        setActiveStep("compose");
        return;
      }

      if (storyResult.moderationDecision === "REWRITE") {
        setSeedStatus({
          kind: "warn",
          text: "Seed was adjusted for safety. You can accept the rewrite below."
        });
        setRewriteSuggestion(storyResult.rewrittenSeed ?? null);
      } else if (storyResult.generationWarning) {
        setSeedStatus({
          kind: "warn",
          text: "Story generation had issues, so the app is showing backup content instead of pretending it succeeded cleanly."
        });
      } else {
        setSeedStatus({ kind: "ok", text: "Story generated. Fill in the words to reveal it." });
      }

      const safeBlanks = (storyResult.blanks ?? []).filter(
        (blank): blank is BlankToken => Boolean(blank && typeof blank.id === "string" && blank.id.trim())
      );
      const storyDuration =
        storyResult.diagnostics?.timings?.reduce((sum, timing) => sum + timing.durationMs, 0) ||
        Date.now() - startedAt;
      setLoadingDurationTargets((prev) => ({
        ...prev,
        story: Math.round(prev.story * 0.45 + storyDuration * 0.55)
      }));
      setStory({ ...storyResult, blanks: safeBlanks });
      setGeneratedSeed(seed.trim());
      const nextFills: Record<string, string> = {};
      for (const blank of safeBlanks) nextFills[blank.id] = "";
      setFills(nextFills);
      setFieldErrors({});
      setActiveStep("fills");
    } finally {
      setLoadingStage(null);
    }
  }

  async function onRevealStory() {
    if (!story?.storyTemplate) return;
    if (storyIsStale) {
      setSeedStatus({ kind: "warn", text: "Generate the story again to match your latest seed." });
      setActiveStep("compose");
      return;
    }
    if (Object.values(fieldErrors).some(Boolean)) return;

    const startedAt = Date.now();
    setLoadingStage("reveal");
    try {
      const response = await fetch("/api/story/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, storyTemplate: story.storyTemplate, fills })
      });
      const data = (await response.json()) as StoryRevealResponse;
      setReveal(data);
      const revealDuration = Date.now() - startedAt;
      setLoadingDurationTargets((prev) => ({
        ...prev,
        reveal: Math.round(prev.reveal * 0.45 + revealDuration * 0.55)
      }));

      setActiveStep("reveal");
    } finally {
      setLoadingStage(null);
    }
  }

  async function onGenerateImage() {
    if (!story?.storyTemplate) return;
    if (storyIsStale) {
      setSeedStatus({ kind: "warn", text: "Generate the story again before creating the coloring page." });
      setActiveStep("compose");
      return;
    }

    setLoadingImage(true);
    try {
      const response = await fetch("/api/image/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, seed, storyTemplate: story.storyTemplate })
      });
      const data = (await response.json()) as ImageGenerateResponse;
      setImage(data);
      setActiveStep("image");
    } finally {
      setLoadingImage(false);
    }
  }

  function applyRewriteSuggestion() {
    if (!rewriteSuggestion) return;
    setSeed(rewriteSuggestion);
    setRewriteSuggestion(null);
    setSeedStatus({ kind: "ok", text: "Rewrite accepted. Generate the story when you are ready." });
  }

  function goToStep(step: StepKey) {
    if (step === "compose") {
      setActiveStep("compose");
      return;
    }
    if (step === "fills" && canShowFills) {
      setActiveStep("fills");
      return;
    }
    if (step === "reveal" && canShowReveal) {
      setActiveStep("reveal");
      return;
    }
    if (step === "image" && canShowImage) {
      setActiveStep("image");
    }
  }

  function renderStepNavigation() {
    return (
      <nav className="stepRail" aria-label="Story progress">
        {stepLabels.map((step) => {
          const available =
            step.key === "compose" ||
            (step.key === "fills" && canShowFills) ||
            (step.key === "reveal" && canShowReveal) ||
            (step.key === "image" && canShowImage);
          const current = activeStep === step.key;
          const completed = stepIndex(activeStep) > stepIndex(step.key) && available;

          return (
            <button
              key={step.key}
              type="button"
              className={`stepPill ${current ? "current" : ""} ${completed ? "done" : ""}`}
              onClick={() => goToStep(step.key)}
              disabled={!available || Boolean(loadingStage)}
            >
              <span className="stepNumber">{step.short}</span>
              <span className="stepText">{step.title}</span>
            </button>
          );
        })}
      </nav>
    );
  }

  function renderComposeStep() {
    return (
      <section className="stagePage">
        <section className="composeHero">
          <div className="composeHeroShade" aria-hidden="true" />
          <div className="composeHeroInner">
            <div className="heroCopy">
              <p className="heroBrand">Razzle&apos;s Story Lab</p>
              <h1>Start with one goofy spark.</h1>
              <p className="subtitle">
                Drop in a seed and Razzle turns it into a kid-safe silly story creator ready to fill,
                reveal, and print.
              </p>
            </div>

            <div className="heroComposer">
              <div className="composerCard">
                <textarea
                  value={seed}
                  onChange={(e) => onSeedChange(e.target.value)}
                  placeholder="A nervous dragon sneezes glitter on the school talent show..."
                />
                <div className="btnRow heroActions">
                  <button onClick={onGenerateStory} disabled={Boolean(loadingStage) || !seed.trim()}>
                    Generate Story
                  </button>
                  <button
                    className="ghost"
                    onClick={() => {
                      setSeed(defaultSeed);
                      setSeedStatus(null);
                      resetGeneratedState();
                      setActiveStep("compose");
                    }}
                  >
                    Clear
                  </button>
                </div>
                {seedStatus && <div className={`status ${seedStatus.kind}`}>{seedStatus.text}</div>}
                {rewriteSuggestion && (
                  <div className="status warn">
                    <div>Suggested safe rewrite:</div>
                    <pre className="storyOut">{rewriteSuggestion}</pre>
                    <div className="btnRow">
                      <button onClick={applyRewriteSuggestion}>Use Rewrite</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="samplesPanel">
          <div className="samplesHeader">
            <div>
              <p className="tiny samplesLabel">Examples</p>
              <h2>Try a seed like these</h2>
            </div>
            <p className="tiny samplesCopy">
              Tap an example to drop the whole idea into the story box, just like starter prompts in
              chat tools.
            </p>
          </div>
          <div className="seedSamples">
            {sampleSeeds.map((sample, idx) => (
              <button key={sample} className="sampleBtn" onClick={() => chooseSampleSeed(sample)}>
                <span className="sampleMeta">{`Example ${idx + 1}`}</span>
                <span className="sampleText">{sample}</span>
              </button>
            ))}
          </div>
        </section>
      </section>
    );
  }

  function renderLoadingStep() {
    if (!currentLoadingMessage) return null;

    return (
      <section className="stagePage loadingStagePage">
        <div className="stagePanel loadingPanel">
          <div className="loadingMascot" aria-hidden="true" />
          <div className="loadingOrb" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <p className="stageEyebrow">
            {loadingStage === "story" ? "Crafting your silly story" : "Revealing your silly story"}
          </p>
          <h2>{currentLoadingMessage.title}</h2>
          <p className="stageLead">{currentLoadingMessage.body}</p>
          <div className="loadingDots" aria-hidden="true">
            {currentLoadingMessages.map((message, idx) => (
              <span key={message.title} className={idx === loadingMessageIndex ? "active" : ""} />
            ))}
          </div>
          <p className="tiny loadingHint">
            {loadingStartedAt
              ? `Step ${loadingMessageIndex + 1} of ${currentLoadingMessages.length}`
              : null}
          </p>
        </div>
      </section>
    );
  }

  function renderFillsStep() {
    if (!story) return null;
    const generationIssue = summarizeGenerationIssue(story);

    return (
      <section className="stagePage">
        <div className="stagePanel">
          <div className="stageHeader">
            <div>
              <p className="stageEyebrow">Step 2</p>
              <h2>Fill in your words</h2>
            </div>
            <div className="stageMeta">
              <span className="seedEchoLabel">Built from seed</span>
              <p>{generatedSeed || seed}</p>
            </div>
          </div>

          <div className="storySummaryCard">
            <p className="tiny">Story title</p>
            <p className="storySummaryTitle">{story.title}</p>
            <p className="tiny">
              {filledCount} of {(story.blanks ?? []).length} word prompts filled in
            </p>
          </div>

          {generationIssue && (
            <div className="status warn qualityBanner noPrint">
              <strong>Generation note:</strong> {generationIssue}
            </div>
          )}
          {renderGenerationDiagnostics()}
          <div className="fillsToolbar noPrint">
            <button className="secondary" onClick={autoFillFunnyWords}>
              Fill In Words For Me
            </button>
          </div>
          <div className="fieldsGrid noPrint">
            {(story.blanks ?? []).map((blank: BlankToken, idx: number) => {
              const err = fieldErrors[blank.id];
              const label = prettyTokenLabel(blank, idx);
              return (
                <div className={`field ${err ? "bad" : ""}`} key={blank.id}>
                  <label htmlFor={blank.id}>{label}</label>
                  <input
                    id={blank.id}
                    type="text"
                    value={fills[blank.id] ?? ""}
                    onChange={(e) => updateField(blank.id, e.target.value)}
                    placeholder={placeholderForLabel(label)}
                  />
                  {err && <div className="errText">{err}</div>}
                </div>
              );
            })}
          </div>

          <div className="stageActions noPrint">
            <button className="ghost" onClick={() => setActiveStep("compose")}>
              Back To Seed
            </button>
            <div className="btnRow">
              <button className="ghost subtleAction" onClick={() => window.print()}>
                Print Blank Worksheet
              </button>
              <button onClick={onRevealStory} disabled={storyIsStale}>
                Reveal Story
              </button>
            </div>
          </div>

          {storyIsStale && (
            <div className="hiddenStoryNote noPrint">
              Your seed changed after generation. Go back and regenerate to keep the story aligned.
            </div>
          )}

          <div className="printOnly">
            <h3>{story.title}</h3>
            <div className="storyOut">{story.storyTemplate}</div>
          </div>
        </div>
      </section>
    );
  }

  function renderRevealStep() {
    if (!story || !reveal) return null;
    const generationIssue = summarizeGenerationIssue(story);

    return (
      <section className="stagePage">
        <div className="stagePanel">
          <div className="stageHeader">
            <div>
              <p className="stageEyebrow">Step 3</p>
              <h2>Your story reveal</h2>
            </div>
            <div className="stageMeta">
              <span className="seedEchoLabel">Original seed</span>
              <p>{generatedSeed || seed}</p>
            </div>
          </div>

          {reveal.moderationDecision === "BLOCK" ? (
            <div className="status block">{reveal.moderationReason}</div>
          ) : (
            <>
              {generationIssue && (
                <div className="status warn qualityBanner noPrint">
                  <strong>Generation note:</strong> {generationIssue}
                </div>
              )}
              {renderGenerationDiagnostics()}
              {renderRevealDiagnostics()}
              <div className="storyFrame">
                <h3>{story.title}</h3>
                <div className="storyOut">{renderHighlightedStory()}</div>
              </div>
              <div className="stageActions noPrint">
                <button className="ghost" onClick={() => setActiveStep("fills")}>
                  Back To Words
                </button>
                <div className="btnRow">
                  <button className="ghost subtleAction" onClick={() => window.print()}>
                    Print Story
                  </button>
                  <button onClick={onGenerateImage} disabled={loadingImage || storyIsStale}>
                    {loadingImage ? "Generating..." : "Generate Coloring Page"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </section>
    );
  }

  function renderImageStep() {
    if (!image) return null;

    return (
      <section className="stagePage">
        <div className="stagePanel">
          <div className="stageHeader">
            <div>
              <p className="stageEyebrow">Step 4</p>
              <h2>Coloring page</h2>
            </div>
            <div className="stageMeta">
              <span className="seedEchoLabel">Story seed</span>
              <p>{generatedSeed || seed}</p>
            </div>
          </div>

          {image.moderationDecision === "BLOCK" ? (
            <div className="status block">{image.moderationReason}</div>
          ) : (
            <>
              <div className="imageStageFrame">
                {image.imageBase64 && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt="Generated coloring page"
                    className="imgBox"
                    src={`data:image/png;base64,${image.imageBase64}`}
                  />
                )}
                {image.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt="Generated coloring page" className="imgBox" src={image.imageUrl} />
                )}
                <p className="tiny">Line-art only, kid-friendly, and ready to print.</p>
              </div>

              <div className="stageActions noPrint">
                <button className="ghost" onClick={() => setActiveStep("reveal")}>
                  Back To Story
                </button>
                <div className="btnRow">
                  <button className="ghost subtleAction" onClick={() => window.print()}>
                    Print Story + Coloring Page
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </section>
    );
  }

  function renderActiveStep() {
    if (loadingStage) return renderLoadingStep();
    if (activeStep === "compose") return renderComposeStep();
    if (activeStep === "fills") return renderFillsStep();
    if (activeStep === "reveal") return renderRevealStep();
    if (activeStep === "image") return renderImageStep();
    return renderComposeStep();
  }

  return (
    <main>
      <div className="appShell">
        {activeStep !== "compose" && renderStepNavigation()}
        {renderActiveStep()}
      </div>
      <footer className="siteFooter">Copyright 2026 Wesley J Heilala</footer>
    </main>
  );
}
