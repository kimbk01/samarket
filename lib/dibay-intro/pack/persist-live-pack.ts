import { readFileSync } from "node:fs";
import { join } from "node:path";
import { collectMediaIds } from "@/lib/dibay-intro/document";
import { computeEngineSourceHash } from "@/lib/dibay-intro/engine/hash";
import { DIBAY_INTRO_ALLOWED_MIME, DIBAY_INTRO_MEDIA_BUCKET } from "@/lib/dibay-intro/media-store";
import { buildSealedIntroPack } from "@/lib/dibay-intro/pack/build-pack";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { loadLiveRevision } from "@/lib/dibay-intro/admin-store";

/** Prebuilt by `node scripts/bundle-dibay-intro-engine.mjs` — never import esbuild from App Routes. */
export const DIBAY_INTRO_ENGINE_BUNDLE_REL =
  "lib/dibay-intro/engine/runtime-bundle.iife.js" as const;

function svc() {
  const client = tryCreateSupabaseServiceClient();
  if (!client) throw new Error("service_unavailable");
  return client;
}

function loadEngineJs(): Buffer {
  const path = join(process.cwd(), DIBAY_INTRO_ENGINE_BUNDLE_REL);
  try {
    const bytes = readFileSync(path);
    if (!bytes.byteLength) throw new Error("engine_bundle_empty");
    return bytes;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "engine_bundle_missing";
    throw new Error(`engine_bundle_unavailable:${reason}`);
  }
}

function pretendardBytes(): Buffer {
  return readFileSync(
    join(process.cwd(), "node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2"),
  );
}

export async function persistLiveIntroPack(): Promise<{ revisionId: string; engineHash: string }> {
  const live = await loadLiveRevision();
  if (!live) throw new Error("not_live");
  const db = svc();
  const ids = collectMediaIds(live.document);
  const mediaInputs: Array<{ id: string; mime: string; animated: boolean; bytes: Buffer; ext: string }> = [];
  if (ids.length) {
    const { data: rows, error } = await db
      .from("dibay_intro_media")
      .select("id,mime,animated,runtime_path,status")
      .in("id", ids);
    if (error) throw new Error(error.message);
    for (const id of ids) {
      const row = (rows ?? []).find((item) => item.id === id);
      if (!row || row.status !== "ready" || typeof row.runtime_path !== "string") {
        throw new Error(`pack_media_not_ready:${id}`);
      }
      const mime = String(row.mime) as keyof typeof DIBAY_INTRO_ALLOWED_MIME;
      const downloaded = await db.storage.from(DIBAY_INTRO_MEDIA_BUCKET).download(row.runtime_path);
      if (downloaded.error || !downloaded.data) throw new Error(`pack_media_download:${id}`);
      mediaInputs.push({
        id,
        mime,
        animated: Boolean(row.animated),
        bytes: Buffer.from(await downloaded.data.arrayBuffer()),
        ext: DIBAY_INTRO_ALLOWED_MIME[mime],
      });
    }
  }
  const engineJs = loadEngineJs();
  const engineHash = computeEngineSourceHash();
  const packed = buildSealedIntroPack({
    introId: live.introId,
    revisionId: live.revisionId,
    document: live.document,
    engineJs,
    engineHash,
    fontBytes: pretendardBytes(),
    media: mediaInputs,
  });
  const prefix = `packs/${live.revisionId}`;
  for (const [rel, bytes] of packed.files) {
    const uploaded = await db.storage.from(DIBAY_INTRO_MEDIA_BUCKET).upload(`${prefix}/${rel}`, bytes, {
      upsert: true,
      contentType: rel.endsWith(".json")
        ? "application/json"
        : rel.endsWith(".js")
          ? "text/javascript"
          : rel.endsWith(".html")
            ? "text/html"
            : rel.endsWith(".woff2")
              ? "font/woff2"
              : "application/octet-stream",
    });
    if (uploaded.error) throw new Error(uploaded.error.message);
  }
  return { revisionId: live.revisionId, engineHash };
}

export async function signedLivePackFiles(): Promise<{
  revisionId: string;
  engineHash: string;
  files: Array<{ path: string; url: string }>;
} | null> {
  const live = await loadLiveRevision();
  if (!live) return null;
  const db = svc();
  const prefix = `packs/${live.revisionId}`;
  const listed = await db.storage.from(DIBAY_INTRO_MEDIA_BUCKET).list(prefix, { limit: 100 });
  if (listed.error) throw new Error(listed.error.message);
  const files: Array<{ path: string; url: string }> = [];
  const walk = listed.data ?? [];
  for (const entry of walk) {
    if (entry.id == null && entry.name) {
      const nested = await db.storage.from(DIBAY_INTRO_MEDIA_BUCKET).list(`${prefix}/${entry.name}`, { limit: 100 });
      for (const child of nested.data ?? []) {
        const path = `${prefix}/${entry.name}/${child.name}`;
        const signed = await db.storage.from(DIBAY_INTRO_MEDIA_BUCKET).createSignedUrl(path, 3600);
        if (signed.data?.signedUrl) files.push({ path: `${entry.name}/${child.name}`, url: signed.data.signedUrl });
      }
      continue;
    }
    const path = `${prefix}/${entry.name}`;
    const signed = await db.storage.from(DIBAY_INTRO_MEDIA_BUCKET).createSignedUrl(path, 3600);
    if (signed.data?.signedUrl) files.push({ path: entry.name, url: signed.data.signedUrl });
  }
  const { data: rev } = await db
    .from("dibay_intro_revisions")
    .select("engine_hash")
    .eq("id", live.revisionId)
    .maybeSingle();
  return {
    revisionId: live.revisionId,
    engineHash: String(rev?.engine_hash ?? live.checksum),
    files,
  };
}
