import { createHash, randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type GenerationManifestR15,
  type StartupPresentationAssetManifestItemR15,
  type StartupPresentationDocumentR15,
  stableStringify,
} from "@/lib/startup-presentation/document";

export const R15_STARTUP_MEDIA_BUCKET = "r15-startup-media" as const;

export function sha256Hex(input: Buffer | string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hashStartupPresentationDocumentR15(
  document: StartupPresentationDocumentR15
): string {
  return sha256Hex(stableStringify(document));
}

export function hashGenerationManifestBodyR15(
  manifest: Omit<GenerationManifestR15, "integrity">
): string {
  return sha256Hex(stableStringify(manifest));
}

export function buildGenerationManifestR15(input: {
  generationId?: string;
  document: StartupPresentationDocumentR15;
  assetManifest: StartupPresentationAssetManifestItemR15[];
  createdAt: string;
  publishedAt: string;
}): GenerationManifestR15 {
  const body = {
    schemaVersion: 1 as const,
    generationId: input.generationId ?? randomUUID(),
    documentHash: hashStartupPresentationDocumentR15(input.document),
    document: input.document,
    assetManifest: input.assetManifest,
    createdAt: input.createdAt,
    publishedAt: input.publishedAt,
  };
  return {
    ...body,
    integrity: {
      algorithm: "sha256",
      manifestHash: hashGenerationManifestBodyR15(body),
    },
  };
}

export async function getPublicStorageUrl(
  sb: SupabaseClient<any>,
  path: string
): Promise<string> {
  const { data } = sb.storage.from(R15_STARTUP_MEDIA_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
