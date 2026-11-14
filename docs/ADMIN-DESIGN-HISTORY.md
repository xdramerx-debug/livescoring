# Admin design history: PR 1–187

## Access

Admin panel → Оформление → История PR · 1–187. The gallery is a new admin section inside the existing login-gated `admin-content`; no alternate login or permissions were added. It is read-only and does not change design settings or round records.

- 187 PR records, 374 JPEG screenshots (home and `scorer.html`).
- Search by exact PR number, title or commit; status, PR range (1–100 / 101–187) and screen filters; ascending/descending PR order.
- 12 PRs per page; screenshots load lazily, only after opening the archive.
- Native modal viewer, alternate screen, previous/next PR in the filtered list, original image and GitHub source links. Escape closes the viewer and returns focus.
- Images are mobile first-viewport captures at 430 × 1100 CSS pixels; they are not full-page or desktop screenshots.

## Provenance and limitations

Metadata was obtained with `gh api --paginate 'repos/xdramerx-debug/livescoring/pulls?state=all&sort=created&direction=asc&per_page=100'` (restricted to numbers 1–187). All numbers 1–187 are present. 184 PRs were merged; PRs 6, 12 and 16 were closed without merging. Merged PRs use `merge_commit_sha`; unmerged PRs use their latest head SHA. PR number order is not necessarily release chronology.

These are **reconstructions from the historical code**, not original production screenshots. `tools/capture-design-history.js` serves git blobs directly to an isolated Playwright context without checking out another branch or executing historical scripts on the host. It blocks external services, substitutes an in-memory Firebase fixture and freezes time at 2026-08-26 10:00 UTC. Names and scores are synthetic. Historical HTML, local CSS and images come from each PR commit. Historical database design settings are unavailable, so the gallery shows code defaults rather than proving the appearance of a specific production session.

External Google Fonts and Font Awesome CSS are substituted with the current local font/icon files. Missing historical icon glyphs can differ. The gallery explains these limitations. Unchanged UI between PRs is intentionally not restyled or deduplicated.

PR 48 contains an `Illegal return statement` in its historical JS and cannot initialize normally. Its screenshot uses the original static scorer markup, revealed and populated with basic demo fields; this fallback is flagged both on the card and inside the viewer. No historical source code was silently repaired. Other 186 PRs initialized without recorded browser runtime errors under this fixture.

Screenshot assets contain no production data. Like other images in this static Hosting application, they are publicly retrievable URLs, not access-controlled files. The gallery UI is within the admin panel. Do not add private screenshots or real player data to this archive.

## Files and regeneration

- `js/design-history-data.js`: fixed PR manifest, source SHAs, capture flags and warnings.
- `img/design-history/pr-N-home.jpg` and `pr-N-scoring.jpg`: 374 JPEGs, approximately 17 MiB total.
- `js/admin-design-history.js`, `css/design-history.css`: lazy viewer and scoped styling.
- `tools/capture-design-history.js`: deterministic capture process. Requires the manifest, git objects, npm dependencies and Chromium runtime libraries.

```sh
# If history is shallow, fetch the current branch's ancestry first.
git fetch --unshallow origin
# Fetch missing source SHA objects individually if needed (without switching branches).
npm ci --ignore-scripts
bash tools/build-stub-libs.sh # sandbox-only fallback if Chromium's native libraries are absent
CHROMIUM_EXTRA_LIBS="$PWD/tools/.browser-stub" node tools/capture-design-history.js
# Or regenerate specific PRs:
CHROMIUM_EXTRA_LIBS="$PWD/tools/.browser-stub" node tools/capture-design-history.js 1,48,187
npm run assets
```

Screenshots and viewer data are not in player service-worker precache. `rev-assets.js` now ignores image subdirectories when collecting top-level icon extras, avoiding an invalid directory cache request. The normal public artifact builder copies the archive recursively for Hosting.

## Validation

`node tools/test-design-history.js` checks all 187 entries and 374 JPEGs, lazy admin wiring, search, filters, pagination, modal navigation, focus restoration and safe text rendering of GitHub titles. `CHROMIUM_EXTRA_LIBS=... node tools/check-design-history.js` checks 320/390/768/1280px layouts, actual image decoding, light theme overflow, native modal/Escape behavior and focus. These are fixture tests, not a live Firebase authorization audit.

## Release 1.134.0

User authorized production deployment. Site version, package/lock and service-worker cache updated together. Release checks passed: 101/101 suites; syntax and zero-warning lint; globals/listeners/fonts/bundle and asset freshness; production builds; gallery browser checks at 320/390/768/1280px. Deployment is tracked through the release PR and its Deploy workflow run.


## Extension to PR 101–187

Added 87 merged PRs (174 screenshots), preserving the original PR records and scorer images. The range selector quickly switches between all PRs, 1–100 and 101–187; it composes with existing title/number/commit search, status, screen and sort controls.

During verification, the old capture URL was found to append round parameters to index.html. Some historical home pages interpreted those parameters as a round deep link and redirected to scoring. The generator now appends round parameters only to scorer.html. All 187 home screenshots were regenerated with a clean index.html URL; capture verifies the final path and visible hero before saving. The manifest records `homeRoute: "index.html"`. Missing git trees now fail before capture rather than silently returning blank pages.

To recapture only home pages (preserving scorer warnings and images):

```sh
CHROMIUM_EXTRA_LIBS="$PWD/tools/.browser-stub" node tools/capture-design-history.js $(seq -s, 1 187) --home
```

Release 1.135.0: user authorized production deployment of the extension. Site/package/lock versions and service-worker cache are updated together; deployment is tracked by the release PR and Deploy workflow.
