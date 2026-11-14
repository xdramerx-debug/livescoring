# Visual restoration to PR #164

Reference: PR #164, merged 2026-10-28, commit `f5cff893bf64eceea3f1230bee03d0ace2b89580` (site version 1.119.0).

## Scope

Restore the appearance from that revision without reverting current application code, calculations, round data, offline queue, permissions, delivery status or admin tools. Release 1.136.0 was authorized by the user; site/package/lock versions and service-worker cache are updated together.

## Implementation

- `css/pr164.css` is the exact, unmodified `css/style.css` from the PR164 merge. SHA-256: `6002ea98ab85216d3299a34b2f8ef21b1e7a80ce2a4470d9ad486719c737475b`.
- All 14 shared-theme HTML pages load that snapshot after their existing styles, followed by `pr164-adapter.css` for newer controls. New theme-v2/product-ux/clarity styling is subordinated through a compatibility cascade layer. Functional hiding remains important; shared colors, type, gradients, cards and scoring surfaces come from the original stylesheet.
- Direct navigation links and visible footer version are restored. The newer mobile bottom bar is visually suppressed; the existing header/drawer navigation remains available.
- Home restores the full-height hero, large logo, two actions, active-round and tournament placement, course map before live cards, and visible course reference section.
- Score entry defaults to the old minus/plus view on a fresh installation. Explicitly saved pad preference is respected; the 1–15 pad, undo, large numbers, save status and other newer functions remain available. Official-call actions are visible as before.
- The standalone QR print document already retains the PR164 page styling; its print layout and newer print selector are preserved rather than applying unrelated site styles to printable cards.
- Local fonts and icons remain local for offline functionality. No historical Firebase design settings have been guessed or written. Existing optional admin/user design preferences remain functional, as they were in PR164.

Newer controls and pages that did not exist in the reference retain their functionality and adopt the original card/color vocabulary; a historical pixel-for-pixel screenshot cannot exist for those new controls.

## Validation

- Immutable stylesheet hash and all shared-page links checked in `test-pr164-style.js`.
- `check-pr164-visual.js` compares computed hero, title, card, button, input, score and hole properties against the reference stylesheet on all shared-theme pages at 390/1280px in dark and light modes.
- Existing scoring, math, save/queue and admin regression tests are retained. Visual assertions expecting the superseded compact hero/default number pad have been updated to the requested historical presentation.
- Tests use isolated fixtures, not real production Firebase data or on-course devices. Production deployment is tracked through the release PR and its Deploy workflow.
