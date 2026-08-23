import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { getStoreIfOwner } from "@/lib/stores/owner-product-gate";
import { parseNoticeImages } from "@/lib/stores/store-banners-notices-public";
import { revalidateStoreConsumerPathsBySlug } from "@/lib/stores/revalidate-store-consumer-paths";
import {
  collectCanonicalImagePublicUrls,
  diffRemovedImageUrls,
  removeCanonicalImagesFromPublicUrls,
} from "@/lib/media/canonical-image-lifecycle.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PLACEMENTS = new Set(["store_top", "menu_top", "review_top", "info_tab"]);

async function resolveSlug(sb: ReturnType<typeof tryGetSupabaseForStores>, storeId: string): Promise<string | null> {
  if (!sb) return null;
  const { data } = await sb.from("stores").select("slug").eq("id", storeId).maybeSingle();
  const s = data && typeof (data as { slug?: string }).slug === "string" ? (data as { slug: string }).slug.trim() : "";
  return s || null;
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ storeId: string; noticeId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;

  const { storeId, noticeId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  const nid = typeof noticeId === "string" ? noticeId.trim() : "";
  if (!sid || !nid) return NextResponse.json({ ok: false, error: "missing_param" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const gate = await getStoreIfOwner(sb, userId, sid);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  const { data: existing, error: findErr } = await sb
    .from("store_notices")
    .select("id, images_json")
    .eq("id", nid)
    .eq("store_id", sid)
    .maybeSingle();
  if (findErr || !existing) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const patch: Record<string, unknown> = {};
  if (body.title !== undefined) {
    const t = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
    if (!t) return NextResponse.json({ ok: false, error: "title_empty" }, { status: 400 });
    patch.title = t;
  }
  if (body.body !== undefined) {
    patch.body = typeof body.body === "string" ? body.body.trim().slice(0, 8000) : "";
  }
  if (body.images_json !== undefined) {
    patch.images_json = parseNoticeImages(body.images_json);
  }
  if (body.placement !== undefined) {
    const p = String(body.placement).trim();
    if (!PLACEMENTS.has(p)) return NextResponse.json({ ok: false, error: "invalid_placement" }, { status: 400 });
    patch.placement = p;
  }
  if (body.sort_order !== undefined) {
    const n = Number(body.sort_order);
    patch.sort_order = Number.isFinite(n) ? Math.max(0, Math.min(9999, Math.floor(n))) : 0;
  }
  if (body.is_active !== undefined) patch.is_active = !!body.is_active;
  if (body.start_at !== undefined) {
    patch.start_at = typeof body.start_at === "string" && body.start_at.trim() ? body.start_at.trim() : null;
  }
  if (body.end_at !== undefined) {
    patch.end_at = typeof body.end_at === "string" && body.end_at.trim() ? body.end_at.trim() : null;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "empty_patch" }, { status: 400 });
  }

  const { error: upErr } = await sb.from("store_notices").update(patch).eq("id", nid).eq("store_id", sid);
  if (upErr) {
    console.error("[PATCH store_notices]", upErr);
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  }

  if (body.images_json !== undefined) {
    const before = parseNoticeImages((existing as { images_json?: unknown }).images_json);
    const after = parseNoticeImages(patch.images_json);
    const removed = diffRemovedImageUrls(before, after);
    if (removed.length > 0) {
      const removal = await removeCanonicalImagesFromPublicUrls({
        sb,
        urls: removed,
        context: "owner/notice/replace-image",
      });
      if (removal.failed.length > 0) {
        console.error("[PATCH store_notices] storage cleanup partial failure", removal.failed);
      }
    }
  }

  const slug = await resolveSlug(sb, sid);
  if (slug) revalidateStoreConsumerPathsBySlug(slug);

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ storeId: string; noticeId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;

  const { storeId, noticeId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  const nid = typeof noticeId === "string" ? noticeId.trim() : "";
  if (!sid || !nid) return NextResponse.json({ ok: false, error: "missing_param" }, { status: 400 });

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const gate = await getStoreIfOwner(sb, userId, sid);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  const { data: row } = await sb
    .from("store_notices")
    .select("images_json")
    .eq("id", nid)
    .eq("store_id", sid)
    .maybeSingle();

  const { error: delErr } = await sb.from("store_notices").delete().eq("id", nid).eq("store_id", sid);
  if (delErr) return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 });

  const urls = collectCanonicalImagePublicUrls(parseNoticeImages((row as { images_json?: unknown } | null)?.images_json));
  if (urls.length > 0) {
    const removal = await removeCanonicalImagesFromPublicUrls({
      sb,
      urls,
      context: "owner/notice/hard-delete",
    });
    if (removal.failed.length > 0) {
      console.error("[DELETE store_notices] storage cleanup partial failure", removal.failed);
    }
  }

  const slug = await resolveSlug(sb, sid);
  if (slug) revalidateStoreConsumerPathsBySlug(slug);

  return NextResponse.json({ ok: true });
}
