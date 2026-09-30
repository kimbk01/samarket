import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type GenerationManifestR15,
  type StartupPresentationAssetManifestItemR15,
  type StartupPresentationDocumentR15,
  createBootstrapStartupPresentationDocument,
  normalizeStartupPresentationDocument,
} from "@/lib/startup-presentation/document";
import {
  buildGenerationManifestR15,
  getPublicStorageUrl,
} from "@/lib/startup-presentation/server";

type StartupDocumentRow = {
  draft_document: unknown;
  draft_version: number;
  updated_at: string;
};

type StartupGenerationRow = {
  generation_id: string;
  manifest: unknown;
  published_at: string;
};

type StartupMediaRow = {
  asset_id: string;
  storage_path: string;
  public_url: string;
  mime_type: string;
  byte_length: number;
  sha256: string;
};

export async function loadR15StartupDraft(
  sb: SupabaseClient<any>
): Promise<{ ok: true; document: StartupPresentationDocumentR15; source: "db" | "bootstrap" } | { ok: false; error: string }> {
  const { data, error } = await sb
    .from("r15_startup_documents")
    .select("draft_document,draft_version,updated_at")
    .eq("id", true)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  const row = data as StartupDocumentRow | null;
  if (!row) {
    return { ok: true, document: createBootstrapStartupPresentationDocument(), source: "bootstrap" };
  }
  return {
    ok: true,
    document: normalizeStartupPresentationDocument(row.draft_document),
    source: "db",
  };
}

export async function saveR15StartupDraft(
  sb: SupabaseClient<any>,
  input: { document: StartupPresentationDocumentR15; userId: string }
): Promise<{ ok: true; document: StartupPresentationDocumentR15 } | { ok: false; error: string }> {
  const now = new Date().toISOString();
  const current = await loadR15StartupDraft(sb);
  const nextVersion = current.ok && current.source === "db" ? 2 : 1;
  const { error } = await sb.from("r15_startup_documents").upsert(
    {
      id: true,
      draft_document: input.document,
      draft_version: nextVersion,
      updated_by: input.userId,
      updated_at: now,
    },
    { onConflict: "id" }
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true, document: input.document };
}

export async function loadR15CurrentGeneration(
  sb: SupabaseClient<any>
): Promise<{ ok: true; manifest: GenerationManifestR15 | null } | { ok: false; error: string }> {
  const { data, error } = await sb
    .from("r15_startup_generations")
    .select("generation_id,manifest,published_at")
    .eq("is_current", true)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  const row = data as StartupGenerationRow | null;
  if (!row) return { ok: true, manifest: null };
  return { ok: true, manifest: row.manifest as GenerationManifestR15 };
}

export async function loadR15StartupAssetsById(
  sb: SupabaseClient<any>,
  assetIds: string[]
): Promise<
  | { ok: true; assets: StartupPresentationAssetManifestItemR15[] }
  | { ok: false; error: string }
> {
  if (assetIds.length === 0) return { ok: true, assets: [] };
  const { data, error } = await sb
    .from("r15_startup_media")
    .select("asset_id,storage_path,public_url,mime_type,byte_length,sha256")
    .in("asset_id", assetIds);
  if (error) return { ok: false, error: error.message };
  const rows = (data ?? []) as StartupMediaRow[];
  return {
    ok: true,
    assets: rows.map((row) => ({
      assetId: row.asset_id,
      storagePath: row.storage_path,
      publicUrl: row.public_url,
      mimeType: row.mime_type,
      byteLength: row.byte_length,
      sha256: row.sha256,
    })),
  };
}

export async function createR15StartupGeneration(
  sb: SupabaseClient<any>,
  input: { document: StartupPresentationDocumentR15; userId: string }
): Promise<{ ok: true; manifest: GenerationManifestR15 } | { ok: false; error: string }> {
  const logoAssetId = input.document.systemStart.logo.assetId;
  const assets = await loadR15StartupAssetsById(sb, logoAssetId ? [logoAssetId] : []);
  if (!assets.ok) return assets;
  if (logoAssetId && !assets.assets.some((asset) => asset.assetId === logoAssetId)) {
    return { ok: false, error: "logo_asset_missing" };
  }

  const now = new Date().toISOString();
  const manifest = buildGenerationManifestR15({
    document: input.document,
    assetManifest: assets.assets,
    createdAt: now,
    publishedAt: now,
  });

  const rewrittenAssets: StartupPresentationAssetManifestItemR15[] = [];
  for (const asset of manifest.assetManifest) {
    const ext = asset.storagePath.split(".").pop() || "bin";
    const toPath = `generations/${manifest.generationId}/${asset.assetId}.${ext}`;
    const { error: copyError } = await sb.storage
      .from("r15-startup-media")
      .copy(asset.storagePath, toPath);
    if (copyError && !/already exists/i.test(copyError.message ?? "")) {
      return { ok: false, error: copyError.message || "asset_copy_failed" };
    }
    rewrittenAssets.push({
      ...asset,
      storagePath: toPath,
      publicUrl: await getPublicStorageUrl(sb, toPath),
    });
  }

  const finalManifest = buildGenerationManifestR15({
    generationId: manifest.generationId,
    document: manifest.document,
    assetManifest: rewrittenAssets,
    createdAt: manifest.createdAt,
    publishedAt: manifest.publishedAt,
  });

  const { error: clearError } = await sb
    .from("r15_startup_generations")
    .update({ is_current: false })
    .eq("is_current", true);
  if (clearError) return { ok: false, error: clearError.message };

  const { error: insertError } = await sb.from("r15_startup_generations").insert({
    generation_id: finalManifest.generationId,
    document_hash: finalManifest.documentHash,
    manifest: finalManifest,
    created_by: input.userId,
    created_at: finalManifest.createdAt,
    published_at: finalManifest.publishedAt,
    is_current: true,
  });
  if (insertError) return { ok: false, error: insertError.message };
  return { ok: true, manifest: finalManifest };
}
