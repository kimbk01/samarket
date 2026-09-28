/**
 * CUT 1A — measured transport constraints. Not a guessed product byte cap.
 *
 * Evidence (platform docs / library defaults, not invented 8MB policy):
 * - Vercel Serverless Function request body: 4.5 MB.
 *   Therefore the original image MUST NOT travel through a Next.js route body.
 *   CUT 1A uses createSignedUploadUrl → client PUT → Storage.
 * - Sharp default `limitInputPixels`: 268_402_689 (~16k×16k).
 *   Decode refuses above that. This is the image-processor ceiling, not a file-size policy.
 * - Bucket `file_size_limit`: live Storage default after migration (query, do not invent).
 *
 * Product MIME policy (not a byte policy): JPEG / PNG / WEBP only.
 * Empty files and magic-byte mismatch fail closed with document mutation = 0.
 */

export const VERCEL_FUNCTION_BODY_BYTES = 4_500_000;
export const SHARP_DEFAULT_LIMIT_INPUT_PIXELS = 268_402_689;

/** Why binary never enters Next request bodies. */
export const OPENING_SIGNED_UPLOAD_REASON =
  "Vercel function request body is 4.5MB; Opening originals go Storage via signed PUT.";
