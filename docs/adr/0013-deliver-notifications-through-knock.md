# Deliver Notifications through Knock

Cadence delivers every Notification, in-app and email, through Knock (knock.app). The reason is learning: the course exercise asks for Knock, and we want to try a notification service. The research recommended the opposite, which was to keep the feed in our own SQLite file and keep sending email through Postmark. Knock still sends email through our Postmark account. Cadence code reaches Knock through one function that sends a Notification, the way `MailTransport` wraps Postmark. Tests use a fake behind that function and never touch the network.

## Considered Options

- **Own SQLite feed + Postmark.** This was the research recommendation. Pages could show Notifications when they are first rendered on the server, tests would stay offline without extra work, a daily email cap could be enforced exactly, and there would be no vendor lock-in. We rejected it because the goal is to learn Knock, not to pick the cheapest build.
- **Novu, Courier, MagicBell.** Novu is the open-source fallback. Courier's digests may be Enterprise-only. MagicBell has no Postmark integration. Findings are on branch `research/knock-vs-alternatives`.

## Consequences

- The bell's unread count isn't in the server-rendered page. It appears once Knock's client loads in the browser.
- Knock's batching can occasionally send two emails where we wanted one, so the strict once-a-day comment email has to be built another way.
- Users must be identified to Knock, so Cadence needs signed user tokens and a way to keep its users in sync with Knock.
- Templates, preferences and Notification history live in Knock. Moving off Knock later means migrating them.
