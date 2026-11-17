# How does Knock send at most one comment email per person per day?

Type: research
Status: resolved

## Question

Cadence needs a **strict** cap of one comment email per person per day, sent through Knock (ADR 0013). Knock's batch function can double-send, so it doesn't meet that cap on its own. Knock recommends Schedules for recurring digests. How would a Schedule (or anything else Knock offers) collect a day's comment Notifications into one email per person? What happens on a day with nothing to send? Where do the guarantees fall short? Cite Knock's docs.

## Answer

Findings: branch `research/knock-daily-comment-email` on origin, file `docs/research/knock-daily-comment-email.md` (unmerged, cited throughout).

- **Knock can't guarantee the cap.** None of its features (Schedules, batch, throttle) is documented to send at most one per day. Knock's batch docs themselves advise treating your own system as the source of truth for digests. So **Cadence's SQLite enforces the cap, and Knock still sends the email** (ADR 0013 stands).
- **Recommended design:**
  1. A `comment` workflow, triggered for each comment, with only an in-app feed step. Every comment appears in the feed straight away.
  2. A `comment-digest` workflow: a signed fetch step to a Cadence route, then an email step that only sends when `data.items not_empty`.
  3. One daily Knock Schedule per user, in the user's timezone. Schedules can only be created through the API, and creating one isn't idempotent, so Cadence stores each schedule's ID.
  4. The Cadence route claims `(user, local date)` in a uniquely indexed table inside one transaction. If that day is already claimed, it returns no items.
  5. Optionally, a Knock throttle of 1 per ~20h as a backstop.
- **Remaining gaps:** this guarantees at most one email a day, not exactly one. If the fetch times out or the email step fails after the claim, that day's email is lost, though the comments stay in the feed. Cadence also has to compute the user's day in the same timezone Knock uses. Empty runs cost nothing, because Knock bills per message sent.
- **Open product question**, handed to [Channel and frequency for each trigger](06-channel-and-frequency.md): should comments the person has already seen in the feed still go into the digest?
