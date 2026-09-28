import { randomUUID } from "crypto";
import { requireIntroAdminContext } from "@/lib/startup/intro-v2/admin-api-context";
import { INTRO_ADMIN_DEFAULT_TIMEZONE } from "@/lib/startup/intro-v2/admin-labels";
import { emptyIntroTargeting } from "@/lib/startup/intro-v2/admin-targeting-ui";
import {
  extractIntroV3Document,
  isIntroV3CampaignSource,
  parseIntroV3Document,
  type IntroV3Document,
} from "@/lib/startup/intro-v3/document";
import {
  INTRO_V3_SIGNED_UPLOAD_EXPIRES_SEC,
  INTRO_V3_SOURCE_FOLDER,
  INTRO_V3_STORAGE_BUCKET,
  INTRO_V3_DERIVATIVE_FOLDER,
  type IntroV3ProcessErrorCode,
} from "@/lib/startup/intro-v3/media-policy";
import type {
  IntroV3MediaDerivative,
  IntroV3MediaSource,
  IntroV3MediaStatus,
} from "@/lib/startup/intro-v3/media-types";
import { isIntroV3PersistableRef } from "@/lib/startup/intro-v3/persistable";
import { createIntroV3CampaignSource } from "@/lib/startup/intro-v3/seed";
import { validateIntroV3Document, validateIntroV3MediaReady } from "@/lib/startup/intro-v3/validation";

export { requireIntroAdminContext };

export type IntroV3AdminDb = {
  from: (table: string) => any;
  storage?: any;
};

export type IntroV3CampaignRow = {
  id: string;
  name: string;
  status: string;
  document: IntroV3Document;
  updatedAt: string;
};

function asSource(row: Record<string, unknown>): Record<string, unknown> {
  return row.source && typeof row.source === "object" && !Array.isArray(row.source)
    ? (row.source as Record<string, unknown>)
    : {};
}

export async function listIntroV3Campaigns(
  sb: IntroV3AdminDb
): Promise<{ ok: true; items: IntroV3CampaignRow[] } | { ok: false; error: string; httpStatus: number }> {
  const { data, error } = await sb
    .from("intro_campaigns")
    .select("id, name, status, source, updated_at")
    .order("updated_at", { ascending: false });
  if (error) return { ok: false, error: "list_failed", httpStatus: 500 };
  const items: IntroV3CampaignRow[] = [];
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const source = asSource(row);
    if (!isIntroV3CampaignSource(source)) continue;
    const document = extractIntroV3Document(source);
    if (!document) continue;
    items.push({
      id: String(row.id),
      name: String(row.name),
      status: String(row.status),
      document,
      updatedAt: String(row.updated_at ?? ""),
    });
  }
  return { ok: true, items };
}

export async function getIntroV3Campaign(
  sb: IntroV3AdminDb,
  id: string
): Promise<
  | { ok: true; campaign: IntroV3CampaignRow }
  | { ok: false; error: string; httpStatus: number }
> {
  const { data, error } = await sb
    .from("intro_campaigns")
    .select("id, name, status, source, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, error: "load_failed", httpStatus: 500 };
  if (!data) return { ok: false, error: "not_found", httpStatus: 404 };
  const source = asSource(data as Record<string, unknown>);
  if (!isIntroV3CampaignSource(source)) return { ok: false, error: "not_v3", httpStatus: 404 };
  const document = extractIntroV3Document(source);
  if (!document) return { ok: false, error: "invalid_document", httpStatus: 500 };
  return {
    ok: true,
    campaign: {
      id: String((data as { id: string }).id),
      name: String((data as { name: string }).name),
      status: String((data as { status: string }).status),
      document,
      updatedAt: String((data as { updated_at?: string }).updated_at ?? ""),
    },
  };
}

export async function peekIntroV3CampaignFlag(
  sb: IntroV3AdminDb,
  id: string
): Promise<{ introV3: boolean; exists: boolean }> {
  const { data } = await sb.from("intro_campaigns").select("id, source").eq("id", id).maybeSingle();
  if (!data) return { introV3: false, exists: false };
  return { introV3: isIntroV3CampaignSource(asSource(data as Record<string, unknown>)), exists: true };
}

export async function createIntroV3Campaign(
  sb: IntroV3AdminDb,
  input: { adminUserId: string; name: string }
): Promise<{ ok: true; id: string } | { ok: false; error: string; httpStatus: number }> {
  const name = String(input.name ?? "").trim() || "New intro V3";
  const source = createIntroV3CampaignSource({ sceneId: randomUUID() });
  const parsed = parseIntroV3Document((source as { v3?: unknown }).v3);
  if (!parsed) return { ok: false, error: "seed_invalid", httpStatus: 500 };
  const { data, error } = await sb
    .from("intro_campaigns")
    .insert({
      name,
      status: "draft",
      timezone: INTRO_ADMIN_DEFAULT_TIMEZONE,
      priority: 0,
      targeting: emptyIntroTargeting(),
      frequency_mode: "every_launch",
      deep_link_policy: "honor",
      requires_admin_confirmation: false,
      source,
      updated_by: input.adminUserId,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "create_failed", httpStatus: 500 };
  return { ok: true, id: String((data as { id: string }).id) };
}

export async function saveIntroV3Document(
  sb: IntroV3AdminDb,
  id: string,
  adminUserId: string,
  documentRaw: unknown,
  extra?: { name?: string }
): Promise<
  | { ok: true; campaign: IntroV3CampaignRow }
  | { ok: false; error: string; httpStatus: number; issues?: ReturnType<typeof validateIntroV3Document>["issues"] }
> {
  const current = await getIntroV3Campaign(sb, id);
  if (!current.ok) return current;
  const validated = validateIntroV3Document(documentRaw);
  if (!validated.ok || !validated.document) {
    return { ok: false, error: "invalid_document", httpStatus: 400, issues: validated.issues };
  }
  const { data: row } = await sb.from("intro_campaigns").select("source").eq("id", id).maybeSingle();
  const previous = asSource((row ?? {}) as Record<string, unknown>);
  const nextName = typeof extra?.name === "string" ? extra.name.trim() : "";
  const { error } = await sb
    .from("intro_campaigns")
    .update({
      ...(nextName ? { name: nextName } : {}),
      source: { ...previous, introV3: true, v3: validated.document },
      updated_by: adminUserId,
    })
    .eq("id", id);
  if (error) return { ok: false, error: "save_failed", httpStatus: 500 };
  const reloaded = await getIntroV3Campaign(sb, id);
  return reloaded;
}

function mapSourceRow(row: Record<string, unknown>): IntroV3MediaSource {
  return {
    id: String(row.id),
    filename: String(row.filename ?? ""),
    mime: String(row.mime ?? ""),
    width: row.width == null ? null : Number(row.width),
    height: row.height == null ? null : Number(row.height),
    aspect: row.aspect == null ? null : Number(row.aspect),
    bytes: row.bytes == null ? null : Number(row.bytes),
    orientationDeg: Number(row.orientation_deg ?? 0),
    storagePath: String(row.storage_path ?? ""),
    publicUrl: row.public_url == null ? null : String(row.public_url),
    status: String(row.status ?? "pending") as IntroV3MediaStatus,
    errorCode: (row.error_code as IntroV3ProcessErrorCode | null) ?? null,
    createdAt: String(row.created_at ?? ""),
  };
}

function mapDerivativeRow(row: Record<string, unknown>): IntroV3MediaDerivative {
  return {
    id: String(row.id),
    sourceId: String(row.source_id),
    kind: "STILL_RUNTIME",
    format: "webp",
    width: Number(row.width),
    height: Number(row.height),
    aspect: row.aspect == null ? null : Number(row.aspect),
    bytes: row.bytes == null ? null : Number(row.bytes),
    storagePath: String(row.storage_path ?? ""),
    publicUrl: row.public_url == null ? null : String(row.public_url),
    status: String(row.status ?? "pending") as IntroV3MediaStatus,
    revision: Number(row.revision ?? 1),
  };
}

export async function listIntroV3ReadyMedia(
  sb: IntroV3AdminDb
): Promise<
  | { ok: true; items: Array<{ source: IntroV3MediaSource; derivative: IntroV3MediaDerivative }> }
  | { ok: false; error: string; httpStatus: number }
> {
  const { data: derivatives, error } = await sb
    .from("intro_v3_media_derivatives")
    .select(
      "id, source_id, kind, format, width, height, aspect, bytes, storage_path, public_url, status, revision, created_at"
    )
    .eq("status", "ready")
    .eq("kind", "STILL_RUNTIME")
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) return { ok: false, error: "list_failed", httpStatus: 500 };
  const derRows = (derivatives ?? []) as Record<string, unknown>[];
  const sourceIds = [...new Set(derRows.map((d) => String(d.source_id)))];
  if (sourceIds.length === 0) return { ok: true, items: [] };
  const { data: sources, error: sourceError } = await sb
    .from("intro_v3_media_sources")
    .select(
      "id, filename, mime, width, height, aspect, bytes, orientation_deg, storage_path, public_url, status, error_code, created_at"
    )
    .in("id", sourceIds)
    .eq("status", "ready");
  if (sourceError) return { ok: false, error: "list_failed", httpStatus: 500 };
  const sourceById = new Map(
    ((sources ?? []) as Record<string, unknown>[]).map((s) => [String(s.id), mapSourceRow(s)])
  );
  const items: Array<{ source: IntroV3MediaSource; derivative: IntroV3MediaDerivative }> = [];
  for (const der of derRows) {
    const source = sourceById.get(String(der.source_id));
    if (!source) continue;
    const derivative = mapDerivativeRow(der);
    const ready = validateIntroV3MediaReady({
      sourceStatus: source.status,
      derivativeStatus: derivative.status,
      sourceRef: source.storagePath,
      derivativeRef: derivative.storagePath,
      derivativeExists: true,
    });
    if (!ready) continue;
    items.push({ source, derivative });
  }
  return { ok: true, items };
}

function sanitizeFilename(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80);
  return base || "upload.bin";
}

function extForMime(mime: string, filename: string): string {
  if (mime.includes("png") || filename.toLowerCase().endsWith(".png")) return "png";
  if (mime.includes("webp") || filename.toLowerCase().endsWith(".webp")) return "webp";
  return "jpg";
}

export async function signIntroV3SourceUpload(
  sb: IntroV3AdminDb,
  input: { adminUserId: string; filename: string; mime: string; bytes: number }
): Promise<
  | { ok: true; sourceId: string; path: string; signedUrl: string; token?: string }
  | { ok: false; error: string; httpStatus: number }
> {
  const storage = sb.storage?.from(INTRO_V3_STORAGE_BUCKET);
  if (!storage?.createSignedUploadUrl) {
    return { ok: false, error: "storage_failed", httpStatus: 503 };
  }
  const sourceId = randomUUID();
  const ext = extForMime(input.mime, input.filename);
  const path = `${INTRO_V3_SOURCE_FOLDER}/${input.adminUserId}/${sourceId}.${ext}`;
  if (!isIntroV3PersistableRef(path)) {
    return { ok: false, error: "storage_failed", httpStatus: 500 };
  }
  const signed = await storage.createSignedUploadUrl(path, { upsert: false });
  if (signed.error || !signed.data?.signedUrl) {
    return { ok: false, error: "storage_failed", httpStatus: 500 };
  }
  const { error } = await sb.from("intro_v3_media_sources").insert({
    id: sourceId,
    filename: sanitizeFilename(input.filename),
    mime: input.mime,
    bytes: input.bytes,
    storage_path: path,
    status: "pending",
    created_by: input.adminUserId,
  });
  if (error) return { ok: false, error: "asset_persistence_failed", httpStatus: 500 };
  return {
    ok: true,
    sourceId,
    path,
    signedUrl: signed.data.signedUrl,
    token: signed.data.token,
  };
}

export async function markIntroV3SourceFailed(
  sb: IntroV3AdminDb,
  sourceId: string,
  errorCode: IntroV3ProcessErrorCode
): Promise<void> {
  await sb
    .from("intro_v3_media_sources")
    .update({ status: "failed", error_code: errorCode })
    .eq("id", sourceId);
}

export async function persistIntroV3ProcessedStill(
  sb: IntroV3AdminDb,
  input: {
    sourceId: string;
    sourcePath: string;
    filename: string;
    mime: string;
    sourceBytes: number;
    sourceWidth: number;
    sourceHeight: number;
    orientationDeg: number;
    derivativeBuffer: Buffer;
    derivativeWidth: number;
    derivativeHeight: number;
    derivativeBytes: number;
  }
): Promise<
  | { ok: true; source: IntroV3MediaSource; derivative: IntroV3MediaDerivative }
  | { ok: false; error: IntroV3ProcessErrorCode; httpStatus: number }
> {
  const storage = sb.storage?.from(INTRO_V3_STORAGE_BUCKET);
  if (!storage) return { ok: false, error: "storage_failed", httpStatus: 503 };

  const sourcePublic = storage.getPublicUrl(input.sourcePath).data.publicUrl;
  if (!isIntroV3PersistableRef(input.sourcePath) || !isIntroV3PersistableRef(sourcePublic)) {
    await markIntroV3SourceFailed(sb, input.sourceId, "asset_persistence_failed");
    return { ok: false, error: "asset_persistence_failed", httpStatus: 500 };
  }

  const derivativeId = randomUUID();
  const derPath = `${INTRO_V3_DERIVATIVE_FOLDER}/${input.sourceId}/${derivativeId}.webp`;
  const uploaded = await storage.upload(derPath, input.derivativeBuffer, {
    contentType: "image/webp",
    upsert: false,
  });
  if (uploaded.error) {
    await markIntroV3SourceFailed(sb, input.sourceId, "derivative_failed");
    return { ok: false, error: "derivative_failed", httpStatus: 500 };
  }
  const derPublic = storage.getPublicUrl(derPath).data.publicUrl;
  if (!isIntroV3PersistableRef(derPath) || !isIntroV3PersistableRef(derPublic)) {
    await markIntroV3SourceFailed(sb, input.sourceId, "derivative_failed");
    return { ok: false, error: "derivative_failed", httpStatus: 500 };
  }

  const aspect = input.sourceWidth / input.sourceHeight;
  const derAspect = input.derivativeWidth / input.derivativeHeight;

  const { error: sourceError } = await sb
    .from("intro_v3_media_sources")
    .update({
      filename: sanitizeFilename(input.filename),
      mime: input.mime,
      width: input.sourceWidth,
      height: input.sourceHeight,
      aspect,
      bytes: input.sourceBytes,
      orientation_deg: input.orientationDeg,
      storage_path: input.sourcePath,
      public_url: sourcePublic,
      status: "ready",
      error_code: null,
    })
    .eq("id", input.sourceId);
  if (sourceError) {
    await markIntroV3SourceFailed(sb, input.sourceId, "asset_persistence_failed");
    return { ok: false, error: "asset_persistence_failed", httpStatus: 500 };
  }

  const { data: derRow, error: derError } = await sb
    .from("intro_v3_media_derivatives")
    .insert({
      id: derivativeId,
      source_id: input.sourceId,
      kind: "STILL_RUNTIME",
      format: "webp",
      width: input.derivativeWidth,
      height: input.derivativeHeight,
      aspect: derAspect,
      bytes: input.derivativeBytes,
      storage_path: derPath,
      public_url: derPublic,
      status: "ready",
      revision: 1,
    })
    .select(
      "id, source_id, kind, format, width, height, aspect, bytes, storage_path, public_url, status, revision"
    )
    .single();
  if (derError || !derRow) {
    await markIntroV3SourceFailed(sb, input.sourceId, "asset_persistence_failed");
    return { ok: false, error: "asset_persistence_failed", httpStatus: 500 };
  }

  const { data: sourceRow } = await sb
    .from("intro_v3_media_sources")
    .select(
      "id, filename, mime, width, height, aspect, bytes, orientation_deg, storage_path, public_url, status, error_code, created_at"
    )
    .eq("id", input.sourceId)
    .maybeSingle();
  if (!sourceRow) {
    await markIntroV3SourceFailed(sb, input.sourceId, "asset_persistence_failed");
    return { ok: false, error: "asset_persistence_failed", httpStatus: 500 };
  }

  const source = mapSourceRow(sourceRow as Record<string, unknown>);
  const derivative = mapDerivativeRow(derRow as Record<string, unknown>);
  const ready = validateIntroV3MediaReady({
    sourceStatus: source.status,
    derivativeStatus: derivative.status,
    sourceRef: source.storagePath,
    derivativeRef: derivative.storagePath,
    derivativeExists: true,
  });
  if (!ready) {
    await sb.from("intro_v3_media_derivatives").update({ status: "failed" }).eq("id", derivativeId);
    await markIntroV3SourceFailed(sb, input.sourceId, "asset_persistence_failed");
    return { ok: false, error: "asset_persistence_failed", httpStatus: 500 };
  }
  return { ok: true, source, derivative };
}

export async function loadIntroV3SourcePath(
  sb: IntroV3AdminDb,
  sourceId: string
): Promise<{ ok: true; path: string; filename: string; mime: string } | { ok: false; error: string }> {
  const { data } = await sb
    .from("intro_v3_media_sources")
    .select("id, storage_path, filename, mime, status")
    .eq("id", sourceId)
    .maybeSingle();
  if (!data) return { ok: false, error: "not_found" };
  return {
    ok: true,
    path: String((data as { storage_path: string }).storage_path),
    filename: String((data as { filename: string }).filename),
    mime: String((data as { mime: string }).mime),
  };
}

export { INTRO_V3_SIGNED_UPLOAD_EXPIRES_SEC };
