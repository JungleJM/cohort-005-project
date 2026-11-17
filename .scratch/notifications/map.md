# Map: Notifications for Cadence

## Destination

A full spec (PRD) for **Notifications** in Cadence: triggers, recipients, channel and frequency per trigger, delivery approach, preferences, and the in-app UI — ready to slice into build tickets.

## Notes

- Domain: Cadence (React Router SSR, SQLite via Drizzle, Postmark email in `app/lib/mailer.server.ts` with a `.outbox/` fallback, `sonner` toasts). Use `GLOSSARY.md`; **Notification** is defined there and is distinct from a toast.
- Skills every session should consult: `grilling`, `domain-modeling`.
- Standing rule: notify only on things that **already exist** in Cadence. No new course features get specced here.
- Both channels in view: in-app (while logged in) and email.
- Delivery is through **Knock**, behind a Cadence-side seam (ADR 0013).
- User leaning: comment Notifications in-app, with email capped at once a day.
- Tracker: local markdown (the `gh` token can't write issues). Research findings live on unmerged `research/*` branches on origin.

## Decisions so far

- [Knock vs alternatives for Cadence's Notifications](issues/01-knock-vs-alternatives.md): own SQLite feed + Postmark fits best (SSR, offline tests, strict daily cap); if a vendor, Knock; Novu fallback; MagicBell ruled out.
- [Which existing Cadence events could trigger a Notification?](issues/02-notifiable-events.md): 15 candidate events (comments, Seat claims, Purchases, Refund Requests, admin edits, ratings); today only 3 Refund Request emails exist, no purchase emails.
- [Knock or our own DB + Postmark?](issues/03-knock-or-own-db.md): Knock, chosen for learning against the research; behind a seam with an offline fake; daily comment-email cap must be strict (ADR 0013).
- [How does Knock send at most one comment email per person per day?](issues/08-knock-daily-comment-email.md): it can't on its own; per-comment in-app workflow + daily Schedule-driven digest workflow whose fetch step hits a Cadence route that claims (user, day) in SQLite — at most one, not exactly one.

## Not yet specified

- **Preferences and opt-outs**: per-kind email/in-app toggles; unsubscribe for non-transactional email. Knock offers PreferenceSets and a hosted preference page; unsubscribe headers only for "commercial" workflows.
- **Existing Refund Request emails**: fold them into Notifications, or leave them as-is beside the new system.
- **Read/unread and retention**: what marks a Notification seen, and how long they're kept.
- **Identity mapping**: how Cadence users are identified to Knock and kept in sync, and where signed user tokens are minted.
- **Local dev and tests**: what the offline fake behind the Knock seam records, and whether local dev uses Knock's Development environment or the fake.

## Out of scope

- "New lesson" Notifications: lessons have no publish step today. Revisit once a lesson-publishing feature exists.
- Mobile/OS push, SMS, Slack.
- Quiz-result Notifications (machine-scored instantly; the Student already sees the result).
- Any new course feature (assignments, grading, group work).
