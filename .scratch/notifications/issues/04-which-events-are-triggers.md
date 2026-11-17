# Which events become Notification triggers?

Type: grilling
Status: open

## Question

From the inventory in [Which existing Cadence events could trigger a Notification?](02-notifiable-events.md), which events become triggers in this spec, and who receives each one (Student, Instructor, Platform Admin, Team Admin)? Comment correspondence and Refund Request decisions are already in; decide the rest (Seat claimed, purchases, admin edits, course status, ratings, comment deletions).

## Pending grilling round (asked 2026-11-16, not yet answered)

Paused before the user answered. When resuming, re-ask these as written (or as revised); the user's answers resolve the ticket. Each "Recommended" is the agent's suggestion, **not** a decision.

Already in scope before this round: reply to your comment; staff answer to your question; new question on an Instructor's course; Refund Request approved/declined → buyer.

1. **Glossary terms.** Add **Comment** (anything posted on a lesson), **Question** (a top-level Comment), **Reply** (a Comment on a Question, one level deep), **Answer** (a Reply by the course's Instructor or a Platform Admin)? Code basis: `app/routes/instructor.questions.tsx` treats every top-level comment as a question. — Recommended: yes.
2. **Answer vs Reply de-duplication.** An Answer is also a Reply; the Student gets one Notification (the Answer one), not two? — Recommended: yes.
3. **New Question recipients.** Only the course's Instructor, not every Platform Admin (they have the queue)? — Recommended: yes.
4. **Refund Request raised → Platform Admins.** Nothing tells them today; only the buyer gets a confirmation email. — Recommended: yes.
5. **Staff removed your Comment → comment author.** No reason field exists, so it can only say "removed by staff." — Recommended: yes, in-app only.
6. **Platform Admin changed your role / name / email → you.** Email change also notifies the old address. — Recommended: yes to both.
7. **Course status changed by a Platform Admin → the course's Instructor.** Students unaffected (status doesn't change access). — Recommended: yes.
8. **Commerce events out of scope:** purchase → Instructor, buyer receipt (a brand-new email), Seat claimed → Team Admin, course rated → Instructor. Not correspondence; ratings are editable and noisy. — Recommended: yes, all to Out of scope.
