import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="block text-center font-display text-2xl tracking-tight text-ink">
          tiny<span className="italic text-rose">kloset</span>
        </Link>
        <div className="mt-6 rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow-card)]">
          <h1 className="font-display text-2xl text-ink">Welcome back</h1>
          <p className="mt-1 text-sm text-ink-soft">Sign in to your closet.</p>
          <div className="mt-5">
            <LoginForm />
          </div>
        </div>
        <p className="mt-5 text-center text-sm text-ink-soft">
          New here?{" "}
          <Link href="/signup" className="font-semibold text-rose-deep hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}
