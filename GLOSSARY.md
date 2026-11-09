# Cadence

An online course platform where learners buy courses and work through them.

## Language

### Refunds

**Refund**:
The service of giving a learner back exactly what they paid for a whole purchase, in exchange for their access to the course. People act on a Refund: a learner requests it, the team reviews it and approves or declines it.
_Avoid_: Cancellation, Chargeback, Reversal, Return, Claim

**Refund Request**:
The procedure that carries a Refund from the learner asking for it through to an ending. Access ends at approval, and sending the money is a later, separate stage.
_Avoid_: Cancellation, Chargeback, Reversal, Return, Claim

**Refund Requested**:
The stage of a Refund Request that is waiting on a decision.
_Avoid_: Pending Chargeback, Reversal requested

**Refund Approved**:
The stage of a Refund Request where the Refund has been accepted but the money has not been sent.

**Refunded**:
The ending of a Refund Request where the money has been sent.

**Refund Declined**:
The ending of a Refund Request where the Refund was refused. It is final for that purchase.

**Withdrawn**:
The ending of a Refund Request the learner took back before a decision. It does not stop them requesting a Refund again while still eligible.
_Avoid_: Cancelled

**Refund Eligibility Window**:
The time after a purchase during which a learner may request a Refund. Eligibility is judged once, when the Refund is requested.
_Avoid_: Cancel window, bare "window" where the meaning is unclear

**Refund Review Period**:
The time the team has to approve or decline a Refund once it has been requested.
_Avoid_: Using "window" for this

## Naming conventions

These apply to interface text, messages and code alike. What exists today follows them now, and what is not built yet must use them when it is built.

### Refunds

- People act on a **refund**: request it, review it, approve it, decline it. The procedure is always a **Refund Request**.
- "Window" means only the Refund Eligibility Window, and "period" means only the Refund Review Period. Use the full name wherever a short form could confuse.
- Never use cancel, chargeback, reversal, return or claim for any part of this. A plain "Cancel" that dismisses a form is unrelated and stays.

| Not built yet   | Interface wording | Status value | Email builder               |
| --------------- | ----------------- | ------------ | --------------------------- |
| Refund Approved | "Refund approved" | `approved`   | `buildRefundApprovedEmail`  |
| Refunded        | "Refunded"        | `refunded`   | `buildRefundedEmail`        |
| Refund Declined | "Refund declined" | `declined`   | `buildRefundDeclinedEmail`  |
| Withdrawn       | "Withdrawn"       | `withdrawn`  | `buildRefundWithdrawnEmail` |

| Not built yet        | Name                               |
| -------------------- | ---------------------------------- |
| Team actions         | "Approve refund", "Decline refund" |
| Learner action       | "Withdraw my refund request"       |
| Refund Review Period | `REFUND_REVIEW_PERIOD_DAYS`        |
