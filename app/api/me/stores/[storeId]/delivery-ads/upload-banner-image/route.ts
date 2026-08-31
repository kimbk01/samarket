import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import {
  extForCampaignImageMime,
  validateCampaignImageFile,
} from "@/lib/admin/notification-campaigns/validate-campaign-image";
import { getStoreIfOwner } from "@/lib/stores/owner-product-gate";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  bannerPixelGuideForInventory,
} from "@/lib/stores/advertising/delivery-ad-open-event-commercial";
import {
  isOwnerBannerInventoryKey,
  validateOwnerBannerCreativeAspect,
} from "@/lib/stores/advertising/owner-banner-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Same bucket as Admin banner finals; Owner path prefix isolates uploads. */
const BUCKET = "admin-notification-campaign-images";

/**
 * POST multipart `file` + `inventoryKey` — Owner Banner creative upload (mode A).
 * Returns storage path + dimensions for draft upsert.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ storeId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;

  const { storeId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  if (!sid) return NextResponse.json({ ok: false, error: "missing_store_id" }, { status: 400 });

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const gate = await getStoreIfOwner(sb, userId, sid);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  const svc = tryCreateSupabaseServiceClient();
  if (!svc) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_form" }, { status: 400 });
  }

  const inventoryRaw = String(form.get("inventoryKey") ?? form.get("inventory_key") ?? "").trim();
  if (!isOwnerBannerInventoryKey(inventoryRaw)) {
    return NextResponse.json({ ok: false, error: "invalid_inventory" }, { status: 400 });
  }

  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "file_required" }, { status: 400 });
  }

  const validated = validateCampaignImageFile(file);
  if (!validated.ok) {
    return NextResponse.json({ ok: false, error: validated.error }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  let width = 0;
  let height = 0;
  try {
    const meta = await sharp(buf, { failOn: "none", limitInputPixels: false })
      .rotate()
      .metadata();
    width = meta.width ?? 0;
    height = meta.height ?? 0;
  } catch {
    return NextResponse.json({ ok: false, error: "image_decode_failed" }, { status: 400 });
  }
  if (!(width > 0) || !(height > 0)) {
    return NextResponse.json({ ok: false, error: "invalid_dimensions" }, { status: 400 });
  }

  const aspect = validateOwnerBannerCreativeAspect({
    inventoryKey: inventoryRaw,
    sourceWidth: width,
    sourceHeight: height,
  });
  if (!aspect.ok) {
    return NextResponse.json({ ok: false, error: aspect.error }, { status: 400 });
  }

  const guide = bannerPixelGuideForInventory(inventoryRaw);
  if (guide && (width < guide.minWidth || height < guide.minHeight)) {
    return NextResponse.json(
      {
        ok: false,
        error: "below_min_pixels",
        minWidth: guide.minWidth,
        minHeight: guide.minHeight,
        width,
        height,
      },
      { status: 400 }
    );
  }

  const ext = extForCampaignImageMime(validated.mime);
  const campaignId = String(form.get("campaignId") ?? "").trim() || "draft";
  const path = `_owner/delivery-ads/banner/${sid}/${campaignId}/${userId}/${randomUUID()}.${ext}`;

  const { error: upErr } = await svc.storage.from(BUCKET).upload(path, buf, {
    contentType: validated.mime === "image/jpg" ? "image/jpeg" : validated.mime,
    upsert: false,
  });

  if (upErr) {
    const raw = String(upErr.message ?? "");
    if (/bucket not found/i.test(raw)) {
      return NextResponse.json({ ok: false, error: "storage_bucket_missing" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: upErr.message || "upload_failed" }, { status: 500 });
  }

  const {
    data: { publicUrl },
  } = svc.storage.from(BUCKET).getPublicUrl(path);

  return NextResponse.json({
    ok: true as const,
    url: publicUrl,
    path,
    width,
    height,
    inventoryKey: inventoryRaw,
  });
}
