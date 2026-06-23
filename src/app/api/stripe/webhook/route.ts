import { NextResponse } from "next/server";
import type { Stripe } from "stripe";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/db";

// Stripe sends events as raw JSON signed with STRIPE_WEBHOOK_SECRET. We verify
// the signature, then sync charges/payouts flags on account.updated. Unsigned or
// invalid requests are rejected (400). Unhandled event types are acknowledged.
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers.get("stripe-signature");
  if (!secret || !signature) {
    return new NextResponse("Missing signature", { status: 400 });
  }

  const body = await req.text(); // raw body required for signature verification

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    return new NextResponse("Invalid signature", { status: 400 });
  }

  if (event.type === "account.updated") {
    const account = event.data.object as Stripe.Account;
    // Idempotent: scope the update to the storefront owning this account id.
    await prisma.storefront.updateMany({
      where: { stripeAccountId: account.id },
      data: {
        stripeChargesEnabled: account.charges_enabled ?? false,
        stripePayoutsEnabled: account.payouts_enabled ?? false,
      },
    });
  }

  return NextResponse.json({ received: true });
}
