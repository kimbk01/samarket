import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  extForCampaignImageMime,
  validateCampaignImageFile,
} from "@/lib/admin/notification-campaigns/validate-campaign-image";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { isOwnerEditableEventPromoRequest } from "@/lib/platform-event-owner-requests/lifecycle";
import {
  mapPlatformEventOwnerRequestDbRow,
  PLATFORM_EVENT_OWNER_REQUEST_TABLE,
  type PlatformEventOwnerRequestDbRow,
} from "@/lib/platform-event-owner-requests/map-row";
import { updateOwnerEventPromoDraft } from "@/lib/platform-event-owner-requests/owner-writer";
import {
  PLATFORM_EVENT_MEDIA_BUCKET,
  PLATFORM_EVENT_MEDIA_MAX_BYTES,
} from "@/lib/platform-events/media";
import { getStoreIfOwner } from "@/lib/stores/owner-product-gate";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Owner request hero upload — same validateCampaignImageFile + platform-event-media bucket.
 * Ownership via getStoreIfOwner; never trusts client storeId alone.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ requestId: string }> }
): Promise<NextResponse> {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const { requestId } = await ctx.params;
  const { data, error } = await sb
    .from(PLATFORM_EVENT_OWNER_REQUEST_TABLE)
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const row = mapPlatformEventOwnerRequestDbRow(data as PlatformEventOwnerRequestDbRow);
  if (row.ownerUserId !== userId) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  if (!isOwnerEditableEventPromoRequest(row.requestStatus)) {
    return NextResponse.json({ ok: false, error: "not_editable" }, { status: 409 });
  }

  const owned = await getStoreIfOwner(sb, userId, row.storeId);
  if (!owned.ok) {
    return NextResponse.json({ ok: false, error: owned.error }, { status: owned.status });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_form" }, { status: 400 });
  }

  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "file_required" }, { status: 400 });
  }

  const validated = validateCampaignImageFile(file, {
    maxBytes: PLATFORM_EVENT_MEDIA_MAX_BYTES,
  });
  if (!validated.ok) {
    return NextResponse.json({ ok: false, error: validated.error }, { status: 400 });
  }

  const ext = extForCampaignImageMime(validated.mime);
  const path = `owner-requests/${requestId}/${userId}/${randomUUID()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await sb.storage.from(PLATFORM_EVENT_MEDIA_BUCKET).upload(path, buf, {
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
  } = sb.storage.from(PLATFORM_EVENT_MEDIA_BUCKET).getPublicUrl(path);

  const updated = await updateOwnerEventPromoDraft(sb, {
    ownerUserId: userId,
    requestId,
    patch: { heroImageUrl: publicUrl, heroImagePath: path },
  });
  if (!updated.ok) {
    return NextResponse.json(
      { ok: false, error: updated.error },
      { status: updated.httpStatus }
    );
  }

  return NextResponse.json({
    ok: true as const,
    request: updated.request,
    url: publicUrl,
    path,
  });
}
