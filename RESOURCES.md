# Refunds in Cadence Resources

## Knowledge

- [Code: refund action](app/routes/courses.$slug.refund.ts)
  The primary source for what happens on submit. Use for: eligibility enforcement, the row written, the learner email.
- [Code: course page](app/routes/courses.$slug.tsx)
  Decides who is offered Request a refund and renders the form. Use for: learner interface before submitting.
- [Code: settings page](app/routes/settings.tsx)
  Shows pending requests. Use for: learner interface while waiting.
- [Code: schema](app/db/schema.ts)
  The `refund_requests` table and `RefundRequestStatus`. Use for: the intended shape of approval.
- [Docs: React Router actions](https://reactrouter.com/start/framework/actions)
  How forms reach server actions. Use for: the mechanics of the submit.
- [Docs: Stripe refunds](https://docs.stripe.com/refunds)
  How refunds work with a real provider. Use for: what approval would have to trigger.
- [Docs: Stripe disputes](https://docs.stripe.com/disputes)
  Defines disputes and chargebacks. Use for: why "chargeback" means something else and is banned from our language.

## Wisdom (Communities)

- [AI Hero Discord](https://www.aihero.dev/discord)
  The community linked from this repo's README. Use for: how others approach review workflows like this one.

## Gaps

- No ADR, issue or document describes the intended approval flow. Issues are disabled on the `origin` repo. The schema and the interface copy are the only evidence of intent.
