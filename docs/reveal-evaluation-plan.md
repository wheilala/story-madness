# Reveal Evaluation Plan

## Goal

Catch the difference between:

- technically valid substitutions
- substitutions a human editor would actually keep

This is a second-order evaluation loop that runs **after** story generation, blank extraction, and reveal rendering.

## Proposed Pipeline

1. Generate an authored scaffold.
2. Extract blanks locally.
3. Auto-fill blanks from curated word banks.
4. Render the final reveal.
5. Evaluate the reveal with:
   - deterministic checks first
   - model judgment second

## Deterministic Checks

Use cheap local signals to reject obvious issues before asking a model:

- unresolved placeholder count
- `a/an` mismatches after reveal
- object-heavy blank share
- noun-family blank share
- repeated auto-fill values
- suspicious blank-label balance

These checks are not trying to decide whether the story is funny. They only identify likely mechanical or selection-quality problems.

## Model Judge

The model compares:

- seed
- title
- blank list and chosen fills
- original blanked scaffold
- final revealed story
- deterministic evaluator notes

The model returns:

- `coherenceScore` (1-5)
- `humorFitScore` (1-5)
- `naturalnessScore` (1-5)
- `semanticDriftScore` (1-5)
- `pass`
- `confidence`
- `summary`
- `flaggedSubstitutions`

## Why This Helps

The current harness tells us when the pipeline fails structurally. This loop tells us when the final reveal is legal but awkward.

That lets us improve:

- candidate selection
- blank-type balance
- phrase-merging rules
- future "Fill in words for me" behavior

## Human-Like Rejection Signals

The model judge should specifically identify substitutions that feel:

- too generic
- too object-heavy
- grammatically legal but semantically muddy
- disruptive to the scaffold's scene logic
- less funny than the original scaffold framing

## Near-Term Usage

Use the evaluator on small seed batches with auto-filled stories to learn:

- which prompt types are over-selected
- which scaffold contexts are fragile
- which substitutions repeatedly drag down naturalness

This gives us a better target than blind rule tweaking.
