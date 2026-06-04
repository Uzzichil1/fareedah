"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImageUploader, type UploadedImage } from "@/components/sell/ImageUploader";
import { createListing, updateListing, submitListing } from "@/app/sell/actions";

type Option = { id: string; label: string };

export type ListingFormProps = {
  listingId?: string;
  categories: Option[];
  conditions: Option[];
  sizes: Option[];
  initial?: {
    title: string;
    description: string;
    priceDollars: string;
    categoryId: string;
    conditionId: string;
    sizeId: string;
    brand: string;
    images: UploadedImage[];
  };
};

export function ListingForm({ listingId, categories, conditions, sizes, initial }: ListingFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [images, setImages] = useState<UploadedImage[]>(initial?.images ?? []);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // `submit=false` saves a draft; `submit=true` saves then submits for review.
  function run(submit: boolean) {
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    const payload = {
      title: String(fd.get("title") ?? ""),
      description: String(fd.get("description") ?? ""),
      priceDollars: String(fd.get("priceDollars") ?? ""),
      categoryId: String(fd.get("categoryId") ?? ""),
      conditionId: String(fd.get("conditionId") ?? ""),
      sizeId: String(fd.get("sizeId") ?? ""),
      brand: String(fd.get("brand") ?? ""),
      images,
    };
    setError(null);
    startTransition(async () => {
      let id = listingId;
      if (id) {
        const r = await updateListing(id, payload);
        if (r?.error) return setError(r.error);
      } else {
        const r = await createListing(payload);
        if ("error" in r) return setError(r.error);
        id = r.id;
      }
      if (submit && id) {
        const r = await submitListing(id);
        if (r?.error) return setError(r.error);
        // success → submitListing redirects to /sell
      } else {
        router.push("/sell");
      }
    });
  }

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        run(false);
      }}
      className="flex flex-col gap-3"
    >
      <input name="title" defaultValue={initial?.title} placeholder="Title" className="border p-2 rounded" />
      <textarea name="description" defaultValue={initial?.description} placeholder="Description" rows={4} className="border p-2 rounded" />
      <input name="priceDollars" defaultValue={initial?.priceDollars} placeholder="Price (USD, e.g. 12.50)" className="border p-2 rounded" />
      <select name="categoryId" defaultValue={initial?.categoryId ?? ""} className="border p-2 rounded">
        <option value="">Select a category…</option>
        {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
      </select>
      <select name="conditionId" defaultValue={initial?.conditionId ?? ""} className="border p-2 rounded">
        <option value="">Select a condition…</option>
        {conditions.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
      </select>
      <select name="sizeId" defaultValue={initial?.sizeId ?? ""} className="border p-2 rounded">
        <option value="">Size (optional)…</option>
        {sizes.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
      <input name="brand" defaultValue={initial?.brand} placeholder="Brand (optional)" className="border p-2 rounded" />
      <ImageUploader value={images} onChange={setImages} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="rounded bg-zinc-200 px-3 py-2">
          {pending ? "Saving…" : "Save draft"}
        </button>
        <button type="button" disabled={pending} onClick={() => run(true)} className="rounded bg-pink-600 px-3 py-2 text-white">
          Submit for review
        </button>
      </div>
    </form>
  );
}
