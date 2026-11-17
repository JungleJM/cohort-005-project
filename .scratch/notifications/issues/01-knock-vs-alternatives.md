# Knock vs alternatives for Cadence's Notifications

Type: research
Status: resolved

## Question

Which third-party service should deliver Cadence's Notifications (in-app feed + email)? Compare Knock (the user's lean) with Novu, Courier, MagicBell, and the baseline of our own SQLite feed + existing Postmark email.

## Answer

Findings: branch `research/knock-vs-alternatives` on origin, file `docs/research/knock-vs-alternatives.md` (unmerged, cited throughout).

- **Recommendation: own SQLite feed + Postmark.** Vendor feeds are client-side widgets with no documented SSR; no vendor has an offline mode (breaks the `.outbox/` testing pattern); Knock's own docs say batching can double-send, so a strict once-a-day email cap is easier with our own timestamp. Cost: we build the feed UI, preferences, signed unsubscribe links, and the daily job.
- **If a vendor: Knock.** Sends via Postmark, best React feed, batching/preferences on the free tier (10k msgs/mo; paid from $250/mo). Adds signed user tokens, user sync, and a test wrapper.
- Novu is the open-source/cheap fallback; Courier's digests may be Enterprise-only; MagicBell ruled out (no Postmark, no documented digest).
- Unverified: vendor SSR support, exact unsubscribe headers, Courier plan details, Novu seen/read states.
