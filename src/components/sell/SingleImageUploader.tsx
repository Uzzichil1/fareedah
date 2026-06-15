"use client";

import { useState } from "react";
import Image from "next/image";
import { createUploadSignature } from "@/app/sell/actions";

/**
 * Single-image upload control for an avatar or banner. Reuses the proven
 * signed-Cloudinary flow from `ImageUploader` (server-action signature → browser
 * POST), but holds exactly ONE url instead of an array. Shows the current image
 * with a remove button and a file input to upload/replace.
 */
export function SingleImageUploader({
  label,
  value,
  onChange,
  shape = "banner",
}: {
  label: string;
  value: string | null;
  onChange: (url: string | null) => void;
  shape?: "avatar" | "banner";
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      const file = files[0];
      const sig = await createUploadSignature();
      const form = new FormData();
      form.append("file", file);
      form.append("api_key", sig.apiKey);
      form.append("timestamp", String(sig.timestamp));
      form.append("folder", sig.folder);
      form.append("signature", sig.signature);
      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`,
        { method: "POST", body: form },
      );
      if (!res.ok) {
        setError("Upload failed. Check Cloudinary configuration.");
        return;
      }
      const data = (await res.json()) as { secure_url: string };
      onChange(data.secure_url);
    } finally {
      setBusy(false);
    }
  }

  const isAvatar = shape === "avatar";
  const previewClasses = isAvatar
    ? "h-24 w-24 rounded-full"
    : "h-32 w-full rounded-xl";

  return (
    <div className="flex flex-col gap-3">
      <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">
        {label}
      </span>

      {value ? (
        <div className="flex items-center gap-3">
          <div className={`group relative overflow-hidden ${previewClasses} ring-1 ring-line`}>
            <Image
              src={value}
              alt=""
              fill
              className="object-cover"
              sizes={isAvatar ? "96px" : "(max-width: 768px) 100vw, 600px"}
            />
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-ink-soft transition-colors hover:border-danger hover:text-danger"
          >
            Remove
          </button>
        </div>
      ) : null}

      <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line bg-paper/60 px-4 py-5 text-center transition-colors hover:border-rose-soft hover:bg-blush/30">
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
        <span className="text-sm font-medium text-ink">
          {value ? "Replace image" : "Upload image"}
        </span>
        <span className="text-xs text-ink-soft">JPG or PNG</span>
        <input
          type="file"
          accept="image/*"
          disabled={busy}
          onChange={(e) => handleFile(e.target.files)}
          className="sr-only"
        />
      </label>
      {busy && <p className="text-sm text-ink-soft">Uploading…</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
