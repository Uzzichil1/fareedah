"use client";

import { useState } from "react";
import Image from "next/image";
import { uploadToCloudinary } from "@/lib/cloudinary-client";

export type UploadedImage = { url: string; publicId: string; position: number };

const MAX_IMAGES = 8;

export function ImageUploader({
  value,
  onChange,
}: {
  value: UploadedImage[];
  onChange: (images: UploadedImage[]) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setBusy(true);
    const next = [...value];
    try {
      for (const file of Array.from(files)) {
        if (next.length >= MAX_IMAGES) {
          setError(`Up to ${MAX_IMAGES} images.`);
          break;
        }
        const { url, publicId } = await uploadToCloudinary(file);
        next.push({ url, publicId, position: next.length });
      }
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      // Commit whatever uploaded successfully before any failure, then clear busy.
      onChange(next.map((img, i) => ({ ...img, position: i })));
      setBusy(false);
    }
  }

  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index).map((img, i) => ({ ...img, position: i })));
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line bg-paper/60 px-4 py-6 text-center transition-colors hover:border-rose-soft hover:bg-blush/30">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-ink-soft"
          aria-hidden="true"
        >
          <path d="M12 16V4M7 9l5-5 5 5" />
          <path d="M5 20h14" />
        </svg>
        <span className="text-sm font-medium text-ink">Add photos</span>
        <span className="text-xs text-ink-soft">Up to {MAX_IMAGES} · JPG or PNG</span>
        <input
          type="file"
          accept="image/*"
          multiple
          disabled={busy}
          onChange={(e) => handleFiles(e.target.files)}
          className="sr-only"
        />
      </label>
      {busy && <p className="text-sm text-ink-soft">Uploading…</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap gap-3">
        {value.map((img, i) => (
          <div key={img.publicId || img.url} className="group relative">
            <Image
              src={img.url}
              alt=""
              width={84}
              height={84}
              className="h-21 w-21 rounded-xl object-cover ring-1 ring-line"
            />
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label="Remove image"
              className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-ink text-sm leading-none text-paper shadow-[var(--shadow-card)] transition-colors hover:bg-danger"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
