# Knock: at most one comment email per person per day

Research date: 2026-11-16. Sources are Knock's own docs and pricing page, read on that date. Ticket: `.scratch/notifications/issues/08-knock-daily-comment-email.md`. Context: ADR 0013 (deliver every Notification through Knock), GLOSSARY.md ("Notification"), and branch `research/knock-vs-alternatives`.

**Question.** Cadence must send a **strict** maximum of one comment-Notification email per person per day through Knock, and still show every comment Notification in the in-app feed straight away. How does Knock support this, and where do its guarantees fall short?

**Short answer.** No Knock feature enforces "at most one per day" with a documented guarantee. Use two workflows:

- A per-comment workflow that has only an in-app feed step.
- A daily digest workflow, fired by a per-user Knock **Schedule**. It starts with a **fetch** step that calls Cadence, and its email step is skipped when the fetched list is empty.

The strict cap lives in Cadence's SQLite, as a unique "digest sent for (user, local date)" row that is claimed inside the fetch endpoint. This is also what Knock itself suggests for digests: use your own system as the source of truth.

---

## 1. How a Schedule-based digest gets its data

- **Knock does not gather the day's activity for you. Cadence has to supply it.** Knock's recurring-digest guide puts a fetch step first and says it "will make a call _per recipient_ to an HTTP endpoint to retrieve this information". The guide also says that Knock-managed digest data, built from summaries of triggered workflows, is planned for the future and not available today. https://docs.knock.app/guides/building-recurring-digests
- **A scheduled run starts with no data:** "In the case of a scheduled workflow, the workflow will be triggered with an empty data payload by default". You can attach static `data` when you create the schedule, or use a fetch step. https://docs.knock.app/concepts/schedules
- **Knock's batch docs give the same advice for digests.** Batch "isn't well-suited for powering regular daily or weekly digests … In those cases, referencing your system as the source of truth for the events that should be included in the digest at send time is often a better approach." https://docs.knock.app/designing-workflows/batch-function
- **How the fetch step works:**
  - Methods: GET, POST, PUT, DELETE, or PATCH. URL, headers, and query use Liquid, so `{{ recipient.id }}` works. POST and PUT send a JSON body.
  - Auth: a secret in a header through `{{ vars.… }}`, or optional request signing with an `x-knock-signature` HMAC-SHA256 header. Knock recommends rejecting requests whose timestamp is more than 5 minutes old.
  - Responses: 200, 201, or 204 within **15 s**. The JSON is **shallow-merged** into the run's `data`, and an optional response path controls where it lands.
  - Retries: 5xx, 429, and timeouts are retried after 30 s and again after 60 s. "All other errors … are immediately fatal". A failure will "mark the fetch function step as a failure and halt your workflow run".

  Source: https://docs.knock.app/designing-workflows/fetch-function
- **Reading Knock's own data is possible but not recommended.** The fetch step could call Knock's List-user-messages API, which filters by `source` (workflow key), `channel_id`, `inserted_at.gte/lt`, and `engagement_status`, returns 50 items per page with cursor paging, and is in rate-limit tier 4 (https://docs.knock.app/api-reference/users/list_messages). Knock does not document this pattern. It would also put the secret API key in Knock environment variables, the fetch step can't follow pagination, and Knock offers no atomic "mark as emailed". **Not recommended. Not verified to work.**
- **Steps involved in the recommended design:** fetch, then email. Throttle is optional as a second safeguard (section 2). Branch isn't needed, because a step condition on the email step is enough (section 4). Batch is not used.

## 2. Throttle: does Knock enforce "at most N per window"?

- **Yes, per workflow and per recipient.** "A throttle function allows you to limit the number of times a workflow is executed for a recipient within a given window."
  - Threshold: defaults to 1.
  - Window: fixed (seconds to days), or dynamic (a timestamp, a duration, or a window rule evaluated in the recipient's timezone). The maximum is 31 days.
  - Key: an optional Liquid key, shorter than 64 characters, adds grouping on top of the recipient.
  - When the throttle is hit, "the workflow will stop execution".

  Source: https://docs.knock.app/designing-workflows/throttle-function
- **Guarantees are not documented.** The page says nothing about atomicity or how concurrent runs are handled. Other limits from the same page:
  - Throttles "cannot throttle across Knock workflows".
  - An active throttle cannot be cancelled.
  - "The window opens the first time the throttle function is executed in a workflow run for a recipient".
  - An invalid dynamic window logs an error and **skips the throttle**, so the step fails open.

  Source: https://docs.knock.app/designing-workflows/throttle-function
- **Inference, not tested:** a fixed 24 h window that opens at about 09:00 can still be open when the next day's 09:00 run starts, which would suppress that legitimate digest. DST days last 23 or 25 hours, which makes this worse. If a throttle is added as a backstop, give it a window clearly shorter than a day (for example 20 h), or a dynamic window rule that closes before the next scheduled hour.
- **Trigger frequency doesn't help here.** The "once per recipient" trigger frequency is a lifetime limit, not a daily one. https://docs.knock.app/send-notifications/triggering-workflows
- **Pricing page:** "Throttling" for workflows is **not listed** on any plan. Only "Guide throttling" appears. Branch isn't listed either. Whether the Free plan includes them is **unverified**. https://knock.app/pricing

## 3. In-app now, email only in the digest

- **Recommended: two workflows.**
  - `comment`, triggered by Cadence for each comment: a single in-app feed channel step.
  - `comment-digest`, triggered only by Schedules: a fetch step, then an email step.
- Why two:
  - Schedules start a workflow with empty data and run once per occurrence (https://docs.knock.app/concepts/schedules). One workflow can't be both "per comment, right now" and "once a day, per recipient".
  - Channel steps cover one channel type each ("a notification to be delivered on a single channel type") and have their own step conditions and preference checks. https://docs.knock.app/designing-workflows/channel-step
  - Preferences can be set per workflow and per channel type, so a user could mute the digest without losing the feed. https://docs.knock.app/preferences/overview
- **Rejected one-workflow alternatives:**
  - *In-app, then throttle (1/day), then email.* Email goes out for the first comment of the window and later comments are dropped from email entirely. The result is a "first comment" email, not a digest, and the cap depends on undocumented throttle guarantees.
  - *In-app, then batch (daily window rule), then email.* Steps before a batch aren't documented as running once per trigger. Knock warns that batch isn't suited to digests and that a new workflow version "can close two batches around the same time and send two notifications" (pinned mode). https://docs.knock.app/designing-workflows/batch-function
  - *Send windows on the email step.* Messages generated outside a window are held and then sent one by one. Send windows defer messages but don't aggregate them. https://docs.knock.app/designing-workflows/send-windows

## 4. Empty days, timezones, schedule upkeep, pricing

**Empty days**
- Knock runs a scheduled workflow whether or not anything happened that day. Nothing in the docs says it skips empty sends automatically.
- To skip, put a step condition `data.items` **`not_empty`** on the email step. When a step condition is false, "the step will be skipped and the subsequent step will be invoked, or the workflow will terminate". https://docs.knock.app/designing-workflows/step-conditions
- The operators include `empty` and `not_empty`. The docs warn: "a property set to an empty string or empty list is evaluated as existing", so use `not_empty`, not `exists`. https://docs.knock.app/concepts/conditions
- Knock charges for messages sent, not workflows triggered, so an empty run costs nothing. https://knock.app/pricing

**Timezones**
- Set `timezone` (a tz database string) on each Knock user. Without it, Knock uses the account default timezone, then `Etc/UTC`.
- `repeats.hours` and `repeats.minutes` (a multiple of 5) are read in the recipient's timezone. Timezone-aware execution only applies to recurring schedules.

Source: https://docs.knock.app/concepts/schedules

**Creating and maintaining schedules**
- Schedules are API-only: "Schedules cannot be created in the Knock dashboard". https://docs.knock.app/send-notifications/triggering-workflows/schedules
- Each schedule is per recipient. `POST /v1/schedules` accepts up to 100 recipients per call (the guide states the limit, the API reference doesn't), and `POST /v1/schedules/bulk/create` creates up to 1,000. Update and delete each take up to 100 IDs. https://docs.knock.app/api-reference/schedules, https://docs.knock.app/concepts/schedules
- There's no "all users" mode: each user has to be added. The user must be identified before a schedule is created for them. https://docs.knock.app/send-notifications/triggering-workflows/schedules, https://docs.knock.app/guides/building-recurring-digests
- Each schedule has `next_occurrence_at` and `last_occurrence_at`. A run uses whichever workflow version is current when it executes. https://docs.knock.app/concepts/schedules
- Creating a schedule has **no documented idempotency**. If Cadence calls create twice, the user gets two schedules. Before creating, list schedules filtered by `workflow` and `recipients[]`, or store the schedule ID. The trigger API's `Idempotency-Key` header (24 h) applies to triggers, and the docs don't say it applies to schedule creation. https://docs.knock.app/api-reference/schedules, https://docs.knock.app/send-notifications/triggering-workflows/api
- In Cadence, create the schedule when the user is identified to Knock, backfill existing users with bulk create, and delete it when the user is deleted. The docs don't say what happens to a deleted user's schedules.

**Plans**
- Per the pricing page, Free, Starter, and Enterprise all include "Scheduled workflows", "Batching", and "Fetch from HTTP".
- No limit on the number of schedules is stated, and workflows and triggers are unlimited.
- Throttle and branch aren't listed (unverified, see section 2).

Source: https://knock.app/pricing

## 5. Remaining gaps in the "strict" guarantee

1. **Knock promises nothing about schedules running exactly once.** No page covers duplicate or missed occurrences, retries, or what happens while a workflow is inactive. Two schedules for the same user would also mean two runs. **Unverified.** The cap therefore has to be enforced on Cadence's side.
2. **Throttle atomicity is undocumented** (section 2), and a throttle can fail open when its dynamic window is invalid.
3. **Claiming the day in the fetch endpoint makes delivery at most once, not exactly once.**
   - If Cadence commits the claim but the response times out, Knock retries, the retry gets an empty list, and no email goes out that day.
   - If the email step or Postmark fails after the claim, that day's email is lost.
   - In both cases the comments are still in the in-app feed. This is the price of a strict cap. Reconciling claims against Knock's message status, through Knock's webhooks or the messages API, is possible but beyond this research.
4. **Whose "day".** Cadence has to compute the claim date in the same timezone that Knock uses for the user, so keep the user's `timezone` in sync. If a user changes timezone, the same local date can come round twice, and the unique row stops a second email.
5. **What goes in the digest.** Should comments already read in the feed be included? That is a product decision. If they should be excluded, Cadence needs to know the read state, and that lives in Knock (ADR 0013).
6. **Test runs** in the dashboard skip fetch retries (https://docs.knock.app/designing-workflows/fetch-function), so production retry behaviour can't be fully tried out from the dashboard.

## 6. Simplest design that meets the cap

1. **`comment` workflow** (triggered by Cadence for each comment Notification): in-app feed step only. The feed shows every comment straight away.
2. **`comment-digest` workflow:**
   - Fetch step: POST to a Cadence resource route, for example `/api/knock/comment-digest`, with `{ "user_id": "{{ recipient.id }}" }`, signed with `x-knock-signature`.
   - Email step: step condition `data.items not_empty`, with a Liquid template that loops over `items`.
   - Optional backstop: a throttle step (threshold 1, window about 20 h) before the email step.
3. **One Knock Schedule per user** on `comment-digest`:
   - `repeats: { frequency: "daily", hours: <send hour> }` in the user's Knock `timezone`.
   - Created when the user is identified, with a stored schedule ID so it is never created twice.
   - Deleted along with the user.
4. **The Cadence endpoint does the strict part** in one SQLite transaction:
   - Verify the signature.
   - Compute the user's local date.
   - `INSERT` into a `comment_digest_sends (user_id, local_date)` table with a **unique index**. On conflict, return `{ "items": [] }`.
   - Otherwise return the comments that concern the user since their previous digest, read from Cadence's own comments data.

   Knock can retry or run the schedule twice and the user still gets at most one email per local day.

This keeps ADR 0013 intact: every email still goes out through Knock and Postmark. The only new Cadence pieces are one resource route and one table, and tests can call that route directly without touching Knock.
