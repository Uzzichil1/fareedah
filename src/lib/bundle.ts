// Pure bundle logic — no DB, no I/O. Unit-tested in bundle.test.ts.

export type BundleStatus =
  | "OPEN"
  | "SUBMITTED"
  | "ACCEPTED"
  | "DECLINED"
  | "CHECKED_OUT";

/** All statuses that represent an active (non-checked-out) bundle, including
 *  declined ones still visible in the buyer's bag. */
export const ACTIVE_BUNDLE_STATUSES = [
  "OPEN",
  "SUBMITTED",
  "ACCEPTED",
  "DECLINED",
] as const satisfies readonly BundleStatus[];

/** Subset of statuses where a bundle is purchasable / has meaningful bag weight.
 *  Excludes DECLINED (offer gone) and CHECKED_OUT. Used for the bag item count. */
export const PURCHASABLE = [
  "OPEN",
  "SUBMITTED",
  "ACCEPTED",
] as const satisfies readonly BundleStatus[];

export type BundleAction =
  | "addItem"
  | "removeItem"
  | "submitOffer"
  | "withdrawOffer"
  | "accept"
  | "decline";

const TRANSITIONS: Record<BundleAction, { from: BundleStatus[]; to: BundleStatus }> = {
  addItem: { from: ["OPEN", "DECLINED"], to: "OPEN" },
  removeItem: { from: ["OPEN", "DECLINED"], to: "OPEN" },
  submitOffer: { from: ["OPEN", "DECLINED"], to: "SUBMITTED" },
  withdrawOffer: { from: ["SUBMITTED"], to: "OPEN" },
  accept: { from: ["SUBMITTED"], to: "ACCEPTED" },
  decline: { from: ["SUBMITTED"], to: "DECLINED" },
};

/** The set of from-statuses each action is allowed from (the buy-now/checkout
 *  transition to CHECKED_OUT belongs to 4c and is intentionally absent). */
export function canTransition(from: BundleStatus, action: BundleAction): boolean {
  return TRANSITIONS[action].from.includes(from);
}

export function nextStatus(action: BundleAction): BundleStatus {
  return TRANSITIONS[action].to;
}

/** Live listed total in cents — non-LIVE items are excluded (they're unavailable). */
export function listedTotalCents(items: { priceCents: number; isLive: boolean }[]): number {
  return items.reduce((sum, i) => (i.isLive ? sum + i.priceCents : sum), 0);
}

/** Validate a proposed offer (cents) against the live listed total (totalCents).
 *  Returns a user-facing message, or null when the offer is acceptable. */
export function offerError(offerCents: number, totalCents: number): string | null {
  if (!Number.isInteger(offerCents) || offerCents <= 0) {
    return "Enter an offer above $0.";
  }
  if (totalCents <= 0) {
    return "This bundle has no available items.";
  }
  if (offerCents > totalCents) {
    return "Your offer can't be more than the listed total.";
  }
  return null;
}
