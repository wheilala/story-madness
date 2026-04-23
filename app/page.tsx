"use client";

import React, { useMemo, useState } from "react";
import { BlankToken, ImageGenerateResponse, StoryGenerateResponse, StoryRevealResponse } from "@/lib/types";
import { hasDeterministicBlock } from "@/lib/safety/word-filter";

type UiStatus = { kind: "ok" | "warn" | "block"; text: string } | null;

const defaultSeed =
  "John trips over a twig and gets very angry and then he decides to become a firefighter to make sure this never happens to other people again.";

export default function HomePage() {
  const [runId] = useState<string>(() => crypto.randomUUID());
  const [seed, setSeed] = useState(defaultSeed);
  const [seedStatus, setSeedStatus] = useState<UiStatus>(null);
  const [loadingStory, setLoadingStory] = useState(false);
  const [story, setStory] = useState<StoryGenerateResponse | null>(null);
  const [fills, setFills] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [reveal, setReveal] = useState<StoryRevealResponse | null>(null);
  const [loadingReveal, setLoadingReveal] = useState(false);
  const [loadingImage, setLoadingImage] = useState(false);
  const [image, setImage] = useState<ImageGenerateResponse | null>(null);
  const [rewriteSuggestion, setRewriteSuggestion] = useState<string | null>(null);

  const activeStep = useMemo(() => {
    if (image?.imageBase64 || image?.imageUrl) return 4;
    if (reveal?.revealedStory) return 3;
    if (story?.storyTemplate) return 2;
    return 1;
  }, [image, reveal, story]);

  function updateField(id: string, value: string) {
    setFills((prev) => ({ ...prev, [id]: value }));
    if (value.trim().length === 0) {
      setFieldErrors((prev) => ({ ...prev, [id]: "" }));
      return;
    }
    if (hasDeterministicBlock(value)) {
      setFieldErrors((prev) => ({
        ...prev,
        [id]: "Choose a different word (kid-safe words only)."
      }));
    } else {
      setFieldErrors((prev) => ({ ...prev, [id]: "" }));
    }
  }

  async function onGenerateStory() {
    if (!seed.trim()) return;
    if (hasDeterministicBlock(seed)) {
      setSeedStatus({ kind: "block", text: "Seed blocked by local safety filter." });
      return;
    }

    setLoadingStory(true);
    setSeedStatus(null);
    setReveal(null);
    setImage(null);
    try {
      const response = await fetch("/api/story/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seed, runId })
      });
      const data = (await response.json()) as StoryGenerateResponse | { error: string };

      if (!response.ok) {
        setSeedStatus({ kind: "block", text: "Story generation failed. Please try again." });
        return;
      }

      const storyResult = data as StoryGenerateResponse;
      if (storyResult.moderationDecision === "BLOCK") {
        setSeedStatus({ kind: "block", text: storyResult.moderationReason });
        setStory(null);
        return;
      }

      if (storyResult.moderationDecision === "REWRITE") {
        setSeedStatus({
          kind: "warn",
          text: "Seed was adjusted for safety. Review the rewrite before continuing."
        });
        setRewriteSuggestion(storyResult.rewrittenSeed ?? null);
      } else {
        setSeedStatus({ kind: "ok", text: "Seed passed moderation and story is ready." });
        setRewriteSuggestion(null);
      }

      setStory(storyResult);
      const nextFills: Record<string, string> = {};
      for (const blank of storyResult.blanks) {
        nextFills[blank.id] = "";
      }
      setFills(nextFills);
      setFieldErrors({});
    } finally {
      setLoadingStory(false);
    }
  }

  async function onRevealStory() {
    if (!story?.storyTemplate) return;
    const hasLocalError = Object.values(fieldErrors).some(Boolean);
    if (hasLocalError) return;

    setLoadingReveal(true);
    try {
      const response = await fetch("/api/story/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId,
          storyTemplate: story.storyTemplate,
          fills
        })
      });
      const data = (await response.json()) as StoryRevealResponse;
      setReveal(data);
    } finally {
      setLoadingReveal(false);
    }
  }

  async function onGenerateImage() {
    if (!story?.storyTemplate) return;
    setLoadingImage(true);
    try {
      const response = await fetch("/api/image/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId,
          seed,
          storyTemplate: story.storyTemplate
        })
      });
      const data = (await response.json()) as ImageGenerateResponse;
      setImage(data);
    } finally {
      setLoadingImage(false);
    }
  }

  function printableStory() {
    if (reveal?.revealedStory) return reveal.revealedStory;
    return story?.storyTemplate ?? "";
  }

  function applyRewriteSuggestion() {
    if (!rewriteSuggestion) return;
    setSeed(rewriteSuggestion);
    setRewriteSuggestion(null);
    setSeedStatus({ kind: "ok", text: "Rewrite accepted. Generate story again." });
  }

  return (
    <main>
      <div className="panel noPrint">
        <h1>MadlibInc</h1>
        <p>Kid-safe story + coloring page flow with strict moderation.</p>
        <div className="progress">
          <span className={`chip ${activeStep >= 1 ? "active" : ""}`}>1. Seed</span>
          <span className={`chip ${activeStep >= 2 ? "active" : ""}`}>2. Fill</span>
          <span className={`chip ${activeStep >= 3 ? "active" : ""}`}>3. Reveal/Print</span>
          <span className={`chip ${activeStep >= 4 ? "active" : ""}`}>4. Coloring Page</span>
        </div>
      </div>

      <section className="panel">
        <h2>Step 1: Seed Input</h2>
        <textarea
          value={seed}
          onChange={(e) => setSeed(e.target.value)}
          placeholder="Enter your story seed..."
        />
        <div className="btnRow noPrint">
          <button onClick={onGenerateStory} disabled={loadingStory || !seed.trim()}>
            {loadingStory ? "Generating..." : "Generate Story"}
          </button>
          <button
            className="secondary"
            onClick={() => {
              setSeed(defaultSeed);
              setStory(null);
              setReveal(null);
              setImage(null);
              setSeedStatus(null);
              setRewriteSuggestion(null);
            }}
          >
            Reset
          </button>
        </div>
        {seedStatus && <div className={`status ${seedStatus.kind}`}>{seedStatus.text}</div>}
        {rewriteSuggestion && (
          <div className="status warn noPrint">
            <div>Suggested safer rewrite:</div>
            <pre className="storyOut">{rewriteSuggestion}</pre>
            <div className="btnRow">
              <button onClick={applyRewriteSuggestion}>Use Rewrite</button>
            </div>
          </div>
        )}
      </section>

      {story?.storyTemplate && (
        <section className="panel">
          <h2>Step 2: Fill In The Blanks</h2>
          <p>
            <strong>{story.title}</strong>
          </p>
          <div className="fieldsGrid noPrint">
            {story.blanks.map((blank: BlankToken) => {
              const err = fieldErrors[blank.id];
              return (
                <div className={`field ${err ? "bad" : ""}`} key={blank.id}>
                  <label htmlFor={blank.id}>
                    {blank.id} ({blank.label})
                  </label>
                  <input
                    id={blank.id}
                    type="text"
                    value={fills[blank.id] ?? ""}
                    onChange={(e) => updateField(blank.id, e.target.value)}
                  />
                  {err && <div className="errText">{err}</div>}
                </div>
              );
            })}
          </div>
          <div className="btnRow noPrint">
            <button onClick={onRevealStory} disabled={loadingReveal}>
              {loadingReveal ? "Checking..." : "Reveal Story"}
            </button>
            <button className="secondary" onClick={() => window.print()}>
              Print Blank Worksheet
            </button>
          </div>
          {!reveal?.revealedStory && (
            <div className="storyOut">{story.storyTemplate}</div>
          )}
        </section>
      )}

      {reveal && (
        <section className="panel">
          <h2>Step 3: Revealed Story</h2>
          {reveal.moderationDecision === "BLOCK" ? (
            <div className="status block">{reveal.moderationReason}</div>
          ) : (
            <>
              <div className="storyOut">{printableStory()}</div>
              <div className="btnRow noPrint">
                <button className="secondary" onClick={() => window.print()}>
                  Print Revealed Story
                </button>
                <button onClick={onGenerateImage} disabled={loadingImage}>
                  {loadingImage ? "Generating..." : "Generate Coloring Page"}
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {image && (
        <section className="panel">
          <h2>Step 4: Coloring Page</h2>
          {image.moderationDecision === "BLOCK" ? (
            <div className="status block">{image.moderationReason}</div>
          ) : (
            <>
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
              <p>Prompt policy: black-and-white line art only.</p>
              <div className="btnRow noPrint">
                <button className="secondary" onClick={() => window.print()}>
                  Print Story + Coloring Page
                </button>
              </div>
            </>
          )}
        </section>
      )}
    </main>
  );
}
