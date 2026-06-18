import Link from "next/link";
import { getCurrentUser } from "@/lib/dal";
import { logoutAction } from "@/app/actions/auth";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonClasses } from "@/components/ui/Button";
import { AccountProfileForm } from "@/components/account/AccountProfileForm";
import { ChangePasswordForm } from "@/components/account/ChangePasswordForm";

export default async function AccountPage() {
  const user = await getCurrentUser(); // redirects to /login if unauthenticated

  return (
    <>
      <SiteHeader />

      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-md px-5 py-12 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sage">Account</p>
        <h1 className="mt-1 font-display text-3xl text-ink">Your account</h1>

        <div className="mt-8 rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow-card)]">
          <dl className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-xs uppercase tracking-[0.14em] text-ink-soft">Name</dt>
              <dd className="truncate text-[15px] text-ink">{user?.name}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-line pt-4">
              <dt className="text-xs uppercase tracking-[0.14em] text-ink-soft">Signed in as</dt>
              <dd className="truncate text-[15px] text-ink">{user?.email}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-line pt-4">
              <dt className="text-xs uppercase tracking-[0.14em] text-ink-soft">Role</dt>
              <dd>
                <Badge tone={user?.role === "ADMIN" ? "ink" : "sage"}>{user?.role}</Badge>
              </dd>
            </div>
          </dl>
        </div>

        <div className="mt-6 rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow-card)]">
          <h2 className="font-display text-lg text-ink">Display name</h2>
          <p className="mt-1 text-sm text-ink-soft">This is the name shown on your account.</p>
          <div className="mt-4">
            <AccountProfileForm initialName={user?.name ?? ""} />
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow-card)]">
          <h2 className="font-display text-lg text-ink">Change password</h2>
          <p className="mt-1 text-sm text-ink-soft">Update the password used to sign in.</p>
          <div className="mt-4">
            <ChangePasswordForm />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link href="/sell" className={buttonClasses("secondary", "md")}>
            Your listings
          </Link>
          {user?.role === "ADMIN" ? (
            <Link href="/admin" className={buttonClasses("secondary", "md")}>
              Curation queue
            </Link>
          ) : null}
          <form action={logoutAction} className="ml-auto">
            <Button type="submit" variant="ghost">
              Log out
            </Button>
          </form>
        </div>
      </main>
    </>
  );
}
