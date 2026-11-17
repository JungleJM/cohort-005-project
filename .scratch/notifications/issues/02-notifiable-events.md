# Which existing Cadence events could trigger a Notification?

Type: research
Status: resolved

## Question

Inventory every state-changing event Cadence performs today that could concern someone other than the actor, so the trigger list comes only from existing features.

## Answer

Findings: branch `research/notifiable-events` on origin, file `docs/research/notifiable-events.md` (unmerged, with file:line references).

- Email today: only three Refund Request emails to the buyer (raised, approved, declined). **No purchase/welcome emails exist** — there's a placeholder in `courses.$slug.purchase.tsx` that's switched off.
- Candidates: reply to a comment; staff answer to a question; new top-level question (→ Instructor); staff deleting someone's comment; Seat claimed (→ Team Admin); Individual Purchase / Team Licence purchase (→ Instructor, buyer receipt); Refund Request raised (→ Platform Admins), approved/declined (→ buyer); role changed or name/email edited by a Platform Admin; course status changed by a Platform Admin (→ Instructor); course rated (→ Instructor).
- Caveats: detect a staff answer by reply author, not by which page posted it; replies can land under a deleted question; "unanswered for 3 days" is computed, not stored; ratings are editable (noisy); course status doesn't change Student access.
- Not in Cadence: Pending/Issued/Failed Refund states (glossary only), team membership changes, course completion, course ownership transfer.
