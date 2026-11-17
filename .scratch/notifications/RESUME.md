# Resume here: Notifications wayfinder

Paused 2026-11-16 on branch `wayfinder-notifications`. Everything below is local and **uncommitted** unless a later commit says otherwise.

## What this effort is

Planning (not building) in-app + email **Notifications** for Cadence, using the `/wayfinder` skill. Destination: a full spec (PRD) ready to slice into build tickets. The map is [map.md](map.md); tickets are in [issues/](issues/). The tracker is local markdown because the `gh` token can't write GitHub issues.

## How to pick up

1. Read [map.md](map.md) (Destination, Notes, Decisions so far, fog, out of scope).
2. Run `/wayfinder .scratch/notifications/map.md`.
3. The next ticket is **Which events become Notification triggers?** ([issues/04-which-events-are-triggers.md](issues/04-which-events-are-triggers.md)). A grilling round of 8 questions was asked but **not answered**. They're saved at the bottom of that ticket, so re-ask them and don't treat the recommendations as decided.

## State at pause

- **Resolved:** Knock vs alternatives (research), Which existing events could trigger a Notification (research), Knock or our own DB + Postmark (chose Knock, for learning, recorded in `docs/adr/0013-deliver-notifications-through-knock.md`), and How Knock sends at most one comment email per day (research: Cadence's SQLite enforces the cap through a daily Schedule plus a fetch route).
- **Open, unblocked:** Which events become Notification triggers? (paused mid-grilling); Who is notified when someone replies to a comment?; In-app Notification feed UI (prototype).
- **Open, blocked:** Channel and frequency for each trigger, which waits on the triggers ticket, the comment-reply ticket and the daily-email research.
- **Research findings** are on unmerged branches on origin: `research/knock-vs-alternatives`, `research/notifiable-events`, `research/knock-daily-comment-email` (each has `docs/research/<name>.md`).

## Uncommitted changes from this effort

- `GLOSSARY.md`: added **Notification**.
- `docs/adr/0013-deliver-notifications-through-knock.md`: new.
- `.scratch/notifications/`: the map, the tickets, and this file.

## Side thread

There's also a `/teach` request ("what platform would notifications sit on?"). It was answered (Cadence is a server-rendered web app, so Notifications live in the browser), but no teaching workspace (MISSION.md, lessons/) was created, because the user moved on to wayfinding.
