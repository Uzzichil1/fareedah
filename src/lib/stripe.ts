import "server-only";
import Stripe from "stripe";

// Server-only Stripe client (test mode). STRIPE_SECRET_KEY must be a Stripe TEST
// secret key. We construct the client even when the key is absent so the app
// builds/imports cleanly; any actual API call will fail until the key is set.
//
// apiVersion is omitted: it's optional on stripe@22.x and defaults to the SDK's pinned version.
//
// Stripe's constructor throws on an empty string, so fall back to a placeholder
// key when unset — keeps module import side-effect-free at build time (see
// page-data collection for server pages that import this at module scope).
// Any real API call still fails until a genuine key is configured.
const PLACEHOLDER_KEY = "sk_test_placeholder"; // allows client construction only; never treated as configured
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || PLACEHOLDER_KEY);

/** The app origin used for Stripe Account Link return/refresh URLs. */
export const APP_ORIGIN = process.env.AUTH_URL ?? "http://localhost:3000";
