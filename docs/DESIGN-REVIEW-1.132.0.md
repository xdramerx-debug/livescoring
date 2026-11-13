# Design and structure review of 1.132.0

Date: 2026-11-13. Branch: `arena/d06bb845-livescoring`.

This is a fresh review of current HTML, shared styles and rendered layout fixtures, not a reuse of the previous audit. Scope: shared navigation, page headings, player/round search and filters, statistics information hierarchy and keyboard access. This is not a full role-by-role audit of production Firebase workflows.

## Findings and changes

| Finding in current code/layout | Change |
| --- | --- |
| Page heading already clears the fixed header, while the following main adds the header height again (including a base `!important` rule). | Give players, rounds, statistics and handicap pages a scoped content shell with a single 24px gap, 18px on phones. Do not modify active scoring or kiosk clearance. |
| Desktop More groups only Players while the other secondary links remain outside it. | Put Players, Tournaments, Statistics and Handicaps in the same static popover across pages; mark the selected secondary link with `aria-current`. Preserve primary Home/Round/All rounds links. |
| Centered headings and widely separated content weaken alignment. | Align shared page headings to the content edge; standardize icon size, title gap and subtitle line length/leading. |
| Player and round filters still say Search & filters after search was moved outside them. | Rename to Filters & sorting in both language sources; retain a visible labeled search and add a mobile search keyboard hint. |
| Filter summary has a 28px target and field layouts vary on narrow screens. | Increase summary target to 44px, separate expanded controls with spacing and a divider, stack fields in one column on phones. |
| Light-theme placeholders combine a translucent color with reduced opacity; labels have opaque white backgrounds. | Use the theme muted token at full opacity for form hints; clear label backgrounds. Keep focus outlines. |
| Statistics filter panel contains methodology for player rankings, unrelated to changing the sample. | Move methodology next to the Top players section, keeping its caveats intact. Give sample selection and refresh a compact labeled toolbar. |
| Several secondary pages lack a skip link/main focus target. | Add static skip links and focusable main targets, reusing existing translated labels and focus behavior. |

## Validation

- 100/100 test suites passed.
- ESLint with zero warnings; global/listener checks; bundle parity; asset hash freshness; Vite and public hosting artifact builds passed.
- Layout fixture gate: 10 routes × 320/390/768/1280px, dark and light themes, no horizontal overflow.
- Added geometry assertion for the heading/content gap, secondary navigation grouping assertions, Enter/Escape and focus-return checks for the desktop popover.
- Existing one-tap score entry checks still pass. Calculations, round records, write APIs and Firebase rules were not changed.

Browser checks block external services and do not load real user records. They are evidence for fixture layout and isolated interactions, not production permissions, network delivery or on-course usability. Alternate admin design presets were not exhaustively visually checked.

## Release state

Release 1.133.0 prepared after explicit user authorization to deploy. Site labels, package/lock versions and service-worker cache are updated together. Production deployment is tracked through the release PR and Deploy workflow.
