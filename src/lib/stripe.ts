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
// Stripe's constructor throws on an empty string, so fall back to a placeholder
// key when unset — keeps module import side-effect-free at build time (see
// page-data collection for server pages that import this at module scope).
// Any real API call still fails until a genuine key is configured.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder");

/** The app origin used for Stripe Account Link return/refresh URLs. */
export const APP_ORIGIN = process.env.AUTH_URL ?? "http://localhost:3000";
