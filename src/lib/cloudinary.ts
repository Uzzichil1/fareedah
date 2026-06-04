import { createHash } from "crypto";

/**
 * Cloudinary signed-upload signature: sort params by key, join as
 * `key=value&key=value`, append the API secret, SHA-1 (hex).
 * The params signed here MUST exactly match the params the client POSTs to
 * Cloudinary, or the upload fails with 401 Invalid Signature.
 */
export function buildUploadSignature(
  params: Record<string, string | number>,
  apiSecret: string,
): string {
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return createHash("sha1").update(toSign + apiSecret).digest("hex");
}
