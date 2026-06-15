import { createUploadSignature } from "@/app/sell/actions";

/**
 * Upload a single file to Cloudinary using a server-signed request.
 *
 * Shared by `ImageUploader` (multi) and `SingleImageUploader` (avatar/banner).
 * Throws a clear Error on any failure (signature rejection, network, non-OK
 * response, JSON parse) so callers can surface a user-facing message — both
 * callers previously swallowed thrown errors and only handled `!res.ok`.
 *
 * IMPORTANT: the network call MUST stay
 *   POST https://api.cloudinary.com/v1_1/<cloudName>/image/upload
 * with FormData fields { file, api_key, timestamp, folder, signature }.
 * `e2e/seller.spec.ts` mocks this exact URL/shape — do not change it.
 */
export async function uploadToCloudinary(
  file: File,
): Promise<{ url: string; publicId: string }> {
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
    throw new Error(`Cloudinary upload failed with status ${res.status}`);
  }
  const data = (await res.json()) as { secure_url: string; public_id: string };
  return { url: data.secure_url, publicId: data.public_id };
}
