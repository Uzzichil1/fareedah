import "server-only";
import Stripe from "stripe";

// Server-only Stripe client (test mode). STRIPE_SECRET_KEY must be a Stripe TEST
// secret key. We construct the client even when the key is absent so the app
// builds/imports cleanly; any actual API call will fail until the key is set.
//
// NOTE: Stripe's TS types may require an `apiVersion`. Set it to the value the
// INSTALLED `stripe` package expects — check `node_modules/stripe/types` or the
// SDK's exported `Stripe.LatestApiVersion`. Do NOT hardcode a version that
// mismatches the installed SDK (it's a type error). If the installed version
// allows omitting `apiVersion`, omit it.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");

/** The app origin used for Stripe Account Link return/refresh URLs. */
export const APP_ORIGIN = process.env.AUTH_URL ?? "http://localhost:3000";
