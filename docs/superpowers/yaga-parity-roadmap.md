# Yaga Parity Roadmap

**Goal:** Make TinyKloset work like [Yaga](https://yaga.co.za) — replicating all of its pages and flows — rebranded for pre-loved baby & kids' clothing.

TinyKloset is already a Yaga-shaped marketplace (seller shops, listings, discovery, make-an-offer/bundles, with payments/shipping/messaging on the existing Phase 4 roadmap). This document is the **single source of truth** for reaching Yaga parity: a page/flow parity matrix plus a set of independently-buildable sections, each with its own spec → plan → build cycle.

**Current priority (set by user 2026-06-19):** _Replicate all the pages and flows first; do visual polish last._ Build functional/structural parity across every page and flow before refining the look.

Three product decisions:
- **Curation queue is KEPT.** Yaga lets items go live instantly; TinyKloset deliberately keeps the admin `PENDING_REVIEW` gate as a safety measure for a kids' marketplace. Intentional divergence from Yaga.
- **Visual look mimics Yaga — but is done LAST.** Direction approved 2026-06-19 (see Section A): white canvas, bright lime-green accent (`~#c4f135`), lowercase sans wordmark keeping the **tinykloset** name, dense 4-up photo grid, rounded cards with price · brand · size · condition · seller handle · heart. Approved mockup saved at `.superpowers/brainstorm/567-1781896767/content/homepage-direction.html`. This supersedes the prior "soft editorial boutique" design system, but the visual rework is deferred until pages/flows are complete.
- **Visual fidelity caveat:** when Section A is specced, verify the target look against the live Yaga site rather than from memory.

---

## ⚠️ For implementing agents — READ FIRST

This file is the **single source of truth** for Yaga-parity progress. You MUST keep it current:

1. **When you start a section**, set its row in the Status table to `🔧 In progress`, add the date and your branch name.
2. **When you finish a section**, set its row to `✅ Done`, add the date, the merge commit hash, and links to its spec and plan.
3. **Tick the Parity matrix** — when a page/flow ships, update its status in the matrix below.
4. **If you split a section into sub-tasks**, add a checklist under that section heading and tick items (`[x]`) as they merge.
5. **Follow the established workflow** (see [[tinykloset-workflow]] / `AGENTS.md`): brainstorm → spec in `docs/superpowers/specs/` → task-by-task plan in `docs/superpowers/plans/` → subagent-driven build with spec-compliance + code-quality review per task.
6. **Be honest about verification** — distinguish runtime-verified from code-verified/smoke-deferred.
7. **Do not re-spec** the existing Phase 4 payment/shipping/messaging work; reference it. But DO make sure the page/flow gaps it implies (addresses, orders pages, checkout, inbox — flagged below) actually get built.

Commit this file in the same change that flips a status.

Status legend: 📋 Not started · 🔧 In progress · ✅ Done

---

## Page & flow parity matrix

The master checklist: every Yaga page/flow mapped to TinyKloset. Update status as pages ship.

| Area | Yaga page / flow | TinyKloset route | Status | Covered by |
|------|------------------|------------------|--------|-----------|
| Auth | Sign up / log in | `/login` `/signup` | ✅ Done | — |
| Account | Account settings (name, password) | `/account` | ✅ Done | — |
| Account | Delivery address / address book | _none_ | 📋 Gap | Phase 4c (checkout dep) |
| Account | Payout / bank details | `/sell/payouts` | 🔧 In progress | Phase 4b |
| Browse | Home / discover feed | `/` | ✅ Done | — |
| Browse | Category / search / filter | `/` filter bar | ✅ Done | — |
| Browse | Item detail | `/listings/[id]` | ✅ Done | — |
| Browse | Shop / seller page | `/store/[slug]` | ✅ Done | — |
| Browse | Favourites page | `/favourites` | ✅ Done | **Section B** |
| Browse | Following / followed-shops feed | `/following` | ✅ Done | **Section C** |
| Sell | Open a shop | `/sell/start` | ✅ Done | — |
| Sell | Seller dashboard | `/sell` | ✅ Done | — |
| Sell | List / edit item | `/sell/listings/new` · `…/edit` | ✅ Done | — |
| Sell | Edit shop | `/sell/storefront` | ✅ Done | — |
| Sell | Offers received | `/sell/offers` | ✅ Done | — |
| Sell | Sales / orders (mark shipped) | _none_ | 📋 Gap | Phase 4c/4d |
| Transact | Bag / cart | `/bag` | ✅ Done | — |
| Transact | Make offer | `/bag` · `/sell/offers` | ✅ Done | — |
| Transact | Counter-offer | _none_ (accept/decline only) | 📋 Not started | **Section D** |
| Transact | Checkout (address, shipping, pay) | _none_ | 📋 Gap | Phase 4c |
| Transact | Buyer "my purchases" / order tracking | _none_ | 📋 Gap | Phase 4c/4d |
| Transact | Confirm receipt → release payout | _none_ | 📋 Gap | Phase 4c (escrow) |
| Transact | Shipping label (seller) | _none_ | 📋 Gap | Phase 4d (Shippo) |
| Trust | Messaging / inbox | _none_ | 📋 Gap | Phase 4e |
| Trust | Notifications | _none_ | 📋 Not started | **Section F** |
| Trust | Ratings / reviews | _none_ | 📋 Not started | **Section E** |
| Growth | Boosted / promoted listings | _none_ | 📋 Not started | **Section G** |
| Static | Help / FAQ / how-it-works, T&Cs | _none_ | 📋 Not started | **Section H** |

**Page/flow gaps that live inside Phase 4** (call them out explicitly so they aren't lost inside "escrow"): delivery **address book**, **checkout** pages, buyer **"my purchases"/order-tracking**, seller **"sales"/mark-shipped**, **messaging inbox**. When the relevant phase is specced, ensure each of these is a real page in the plan.

---

## Section status table

| # | Section | Status | Depends on | Spec | Plan |
|---|---------|--------|-----------|------|------|
| B | Favorites / likes | ✅ Done (merged to `main`, `a85565a`) | none | [spec](specs/2026-06-19-section-b-favourites-design.md) | [plan](plans/2026-06-20-section-b-favourites.md) |
| C | Follow shops | ✅ Done (merged to `main`, `16f9a59`) | none | [spec](specs/2026-06-20-section-c-follow-shops-design.md) | [plan](plans/2026-06-20-section-c-follow-shops.md) |
| D | Counter-offers | 📋 Not started | existing offer flow | — | — |
| E | Ratings & reviews | 📋 Not started | completed orders (Phase 4c) | — | — |
| F | Notifications | 📋 Not started | offers ✅; richer after messaging (4e) | — | — |
| G | Promoted / boosted listings | 📋 Not started | payments (Phase 4c) for paid boosts | — | — |
| H | Static pages (help/FAQ/how-it-works, T&Cs) | 📋 Not started | none | — | — |
| A | Yaga visual redesign | 📋 Not started (deferred to LAST) | pages/flows complete | — | — |

### Existing Phase 4 roadmap (context — tracked in its own specs/plans)

| Phase | Section | Status |
|-------|---------|--------|
| 4b | Stripe Connect seller onboarding (+ `/sell/payouts`) | 🔧 Spec + plan written, ready to build |
| 4c | Checkout & escrow (address book, checkout, orders, confirm-receipt, 18% commission, 3d auto-release) | 📋 Planned |
| 4d | Shippo shipping labels & tracking (seller sales/mark-shipped, buyer tracking) | 📋 Planned |
| 4e | Buyer ↔ seller messaging / inbox | 📋 Planned |

---

## Suggested build order

Pages/flows first, visual polish last:

1. **Section B — Favorites** and **C — Follow shops** (no dependencies; complete two missing buyer pages) — can run in parallel.
2. **Section D — Counter-offers** (extends an existing, well-understood flow).
3. **Phase 4b → 4c → 4d** on the existing roadmap — this fills the biggest page/flow gaps (payouts, addresses, checkout, orders, shipping). Treat the bracketed pages above as required deliverables.
4. **Section E — Ratings & reviews** (needs completed orders from 4c).
5. **Phase 4e — Messaging / inbox**.
6. **Section F — Notifications** (basic version anytime; full version after messaging).
7. **Section G — Promoted listings** (needs payments for paid boosts).
8. **Section H — Static pages**.
9. **Section A — Yaga visual redesign** (LAST — one pass across all finished pages).

Order is a recommendation, not a constraint — pick up any section whose dependencies are met.

---

## Section details

### A — Yaga visual redesign (deferred to LAST)
Replace the current design system with the approved Yaga-style look (white canvas, lime-green `~#c4f135` accent, lowercase sans, dense photo grid, rounded cards, keep **tinykloset** name). Cross-cutting — `globals.css` theme tokens, shared `src/components/ui/` primitives, page layouts. Done as a single final pass once all pages/flows exist. Re-verify the look against the live Yaga site when specced. Approved mockup: `.superpowers/brainstorm/567-1781896767/content/homepage-direction.html`.

Sub-tasks (fill in during spec):
- [ ] (to be defined in spec)

### B — Favorites / likes
Wire up the existing `Favorite` Prisma model (currently unused): heart/unheart on listing cards and detail pages, a "Favourites" page, favorite counts. No payment dependency.

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
In-app notification feed for: offers received/answered, items sold, new messages (once 4e lands), and new drops from followed shops. Start with events that already exist (offers, sales); expand as messaging and follows land.

Sub-tasks (fill in during spec):
- [ ] (to be defined in spec)

### G — Promoted / boosted listings
Let a seller boost a listing for greater visibility in discovery. Paid boosts depend on the payment infrastructure (Phase 4c); a free admin-boost could ship earlier if desired.

Sub-tasks (fill in during spec):
- [ ] (to be defined in spec)

### H — Static pages
Help / FAQ / how-it-works and Terms & Conditions / privacy pages — the informational pages Yaga carries. Low complexity; mostly content + layout.

Sub-tasks (fill in during spec):
- [ ] (to be defined in spec)

---

## Out of scope (for now)
- Disputes / returns / buyer-protection claims flow (revisit after escrow is live and there's real order volume).
- Removing the curation queue (intentionally kept — see top of doc).
