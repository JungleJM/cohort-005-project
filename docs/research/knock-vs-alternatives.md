# Knock vs alternatives for Cadence's Notifications

Research date: 2026-11-16. Sources were read on that date. Pricing and plan limits change often, so check them again before signing up.

**Question.** Which third-party service, if any, should Cadence use to deliver a **Notification** (GLOSSARY.md: "A message telling one person that something on Cadence concerns them, shown in the app and/or sent by email. It is kept until they've seen it.")? Cadence needs an in-app feed while the user is logged in, plus email. Comment emails must be capped at one per day.

**Options compared:** Knock (the user's leaning), Novu, Courier, MagicBell, and a baseline with no notification service: a Drizzle/SQLite table for the feed, with email still sent by the existing Postmark transport in `app/lib/mailer.server.ts`.

**Cadence constraints that matter here:**
- Pages are server-rendered by React Router v8 on React 19.
- SQLite is accessed through Drizzle (ADR 0006).
- Postmark sends email, and messages fall back to `.outbox/` when no token is set. Tests depend on that fallback, so tests never touch the network.
- The UI is built with shadcn and Tailwind.

---

## Summary table

| | Knock | Novu | Courier | MagicBell | Baseline (SQLite + Postmark) |
|---|---|---|---|---|---|
| Prebuilt React feed | Yes (`NotificationFeedPopover`, `NotificationFeed`, `NotificationIconButton`) | Yes (`<Inbox />` with Bell, Notifications, Preferences) | Yes (`<CourierInbox />`, v9) | Yes (`FloatingInbox`, `Inbox`) | No. Build it with shadcn |
| Headless hooks | Yes | Yes | Partial (`useCourier()` documented) | Not documented | Not applicable (loaders and actions) |
| Realtime | Yes (socket) | Yes (WS service) | Yes (transport not stated) | Not documented | No. Only on navigation or revalidation, unless we add SSE or polling |
| SSR fit | Client-only components. No SSR guidance found | No SSR guidance found | No SSR guidance found | No SSR guidance found | Native: the feed renders in the loader |
| Seen / read / archived | Seen and read (seen when the popover opens); archive via the hooks' options | Unread count documented; other states not verified | Read, opened, archived | Read/unread only documented | Whatever we model |
| Sends through Postmark | Yes, first-class | Yes, first-class | Yes, first-class | **No Postmark integration.** SMTP only (unverified with Postmark) | Yes (already does) |
| Daily cap for comment email | Batch with daily window rule, or Schedules for recurring digests | Digest step with daily schedule (max window 1 day on Free) | Digest automations. Pricing page lists "digest and batching" under Enterprise (conflict, see below) | Not documented | Build it: a cron job plus a `last_digest_sent_at` column |
| Preferences UI | Yes, plus a hosted preference page | Yes (Preferences component) | Yes, plus a hosted preference page | Yes (`UserPreferences`) | Build it |
| Unsubscribe | 1-click unsubscribe for **commercial** messages | None by default. Build your own link | Built into topics, with optional unsubscribe headers | Not documented | Build it. Postmark adds headers only on broadcast streams |
| Free tier | 10k messages/mo | 10k workflow runs/mo, 5 workflows | 10k sends/mo | 1k deliveries/mo | Postmark cost only |
| First paid tier | Starter $250/mo (50k) | Pro from $30/mo (30k) | $0.005/send pay-as-you-go | Startup $249/mo (50k) | — |
| Self-host / OSS | No (SDKs MIT, backend hosted) | Yes. MIT core plus commercial `enterprise/`; heavy stack | No | No | Fully ours |

---

## Knock

**In-app feed**
- Package `@knocklabs/react` provides `NotificationFeedPopover`, `NotificationFeed`, `NotificationIconButton`, and a "full set of React hooks" for headless UI. `@knocklabs/client` is the low-level JS SDK. Source: https://docs.knock.app/in-app-ui/react/overview
- **Realtime:** the feed is real-time over a socket. `auto_manage_socket_connection` drops the socket in inactive tabs. Source: https://docs.knock.app/in-app-ui/react/feed
- **State:** by default, every item is marked **seen** when the popover opens. Override `onOpen` to call `feedClient.markAsRead(...)`. `badgeCountType="unread"` makes the badge count unread items instead. Source: https://docs.knock.app/in-app-ui/react/feed
- Knock's own Next.js guides show a `useNotifications` hook with an option to include archived items. Source: https://knock.app/blog/how-to-build-a-custom-inbox-with-nextjs
- **Auth:** `KnockProvider` takes the public API key and `user.id`. Use a signed `userToken` with "enhanced security mode"; without it, a feed is open to anyone who has the feed ID. Source: https://docs.knock.app/in-app-ui/react/feed
- **SSR:** **Not verified.** The docs give no SSR or React Router guidance. The provider is a client-side React tree that opens a socket. In Cadence the feed would hydrate on the client, so the server-rendered HTML would not include notifications or the unread count unless we also fetch them server-side with the Node SDK.

**Email**
- Postmark is a first-class provider. It needs a server API key and a From address, and uses the default `outbound` stream unless overridden with `{"MessageStream": ...}`. Delivery and bounce webhooks are optional. **Cadence would keep Postmark**, but email would be sent by Knock and no longer by `mailer.server.ts`. Source: https://docs.knock.app/integrations/email/postmark
- Templates are written in Knock's dashboard with Liquid, and wrapped in email layouts.

**Batching and daily cap**
- The batch function supports fixed, dynamic (including window rules with a daily or weekly close time in the recipient's timezone), relative, and sliding windows. It also supports a batch key and max activities (2–1000). Source: https://docs.knock.app/designing-workflows/batch-function
- Caveat from the same page: batch "isn't well-suited for powering regular daily or weekly digests". A new workflow version can also "close two batches around the same time and send two notifications". So "at most once a day" is close, but **not a hard guarantee**.
- For recurring digests, Knock recommends Schedules (`POST /v1/schedules` with `repeats`, timezone-aware, created via the API only). Sources: https://docs.knock.app/guides/building-recurring-digests and https://docs.knock.app/concepts/schedules

**Preferences and unsubscribe**
- Users get a `PreferenceSet` with booleans by category, channel type, channel, and workflow. Unset values default to true. Environment and tenant defaults are supported. Source: https://docs.knock.app/preferences/overview
- A hosted preference page is reached through a signed URL. Source: https://docs.knock.app/preferences/overview
- One-click unsubscribe headers and a footer link are added automatically, but **only for workflows marked "commercial"**. Clicking one sets `commercial_subscribed=false`. Comment Notifications are transactional, so Cadence would add its own unsubscribe link pointing at the hosted preference page. Source: https://docs.knock.app/preferences/commercial-unsubscribe

**Identity**
- Users must be identified before they are notified, either through the identify endpoint or inline on trigger. `id` is required, immutable, up to 256 characters, and must not contain `/` or `#`. Knock recommends using your own primary key. `email` is needed for the email channel. Cadence would have to keep users in sync with Knock. Source: https://docs.knock.app/concepts/users

**Local dev and testing**
- Knock has separate Development and Production environments, unlimited on all plans. Source: https://knock.app/pricing
- Workflow test runner options: `settings.sandbox_mode` (messages are generated but not delivered) and `settings.skip_delay` on API triggers. Sandbox mode is also available on the built-in test email channel. The Knock CLI supports CI. Sources: https://docs.knock.app/send-notifications/testing-workflows and https://docs.knock.app/integrations/email/knock-test
- **There is no official offline or mock mode.** Even sandbox mode calls Knock's API. To keep Cadence's tests off the network, we would have to wrap Knock behind an interface, as `MailTransport` does today, and fake it in tests. Knock's JS client has internal mock factories, but they are meant for its own tests. Source: https://cdn.jsdelivr.net/npm/@knocklabs/client@0.21.10/test/README.md

**Pricing and lock-in**
- **Free:** $0, up to 10,000 messages/month. No hard cap: Knock contacts you about billing when you go over. Knock branding is shown.
- **Starter:** $250/month with 50k messages, then $0.005/message.
- Batching, preferences, and environments are included on all plans.
- i18n and per-tenant preferences are Enterprise only.

Source: https://knock.app/pricing

There is no self-hosting. Knock is a hosted API, the enterprise tier only offers "dedicated infrastructure", and Knock's own comparison article points self-hosters to Novu. The JS SDKs are MIT-licensed. Sources: https://knock.app/enterprise, https://github.com/knocklabs/javascript, and https://knock.app/blog/the-top-notification-infrastructure-platforms-for-developers. Lock-in is moderate to high, because workflows, templates, preferences, and feed history all live in Knock.

## Novu

**In-app feed**
- `@novu/react` (React 18 or later, including 19) and `@novu/js` provide `<Inbox />`, made up of Bell, Notifications, InboxContent, and Preferences. Hooks are available for a headless UI. Updates are "synchronized ... in real-time". Source: https://docs.novu.co/platform/inbox/overview
- The self-hosted architecture includes a separate WS service, which implies WebSockets. Source: https://docs.novu.co/community/self-hosting-novu/overview
- **Not verified:** handling of seen, read, and archived states, and SSR guidance.
- **Auth:** subscribers are created on first session. Production use needs an HMAC `subscriberHash`. Source: https://docs.novu.co/platform/inbox/overview

**Email**
- Postmark is a first-class integration (server API token plus From address). Source: https://docs.novu.co/platform/integrations/email/postmark
- The advanced email editor (blocks and layouts) is paid only. Source: https://novu.co/pricing

**Digest and daily cap**
- The digest step offers a regular window or a scheduled window (daily, weekly, and so on), in the subscriber's timezone. Events are grouped by `subscriberId`, plus an optional key.
- The maximum window is "1 day on Free, 7 days on Pro, and 30 days on Team".
- A scheduled daily digest fires daily "even with no triggered events" (as summarised from the FAQ), so the template must handle an empty digest.

Source: https://docs.novu.co/platform/workflow/add-and-configure-steps/configure-action-steps/digest

**Preferences and unsubscribe**
- Preferences can be global or per workflow, and "critical" workflows cannot be opted out of. Source: https://docs.novu.co/platform/concepts/subscribers
- "By default, Novu does not add any unsubscribe links to the email". You build the link yourself and call the preferences API. **Not verified:** whether Novu adds List-Unsubscribe headers. Source: https://docs.novu.co/platform/integrations/email

**Identity**
- `subscriberId` (your user ID) is required. Subscribers are created or updated just in time from the trigger's `to` object, or in bulk (500 per call). Source: https://docs.novu.co/platform/concepts/subscribers

**Local dev and testing**
- `npx novu dev` opens a Local environment in the dashboard and tunnels to your locally hosted "bridge" endpoint, where workflows are defined as code. Source: https://docs.novu.co/framework/studio
- Dev and Prod environments are included on Free.
- **No documented mock or offline mode.** The same wrapping approach as for Knock would be needed.

**Pricing and self-hosting**
- **Free:** 10k workflow runs/month, **5 workflows**, 24-hour activity retention, Novu branding.
- **Pro:** from $30/month, 30k+ runs, 20 workflows.
- **Team:** from $250/month.
- Overage on paid plans is $1.20 per 1k runs.

Source: https://novu.co/pricing

The core is MIT-licensed and the `enterprise/` folder is under a commercial license. Source: https://github.com/novuhq/novu

The self-hosted Community edition needs API, Worker, and WS services, a dashboard, **MongoDB, two Redis clusters, and S3-compatible storage**. Even the single-VM option needs 4 vCPU and 8 GB RAM. It allows 1 team member and no custom environments. Novu positions it as where you "test and experiment". Sources: https://docs.novu.co/community/self-hosting-novu/overview and https://docs.novu.co/community/self-hosted-and-novu-cloud

The pricing page lists "Enterprise self-hosted" separately. This stack is far heavier than Cadence's single SQLite file (ADR 0006).

## Courier

**In-app feed**
- `@trycourier/courier-react` v9 (React 18 or later) provides `<CourierInbox />`, and a `<courier-inbox>` web component is also available. `useCourier()` is documented. Messages arrive "in real time". Read, opened, and archived states sync across devices. The backend mints a JWT and the client calls `signIn({ userId, jwt })`.
- **Not verified:** SSR guidance and a full list of hooks.

Source: https://www.courier.com/docs/platform/inbox/inbox-overview

**Email**
- Courier sends through your Postmark account (API token plus From address). The `MessageStream` override and Postmark templates (`withTemplate`) are supported. Source: https://www.courier.com/docs/external-integrations/email/postmark

**Digest and daily cap**
- A digest needs **two automations**: "Add to Digest" to collect, and a "Digest" trigger to release. It is configured per subscription topic, with schedules such as daily. Users can choose "instant" instead. Sources: https://www.courier.com/docs/platform/automations/digest and https://www.courier.com/docs/platform/preferences/digests-setup
- **Conflict:** the pricing page lists "digest and batching" under **Enterprise**, but the digest docs state no plan restriction. Ask Courier before relying on digests on the free or Business plan. Source: https://www.courier.com/pricing

**Preferences and unsubscribe**
- Subscription topics include one-click unsubscribe. Unsubscribe headers can be enabled per topic, and there is a hosted preference page. Source: https://www.courier.com/docs/platform/preferences/preference-center/hosted-page/
- **Not verified:** which plan includes preferences. The pricing page doesn't say.

**Identity**
- Courier stores a profile per `user_id`. `POST /profiles/{user_id}` merges into an existing profile, and inline `to` fields override for a single send.
- The docs **conflict** on whether a send creates a profile implicitly.

Sources: https://www.courier.com/docs/platform/users/users and https://www.courier.com/docs/platform/users

**Local dev and testing**
- Each workspace has a Production and a Test environment, selected by API key. There is "no separate test mode".
- **Test sends count toward billing.** You can set a sandbox provider key per integration.
- No offline or mock mode.

Source: https://www.courier.com/docs/platform/workspaces/environments-api-keys

**Pricing and lock-in**
- **Developer:** free, 10k sends/month.
- **Business:** $0.005 per send from the first send (50k sends costs $250).
- **Enterprise:** custom.

Source: https://www.courier.com/pricing

Courier is closed source with no self-hosting.

## MagicBell

**In-app feed**
- `@magicbell/react` provides `ContextProvider`, `FloatingInbox`, `Inbox` (read/unread with pagination), `UserPreferences`, and `ToastContainer`. It uses a User JWT minted on your server.
- **Not documented:** hooks, the realtime mechanism, seen and archived states, and SSR.

Source: https://www.magicbell.com/docs/libraries/magicbell-react

**Email**
- Providers are SendGrid, Mailgun, Amazon SES, Ping Email, and SMTP. **Postmark is not listed.** Sources: https://www.magicbell.com/docs/channels/email and https://www.magicbell.com/docs/channels/email/smtp
- Postmark does offer SMTP, but this combination is **not verified**.

**Digest:** Not documented. Workflows offer `wait` delays, conditional branching, and Liquid templates, but not digest or batching. Source: https://www.magicbell.com/workflows

**Unsubscribe:** Not documented.

**Identity**
- Users are identified by email or `external_id`, and external ID wins when both are given. External IDs are immutable, and users are created by upsert. Source: https://www.magicbell.com/docs/primitive/user

**Pricing**
- **Builder:** free, 1k deliveries/month, counted **per channel** (in-app plus email counts as 2).
- **Startup:** $249/month for 50k, then $0.0025 each.

Source: https://www.magicbell.com/pricing

MagicBell is closed source.

Verdict: MagicBell is the weakest fit. It has no Postmark integration, no documented digest, and the smallest free tier.

## Baseline: no notification service (SQLite + Postmark)

**In-app feed**
- Store each Notification as a row in a Drizzle `notifications` table: recipient, kind, subject reference, `created_at`, `seen_at`, `read_at`.
- A React Router loader renders the feed and unread count **server-side**, which is the natural fit for Cadence's SSR. Actions mark rows seen or read.
- The UI is shadcn (Popover plus a list), so it matches the rest of the app.
- Realtime is not built in. Revalidating on navigation or focus, or a small SSE endpoint, would cover "while logged in".
- The glossary's "kept until they've seen it" maps directly to `seen_at`.

**Email**
- The existing `MailTransport` stays unchanged, and so does the `.outbox/` test fallback, so **tests remain offline with no new mocking**.

**Daily cap**
- Run a scheduled job, cron or a Node interval, that gathers unsent comment Notifications per user and sends one email.
- Store `last_comment_digest_at` per user to guarantee at most one per day. This is a hard guarantee we control, which is stronger than Knock's batch caveat.

**Preferences and unsubscribe**
- Build these ourselves: a per-user and per-kind opt-out table, a signed unsubscribe URL, and a settings page.
- Postmark automatically adds List-Unsubscribe headers only on **broadcast** streams. On the transactional stream, unsubscribe links "are not required", and Postmark sends custom `List-Unsubscribe` headers if we add them. Sources: https://postmarkapp.com/support/article/1208-how-to-add-an-unsubscribe-link and https://postmarkapp.com/support/article/1299-how-to-include-a-list-unsubscribe-header

**Cost and lock-in:** none beyond Postmark. The cost is engineering time: feed UI, preferences UI, a digest job, and template rendering, which today is plain `TextBody`.

---

## Recommendation

**Start with the baseline (SQLite feed plus Postmark). Keep Knock as the named upgrade path, rather than adopting it now.**

Reasons:
1. **SSR and tests.** Every vendor feed is a client-side React tree that connects to a third-party socket, and none documents SSR. The baseline renders in the loader. It also keeps the `.outbox/` offline-test guarantee, whereas every vendor would need a new wrapper and fake.
2. **The daily cap is easy and stricter in-house.** Knock's own docs say batch "isn't well-suited" for regular digests and can occasionally double-send. A per-user timestamp is a hard cap.
3. **Scope is small.** Cadence needs two channels, a feed, one digest rule, and opt-outs. It does not need SMS, push, Slack, i18n, or multi-tenancy, which is where these platforms earn their price. Knock's paid tier starts at $250/month.
4. **Data model fit.** "Kept until they've seen it" is a domain rule. Storing Notifications in our own DB keeps that rule in the domain, avoids syncing users to a vendor, and stays with one SQLite file (ADR 0006).

**If the team still prefers a vendor**, choose **Knock**:
- first-class Postmark support, so `mailer.server.ts`'s provider is reused
- the most complete React feed and hooks, with explicit seen and read semantics
- batching, Schedules, and preferences on the free tier
- a hosted preference page
- a free tier of 10k messages/month with no hard cap

Plan for three extra pieces of work: a signed `userToken` (enhanced security), a user-sync step, and an interface around Knock so tests stay offline.

Fallbacks:
- **Novu** is the fallback if open source or a cheap first paid tier matters. Watch for the 5-workflow Free limit and the heavy self-host stack.
- **Courier** is viable, but the conflict over whether digests are Enterprise-only is a risk for the comment-email requirement.
- **MagicBell** should be ruled out: no Postmark integration and no documented digest.

## Could not verify

- SSR or React Router guidance for any vendor's React SDK. None was found in the docs.
- Knock: the exact List-Unsubscribe header behaviour, and whether non-commercial (transactional) workflows can use the 1-click link.
- Novu: how seen, read, and archived states work in Inbox; whether it adds List-Unsubscribe headers; and what happens when Free-plan runs are exceeded (the FAQ answers were not rendered).
- Courier: whether digests and preferences are available on the Developer and Business plans (the pricing page and the docs conflict); and whether a send creates a profile implicitly (the docs conflict).
- MagicBell: whether Postmark works through the SMTP provider; whether any digest feature exists; the realtime transport; and unsubscribe support.
- Knock's realtime transport is described only as a "socket". The Phoenix/WebSocket details were not confirmed.
