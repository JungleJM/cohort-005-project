# Keep Progress after an Approved Refund Request

An Approved Refund Request ends a Learner's Enrollment but keeps all of their Progress on that course, and a new Enrollment picks up where it left off. Refund Limits count all Progress on a course across every purchase, so deleting it would let a Learner repeatedly buy, watch just under the limit, get a Refund and buy again. Keeping it also preserves the record the Support Team decided on, and costs almost nothing: Watch Time, the largest part of Progress, is about 18 KB per hour watched.

## Considered Options

- **Delete all Progress on approval**: resets the Refund Limits and blanks the Support Team's record.
- **Delete after a fixed period**: the same problems return once the period ends, and it needs scheduled cleanup.
- **Keep only what the Refund Limits need**: saves little, and makes returning harder to explain to Learners.

## Consequences

Keeping Progress means its presence no longer implies an Enrollment. Anything that shows Progress to a Learner, or counts it for an instructor, has to check for a current Enrollment.
