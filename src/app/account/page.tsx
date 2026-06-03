import { getCurrentUser } from "@/lib/dal";
import { logoutAction } from "@/app/actions/auth";

export default async function AccountPage() {
  const user = await getCurrentUser(); // redirects to /login if unauthenticated

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="mb-2 text-2xl font-semibold">Your account</h1>
      <p className="text-zinc-600">Signed in as {user?.email}</p>
      <p className="text-zinc-600">Role: {user?.role}</p>
      <form action={logoutAction} className="mt-4">
        <button className="rounded bg-zinc-900 p-2 text-white">Log out</button>
      </form>
    </main>
  );
}
