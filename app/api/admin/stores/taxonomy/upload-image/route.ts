import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { internalErrorResponse } from "@/lib/security/internal-error-response";
import { bumpStorePublicSharedCacheGeneration } from "@/lib/stores/store-public-shared-cache-generation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "store-taxonomy-images";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

function extForMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  return "jpg";
}

/** 공개 URL → Storage object path (store-taxonomy-images 버킷) */
function objectPathFromPublicUrl(publicUrl: string): string | null {
  const u = publicUrl.trim();
  const m = u.match(/\/object\/public\/store-taxonomy-images\/(.+?)(?:\?|$)/i);
  if (!m?.[1]) return null;
  try {
    return decodeURIComponent(m[1].replace(/\/+$/, ""));
  } catch {
    return null;
  }
}

async function removePreviousIfOwned(
  sb: NonNullable<ReturnType<typeof tryGetSupabaseForStores>>,
  previousUrl: string | null | undefined
): Promise<void> {
  const u = typeof previousUrl === "string" ? previousUrl.trim() : "";
  if (!u) return;
  const path = objectPathFromPublicUrl(u);
  if (!path || !path.startsWith("_admin/store-taxonomy/")) return;
  const { error } = await sb.storage.from(BUCKET).remove([path]);
  if (error) {
    console.warn("[admin taxonomy upload-image remove prev]", path, error.message);
  }
}

/**
 * POST multipart: kind=category|topic|subtopic|menu|menu_feature, id, file
 * → Storage 업로드 후 store_categories/store_topics/store_subtopics.image_url · delivery_menus.icon_url 갱신
 */
export async function POST(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_form" }, { status: 400 });
  }

  const kindRaw = form.get("kind");
  const kind =
    kindRaw === "category" ||
    kindRaw === "topic" ||
    kindRaw === "subtopic" ||
    kindRaw === "menu" ||
    kindRaw === "menu_feature"
      ? kindRaw
      : null;
  const idRaw = form.get("id");
  const id = typeof idRaw === "string" ? idRaw.trim() : "";
  if (!kind || !id) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "file_required" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "file_too_large" }, { status: 413 });
  }
  const mime = (file.type || "").toLowerCase();
  if (!ALLOWED.has(mime)) {
    return NextResponse.json({ ok: false, error: "invalid_type" }, { status: 400 });
  }

  const ext = extForMime(mime);
  const path = `_admin/store-taxonomy/${kind}/${id}/${randomUUID()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, buf, {
    contentType: mime === "image/jpg" ? "image/jpeg" : mime,
    upsert: false,
  });

  if (upErr) {
    console.error("[admin taxonomy upload-image]", upErr);
    const raw = String(upErr.message ?? "");
    const bucketMissing =
      /bucket not found/i.test(raw) ||
      (raw.toLowerCase().includes("not found") && raw.toLowerCase().includes("bucket"));
    if (bucketMissing) {
      return NextResponse.json(
        {
          ok: false,
          error: "storage_bucket_missing",
          message: "Supabase에 버킷 store-taxonomy-images가 없거나 공개 읽기가 설정되지 않았습니다.",
        },
        { status: 503 }
      );
    }
    return internalErrorResponse("upload_failed", "[/api/admin/stores/taxonomy/upload-image POST]", upErr, 500);
  }

  const {
    data: { publicUrl },
  } = sb.storage.from(BUCKET).getPublicUrl(path);

  /** WP2 — 고객 메뉴 아이콘(`delivery_menus.icon_url`)도 같은 버킷·같은 교체 규칙 */
  const table =
    kind === "category"
      ? "store_categories"
      : kind === "topic"
        ? "store_topics"
        : kind === "menu" || kind === "menu_feature"
          ? "delivery_menus"
          : "store_subtopics";
  /** 배민 미러링 — 상단 탭 대표 카드 그림(`feature_image_url`)도 같은 버킷·교체 규칙 */
  const column = kind === "menu" ? "icon_url" : kind === "menu_feature" ? "feature_image_url" : "image_url";
  const { data: prevRow } = await sb.from(table).select(column).eq("id", id).maybeSingle();
  const prevUrl = ((prevRow as Record<string, string | null> | null)?.[column] ?? null) as string | null;

  const { data: updated, error: dbErr } = await sb
    .from(table)
    .update({ [column]: publicUrl })
    .eq("id", id)
    .select(`id, ${column}`)
    .maybeSingle();

  if (dbErr) {
    console.error("[admin taxonomy upload-image db]", dbErr);
    return internalErrorResponse("save_failed", "[/api/admin/stores/taxonomy/upload-image POST]", dbErr, 500);
  }
  if (!updated) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  /** v4 재감사 — 업종 이미지 변경을 고객 taxonomy 60s 캐시에 즉시 반영 (taxonomy PATCH 와 같은 세대 bump). */
  bumpStorePublicSharedCacheGeneration("store_taxonomy.upload_image");

  await appendAdminRouteAudit(gate.sb, req, {
    actorId: gate.actor.userId,
    targetType: table,
    targetId: id,
    action: "store_taxonomy.update",
    before: { image_url: prevUrl },
    after: { kind, image_url: publicUrl },
  });

  if (prevUrl && prevUrl !== publicUrl) {
    await removePreviousIfOwned(sb, prevUrl);
  }

  return NextResponse.json({ ok: true, kind, id, url: publicUrl });
}


/**
 * WP2 — 이미지 삭제: DELETE JSON { kind, id } → image_url(메뉴는 icon_url) 비움 + 버킷 원본 삭제(어드민 업로드분만).
 * 고객 화면은 이미지가 없으면 이름 첫 글자 타일로 표시 (기존 업종 아이콘 규칙).
 */
export async function DELETE(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { kind?: unknown; id?: unknown } | null;
  const kind =
    body?.kind === "category" ||
    body?.kind === "topic" ||
    body?.kind === "subtopic" ||
    body?.kind === "menu" ||
    body?.kind === "menu_feature"
      ? body.kind
      : null;
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  if (!kind || !id) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  const table =
    kind === "category"
      ? "store_categories"
      : kind === "topic"
        ? "store_topics"
        : kind === "menu" || kind === "menu_feature"
          ? "delivery_menus"
          : "store_subtopics";
  /** 배민 미러링 — 상단 탭 대표 카드 그림(`feature_image_url`)도 같은 버킷·교체 규칙 */
  const column = kind === "menu" ? "icon_url" : kind === "menu_feature" ? "feature_image_url" : "image_url";
  const { data: prevRow } = await sb.from(table).select(column).eq("id", id).maybeSingle();
  if (!prevRow) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const prevUrl = ((prevRow as Record<string, string | null>)[column] ?? null) as string | null;

  const { error: dbErr } = await sb.from(table).update({ [column]: null }).eq("id", id);
  if (dbErr) {
    return internalErrorResponse("save_failed", "[/api/admin/stores/taxonomy/upload-image DELETE]", dbErr, 500);
  }
  bumpStorePublicSharedCacheGeneration("store_taxonomy.delete_image");
  await appendAdminRouteAudit(gate.sb, req, {
    actorId: gate.actor.userId,
    targetType: table,
    targetId: id,
    action: "store_taxonomy.update",
    before: { [column]: prevUrl },
    after: { kind, [column]: null },
  });
  if (prevUrl) await removePreviousIfOwned(sb, prevUrl);
  return NextResponse.json({ ok: true, kind, id });
}
