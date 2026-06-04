import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { verifySession } from "@/lib/dal";
import { StorefrontForm } from "@/components/sell/StorefrontForm";

export const metadata: Metadata = { title: "Open your storefront" };

export default async function SellStartPage() {
  const { userId } = await verifySession();
  const existing = await prisma.storefront.findUnique({ where: { userId } });
  if (existing) redirect("/sell");

  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="mb-4 text-2xl font-semibold">Open your storefront</h1>
      <p className="mb-4 text-zinc-600">Set up a storefront to start listing items.</p>
      <StorefrontForm />
    </main>
  );
}
