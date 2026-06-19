# Yaga Parity Roadmap

**Goal:** Make TinyKloset work like [Yaga](https://yaga.co.za) — the same marketplace flows — rebranded for pre-loved baby & kids' clothing.

TinyKloset is already a Yaga-shaped marketplace (seller shops, listings, discovery, make-an-offer/bundles, with payments/shipping/messaging on the existing Phase 4 roadmap). This document tracks the **remaining work to reach Yaga parity**: a set of independently-buildable sections, each with its own spec → plan → build cycle.

Two intentional product decisions (2026-06-19):
- **Curation queue is KEPT.** Yaga lets items go live instantly; TinyKloset deliberately keeps the admin `PENDING_REVIEW` gate as a safety measure for a kids' marketplace. This is a known, intentional divergence from Yaga.
- **Visual look mimics Yaga.** The existing "soft editorial boutique" design system is being replaced with a Yaga-style bright photo-grid marketplace look (see Section A). This supersedes the design system described in prior specs.

---

## ⚠️ For implementing agents — READ FIRST

This file is the **single source of truth** for Yaga-parity progress. You MUST keep it current:

1. **When you start a section**, set its row in the Status table to `🔧 In progress`, add the date and your branch name.
2. **When you finish a section**, set its row to `✅ Done`, add the date, the merge commit hash, and links to its spec and plan.
3. **If you split a section into sub-tasks**, add a checklist under that section heading below and tick items (`[x]`) as they merge.
4. **Follow the established workflow** (see [[tinykloset-workflow]] / `AGENTS.md`): brainstorm → spec in `docs/superpowers/specs/` → task-by-task plan in `docs/superpowers/plans/` → subagent-driven build with spec-compliance + code-quality review per task.
5. **Be honest about verification** — distinguish runtime-verified from code-verified/smoke-deferred, exactly as the rest of the project does.
6. **Do not re-spec** the existing Phase 4 payment/shipping/messaging work; reference it.

Commit this file in the same change that flips a status.

---

## Status table

| # | Section | Status | Depends on | Spec | Plan |
|---|---------|--------|-----------|------|------|
| A | Yaga visual redesign | 📋 Not started | none (cross-cutting) | — | — |
| B | Favorites / likes | 📋 Not started | none | — | — |
| C | Follow shops | 📋 Not started | none | — | — |
| D | Counter-offers | 📋 Not started | existing offer flow | — | — |
| E | Ratings & reviews | 📋 Not started | completed orders (Phase 4c) | — | — |
| F | Notifications | 📋 Not started | offers ✅; richer after messaging (4e) | — | — |
| G | Promoted / boosted listings | 📋 Not started | payments (Phase 4c) for paid boosts | — | — |

Status legend: 📋 Not started · 🔧 In progress · ✅ Done

### Existing Phase 4 roadmap (context — not part of this doc's scope)

These are tracked in the project's existing specs/plans, not here. Listed so dependencies are clear:

| Phase | Section | Status |
|-------|---------|--------|
| 4b | Stripe Connect seller onboarding | 🔧 Spec + plan written, ready to build |
| 4c | Checkout & escrow (18% commission, 3d auto-release) | 📋 Planned |
| 4d | Shippo shipping labels & tracking | 📋 Planned |
| 4e | Buyer ↔ seller messaging | 📋 Planned |

---

## Suggested build order

Sections are independent, but a sensible order given dependencies and value:

1. **A — Visual redesign** (cross-cutting; do early so later sections are built in the new look, or accept some rework if done late)
2. **B — Favorites** and **C — Follow shops** (no dependencies, high-visibility social wins; can run in parallel)
3. **D — Counter-offers** (extends an existing, well-understood flow)
4. *(Phase 4c checkout/escrow lands here on the existing roadmap — unblocks E and G)*
5. **E — Ratings & reviews** (needs completed orders)
6. **F — Notifications** (basic version anytime; full version after messaging 4e)
7. **G — Promoted listings** (needs payments for paid boosts)

This order is a recommendation, not a constraint — pick up any section whose dependencies are met.

---

## Section details

### A — Yaga visual redesign
Replace the current design system with a Yaga-style look: bright, clean, photo-forward grid; marketplace feel; mobile-first; rebranded for baby/kids. Verify the target look against the live Yaga site during its own brainstorming/spec rather than from memory. Cross-cutting — touches `globals.css` theme tokens, shared `src/components/ui/` primitives, and page layouts.

Sub-tasks (fill in during spec):
- [ ] (to be defined in spec)

### B — Favorites / likes
Wire up the existing `Favorite` Prisma model (currently unused): heart/unheart on listing cards and detail pages, a "Saved" page, favorite counts. No payment dependency.

Sub-tasks (fill in during spec):
- [ ] (to be defined in spec)

### C — Follow shops
Follow/unfollow a seller storefront; a "Shops you follow" view showing recent listings from followed shops. New model + relations. No payment dependency.

Sub-tasks (fill in during spec):
- [ ] (to be defined in spec)

### D — Counter-offers
Extend the current offer flow (accept/decline/withdraw only) so a seller can return a counter-offer, and the buyer can accept/decline/counter again. Touches the bundle/offer state machine in `src/lib/bundle.ts` and the offer actions.

Sub-tasks (fill in during spec):
- [ ] (to be defined in spec)

### E — Ratings & reviews
After a completed sale, buyer and seller can leave a rating + review. Display aggregate rating on storefronts and listings. Depends on completed orders existing (Phase 4c).

Sub-tasks (fill in during spec):
- [ ] (to be defined in spec)

### F — Notifications
In-app notification feed for: offers received/answered, items sold, new messages (once 4e lands), and new drops from followed shops. Start with the events that already exist (offers, sales); expand as messaging and follows land.

Sub-tasks (fill in during spec):
- [ ] (to be defined in spec)

### G — Promoted / boosted listings
Let a seller boost a listing for greater visibility in discovery. Paid boosts depend on the payment infrastructure (Phase 4c); a free admin-boost could ship earlier if desired.

Sub-tasks (fill in during spec):
- [ ] (to be defined in spec)

---

## Out of scope (for now)
- Disputes / returns / buyer-protection claims flow (revisit after escrow is live and there's real order volume).
- Removing the curation queue (intentionally kept — see top of doc).
