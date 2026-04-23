"use client";

import React, { useState } from "react";
import { BlankToken, ImageGenerateResponse, StoryGenerateResponse, StoryRevealResponse } from "@/lib/types";
import { hasDeterministicBlock } from "@/lib/safety/word-filter";

type UiStatus = { kind: "ok" | "warn" | "block"; text: string } | null;

const defaultSeed = "";
const sampleSeeds = [
  "A goalie slips on a wet soccer ball and starts a neighborhood safety club.",
  "Maya drops her giant ice cream at the park and invents a super-cleanup team.",
  "Two siblings crash their bike into a pile of leaves and decide to become crossing guards."
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

export default function HomePage() {
  const [runId] = useState<string>(() => createRunId());
  const [seed, setSeed] = useState(defaultSeed);
  const [generatedSeed, setGeneratedSeed] = useState<string>("");
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
  const storyIsStale = Boolean(story?.storyTemplate && generatedSeed.trim() !== seed.trim());

  function prettyTokenLabel(tokenId: string): string {
    if (!tokenId) return "Word";
    const normalized = tokenId.replace(/_\d+$/, "");
    const map: Record<string, string> = {
      NOUN: "Noun",
      PLURAL_NOUN: "Plural Noun",
      ADJ: "Adjective",
      ADJECTIVE: "Adjective",
      ADVERB: "Adverb",
      VERB: "Verb",
      VERB_ING: "Verb ending in -ing",
      VERB_PAST: "Past tense verb",
      NUMBER: "Number",
      NAME: "Name",
      PLACE: "Place",
      ANIMAL: "Animal",
      BODY_PART: "Body part",
      EXCLAMATION: "Exclamation",
      SOUND: "Sound word"
    };
    if (map[normalized]) return map[normalized];
    return normalized
      .split("_")
      .map((part) => part[0] + part.slice(1).toLowerCase())
      .join(" ");
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
        text: "Seed changed. Click Generate Story to refresh everything."
      });
      setReveal(null);
      setImage(null);
    }
  }

  function chooseSampleSeed(value: string) {
    setSeed(value);
    setSeedStatus({
      kind: "ok",
      text: "Sample added. Click Generate Story when you're ready."
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

  async function onGenerateStory() {
    if (!seed.trim()) return;
    if (hasDeterministicBlock(seed)) {
      setSeedStatus({ kind: "block", text: "That seed is blocked by the safety filter." });
      return;
    }

    setLoadingStory(true);
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
        return;
      }

      const storyResult = data as StoryGenerateResponse;
      if (storyResult.moderationDecision === "BLOCK") {
        setSeedStatus({ kind: "block", text: storyResult.moderationReason });
        return;
      }

      if (storyResult.moderationDecision === "REWRITE") {
        setSeedStatus({
          kind: "warn",
          text: "Seed was adjusted for safety. You can accept the rewrite below."
        });
        setRewriteSuggestion(storyResult.rewrittenSeed ?? null);
      } else {
        setSeedStatus({ kind: "ok", text: "Story generated. Fill in words to reveal it." });
      }

      const safeBlanks = (storyResult.blanks ?? []).filter(
        (blank): blank is BlankToken => Boolean(blank && typeof blank.id === "string" && blank.id.trim())
      );
      setStory({ ...storyResult, blanks: safeBlanks });
      setGeneratedSeed(seed.trim());
      const nextFills: Record<string, string> = {};
      for (const blank of safeBlanks) nextFills[blank.id] = "";
      setFills(nextFills);
      setFieldErrors({});
    } finally {
      setLoadingStory(false);
    }
  }

  async function onRevealStory() {
    if (!story?.storyTemplate) return;
    if (storyIsStale) {
      setSeedStatus({ kind: "warn", text: "Generate story again to match your latest seed." });
      return;
    }
    if (Object.values(fieldErrors).some(Boolean)) return;

    setLoadingReveal(true);
    try {
      const response = await fetch("/api/story/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, storyTemplate: story.storyTemplate, fills })
      });
      const data = (await response.json()) as StoryRevealResponse;
      setReveal(data);
    } finally {
      setLoadingReveal(false);
    }
  }

  async function onGenerateImage() {
    if (!story?.storyTemplate) return;
    if (storyIsStale) {
      setSeedStatus({ kind: "warn", text: "Generate story again before creating the coloring page." });
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
    } finally {
      setLoadingImage(false);
    }
  }

  function applyRewriteSuggestion() {
    if (!rewriteSuggestion) return;
    setSeed(rewriteSuggestion);
    setRewriteSuggestion(null);
    setSeedStatus({ kind: "ok", text: "Rewrite accepted. Click Generate Story." });
  }

  return (
    <main>
      <section className="hero">
        <div className="titleCard">
          <h1>Story Madness</h1>
          <p className="subtitle">Type a goofy seed, fill the blanks, reveal a wild story, then generate a coloring page.</p>
        </div>
        <div className="mascotCard">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="mascotImg" src="/graphics/razzle.jpeg" alt="Razzle the Story Monster" />
        </div>
      </section>

      <section className="panel">
        <h2>What will your story be about?  Start with a "seed"!</h2>
        <p className="tiny">Kid-safe seeds work best. Keep it funny and adventurous.</p>
        <textarea
          value={seed}
          onChange={(e) => onSeedChange(e.target.value)}
          placeholder="Example: A goalie slips on the ball and starts a safety club."
        />
        <div className="seedSamples">
          {sampleSeeds.map((sample) => (
            <button key={sample} className="sampleBtn" onClick={() => chooseSampleSeed(sample)}>
              Use Sample
            </button>
          ))}
        </div>
        <div className="btnRow">
          <button onClick={onGenerateStory} disabled={loadingStory || !seed.trim()}>
            {loadingStory ? "Creating Story..." : "Generate Story"}
          </button>
          <button
            className="ghost"
            onClick={() => {
              setSeed(defaultSeed);
              setSeedStatus(null);
              resetGeneratedState();
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
      </section>

      {story?.storyTemplate && (
        <section className="panel">
          <h2>Fill In Your Words</h2>
          <p className="ctaHint">Story title: {story.title}</p>
          <div className="fieldsGrid noPrint">
            {(story.blanks ?? []).map((blank: BlankToken) => {
              const err = fieldErrors[blank.id];
              return (
                <div className={`field ${err ? "bad" : ""}`} key={blank.id}>
                  <label htmlFor={blank.id}>{prettyTokenLabel(blank.id)}</label>
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
            <button onClick={onRevealStory} disabled={loadingReveal || storyIsStale}>
              {loadingReveal ? "Checking..." : "Reveal Story"}
            </button>
            <button className="secondary" onClick={() => window.print()}>
              Print Blank Worksheet
            </button>
          </div>
          {!reveal?.revealedStory && (
            <div className="hiddenStoryNote noPrint">
              Story stays hidden until you click <strong>Reveal Story</strong>.
            </div>
          )}
          <div className="printOnly">
            <h3>{story.title}</h3>
            <div className="storyOut">{story.storyTemplate}</div>
          </div>
        </section>
      )}

      {reveal && (
        <section className="panel">
          <h2>Your Story Reveal</h2>
          {reveal.moderationDecision === "BLOCK" ? (
            <div className="status block">{reveal.moderationReason}</div>
          ) : (
            <>
              <div className="storyOut">{reveal.revealedStory}</div>
              <div className="btnRow noPrint">
                <button className="secondary" onClick={() => window.print()}>
                  Print Story
                </button>
                <button onClick={onGenerateImage} disabled={loadingImage || storyIsStale}>
                  {loadingImage ? "Generating..." : "Generate Coloring Page"}
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {image && (
        <section className="panel">
          <h2>Coloring Page</h2>
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
              <p className="tiny">Line-art only, kid-friendly, no text/logos.</p>
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
