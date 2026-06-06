"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImageUploader, type UploadedImage } from "@/components/sell/ImageUploader";
import { createListing, updateListing, submitListing } from "@/app/sell/actions";
import { Input, Textarea, Select, Label, FieldError } from "@/components/ui/inputs";
import { Button } from "@/components/ui/Button";

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
  const [createdId, setCreatedId] = useState<string | undefined>(listingId);

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
      let id = createdId ?? listingId;
      if (id) {
        const r = await updateListing(id, payload);
        if (r?.error) return setError(r.error);
      } else {
        const r = await createListing(payload);
        if ("error" in r) return setError(r.error);
        id = r.id;
        setCreatedId(r.id);
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
      className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow-card)]"
    >
      <div>
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" defaultValue={initial?.title} placeholder="e.g. Floral linen romper" />
      </div>

      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={initial?.description}
          placeholder="Condition notes, fit, story…"
          rows={4}
        />
      </div>

      <div>
        <Label htmlFor="priceDollars">Price (USD)</Label>
        <Input id="priceDollars" name="priceDollars" defaultValue={initial?.priceDollars} placeholder="12.50" inputMode="decimal" />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="categoryId">Category</Label>
          <Select id="categoryId" name="categoryId" defaultValue={initial?.categoryId ?? ""}>
            <option value="">Select a category…</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </Select>
        </div>
        <div>
          <Label htmlFor="conditionId">Condition</Label>
          <Select id="conditionId" name="conditionId" defaultValue={initial?.conditionId ?? ""}>
            <option value="">Select a condition…</option>
            {conditions.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </Select>
        </div>
        <div>
          <Label htmlFor="sizeId">Size</Label>
          <Select id="sizeId" name="sizeId" defaultValue={initial?.sizeId ?? ""}>
            <option value="">Size (optional)…</option>
            {sizes.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </Select>
        </div>
        <div>
          <Label htmlFor="brand">Brand</Label>
          <Input id="brand" name="brand" defaultValue={initial?.brand} placeholder="Brand (optional)" />
        </div>
      </div>

      <div>
        <Label>Photos</Label>
        <ImageUploader value={images} onChange={setImages} />
      </div>

      {error && <FieldError>{error}</FieldError>}

      <div className="flex flex-wrap gap-3 pt-1">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Saving…" : "Save draft"}
        </Button>
        <Button type="button" variant="primary" disabled={pending} onClick={() => run(true)}>
          Submit for review
        </Button>
      </div>
    </form>
  );
}
