import type { Metadata } from "next";
import Link from "next/link";
import { SignupForm } from "@/components/auth/SignupForm";

export const metadata: Metadata = { title: "Sign up" };

export default function SignupPage() {
  return (
    <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="block text-center font-display text-2xl tracking-tight text-ink">
          tiny<span className="italic text-rose">kloset</span>
        </Link>
        <div className="mt-6 rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow-card)]">
          <h1 className="font-display text-2xl text-ink">Create your account</h1>
          <p className="mt-1 text-sm text-ink-soft">Join the little closet community.</p>
          <div className="mt-5">
            <SignupForm />
          </div>
        </div>
        <p className="mt-5 text-center text-sm text-ink-soft">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-rose-deep hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
