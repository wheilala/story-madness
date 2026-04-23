# MadlibInc (Coloring-Page-Only)

Next.js full-stack app for kid-safe madlib generation, fill/reveal, printing, and coloring page image generation.

## Features

- Strict safety pipeline at seed, story, fill words, and image prompt stages.
- Three-step UX flow:
  - Seed input and story generation
  - Fill blanks + reveal story + print
  - Generate coloring page + print combined output
- Server-only OpenAI key usage.
- Optional Supabase logging for run and moderation metadata.

## Quick Start

1. Install dependencies:
   - `npm install`
2. Copy env values:
   - `copy .env.example .env.local` (Windows)
3. Add your API keys in `.env.local`.
4. Run app:
   - `npm run dev`
5. Run tests:
   - `npm test`

## Required APIs

- OpenAI:
  - `OPENAI_API_KEY`
  - `OPENAI_STORY_MODEL` (default `gpt-4.1-mini`)
  - `OPENAI_IMAGE_MODEL` (default `gpt-image-1`)
- Supabase (optional):
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`

## Supabase Setup

Execute [`supabase/schema.sql`](C:\Users\wayne\Documents\MadlibInc\app-madlibinc\supabase\schema.sql) against your Supabase project.

## Notes

- No-login v1 with simple in-memory IP rate limiting.
- Minimal analytics persistence by default; raw fill text is not stored.
- Coloring page generation is enforced server-side (no style toggle).
