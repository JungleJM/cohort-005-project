# Known bugs

GitHub issues are disabled on this repo's `origin`, so open bugs are listed here.

## Open

### Refund amount can differ from what was paid

**Where:** `refundableAmount` in `app/routes/courses.$slug.refund.ts` and `amount` in `getRefundOffer` in `app/routes/courses.$slug.tsx`.

**What happens:** Unless the purchase had a purchasing-power discount, the amount shown on the refund form and in the email is the course's current list price. The email still calls it "the amount you paid", and Settings shows the amount really paid.

**Example:** A three-seat purchase at $79 per seat, with no seats claimed, shows $79 on the form and $237 on Settings. A $79 purchase of a course now priced at $99 is offered as $99.

**Expected:** A Refund is always exactly what was paid for the whole purchase (see `GLOSSARY.md`). Both places should use `purchase.amountPaid`.
