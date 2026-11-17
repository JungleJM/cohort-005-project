# Knock or our own DB + Postmark?

Type: grilling
Status: resolved

## Question

Given the findings in [Knock vs alternatives](01-knock-vs-alternatives.md), does Cadence deliver Notifications through Knock (the user's original lean) or through its own SQLite feed plus the existing Postmark email? Weigh SSR, offline tests, the strict once-a-day email cap, build effort, cost, and lock-in. Likely ADR-worthy.

## Answer

**Knock.** Chosen deliberately for learning (the course exercise asks for it), against the research's build-our-own recommendation. Recorded as [ADR 0013](../../../docs/adr/0013-deliver-notifications-through-knock.md).

- Knock owns the in-app feed and sends email through Cadence's existing Postmark account.
- Cadence calls Knock through one function that sends a Notification, mirroring `MailTransport`. Tests use a fake, so they stay offline.
- Notifications showing up on the next navigation would have been enough. Knock's socket updates arrive live, which is more than we need.
- It's acceptable for the bell's unread count to load in the browser after the page, so it isn't in the server-rendered page. The feed prototype will test whether that's OK.
- The once-a-day cap on comment emails must be **strict**. Knock's batching can double-send, so the mechanism goes to the research ticket [How does Knock send at most one comment email per person per day?](08-knock-daily-comment-email.md).
