import { requireAdmin } from "@/lib/dal";

export default async function AdminPage() {
  await requireAdmin(); // redirects non-admins to /

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-2xl font-semibold">Admin</h1>
      <p className="text-zinc-600">Curation queue and platform settings land in later phases.</p>
    </main>
  );
}
