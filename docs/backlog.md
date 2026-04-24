# Backlog

## Quick Fact Grab Revisit

- Revisit the seed fun-facts delighter as a best-effort sidecar instead of a guaranteed interstitial feature.
- Keep the current helper/route groundwork:
  - `lib/story-fun-facts.ts`
  - `lib/api/story-fun-facts.ts`
  - `app/api/story/fun-facts/route.ts`
- Next pass goals:
  - make facts reliably fast enough for the story interstitial without holding the main flow
  - show the facts only when they arrive naturally in time
  - avoid mocked content and avoid forcing stage delays
  - consider a smaller timeout budget and/or more aggressive caching
