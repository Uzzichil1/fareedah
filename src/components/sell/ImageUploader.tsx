"use client";

import { useState } from "react";
import Image from "next/image";
import { createUploadSignature } from "@/app/sell/actions";

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
    try {
      const next = [...value];
      for (const file of Array.from(files)) {
        if (next.length >= MAX_IMAGES) {
          setError(`Up to ${MAX_IMAGES} images.`);
          break;
        }
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
          break;
        }
        const data = (await res.json()) as { secure_url: string; public_id: string };
        next.push({ url: data.secure_url, publicId: data.public_id, position: next.length });
      }
      onChange(next.map((img, i) => ({ ...img, position: i })));
    } finally {
      setBusy(false);
    }
  }

  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index).map((img, i) => ({ ...img, position: i })));
  }

  return (
    <div className="flex flex-col gap-2">
      <input type="file" accept="image/*" multiple disabled={busy} onChange={(e) => handleFiles(e.target.files)} />
      {busy && <p className="text-sm text-zinc-500">Uploading…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {value.map((img, i) => (
          <div key={img.publicId || img.url} className="relative">
            <Image src={img.url} alt="" width={80} height={80} className="rounded object-cover" />
            <button
              type="button"
              onClick={() => remove(i)}
              className="absolute -right-2 -top-2 rounded-full bg-zinc-900 px-1 text-xs text-white"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
