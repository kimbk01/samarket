import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { ensureCampaignTargetsForSelectedUsers } from "@/lib/admin/notification-campaigns/run-campaign-send-batch";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES = new Set(["notice", "marketing", "system"]);
const TARGETS = new Set(["all", "selected_users", "segment", "marketing_opt_in", "active_users", "region"]);

/** GET — 목록 */
export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const svc = tryCreateSupabaseServiceClient();
  if (!svc) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status")?.trim();
  const type = searchParams.get("type")?.trim();
  const qTitle = searchParams.get("q")?.trim();

  let query = svc
    .from("admin_notification_campaigns")
    .select("id, title, body, type, target_type, status, scheduled_at, sent_at, created_by, created_at, updated_at");

  if (status && status !== "all") {
    query = query.eq("status", status);
  }
  if (type && type !== "all") {
    query = query.eq("type", type);
  }
  if (qTitle) {
    query = query.ilike("title", `%${qTitle.slice(0, 80)}%`);
  }
  query = query.order("created_at", { ascending: false }).limit(200);

  const { data, error } = await query;
  if (error) {
    if (error.message?.includes("does not exist")) {
      return NextResponse.json({ ok: true, campaigns: [], table_missing: true });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, campaigns: data ?? [] });
}

type CreateBody = {
  title?: unknown;
  body?: unknown;
  type?: unknown;
  target_type?: unknown;
  target_url?: unknown;
  image_url?: unknown;
  scheduled_at?: unknown;
  segment_region_code?: unknown;
  status?: unknown;
  target_user_ids?: unknown;
};

/** POST — 생성 (임시저장 draft) */
export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const svc = tryCreateSupabaseServiceClient();
  if (!svc) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });
  }

  let body: CreateBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const content = typeof body.body === "string" ? body.body.trim() : "";
  const typ = typeof body.type === "string" ? body.type.trim() : "";
  const targetType = typeof body.target_type === "string" ? body.target_type.trim() : "all";

  if (!title || !content || !TYPES.has(typ)) {
    return NextResponse.json({ ok: false, error: "invalid_fields" }, { status: 400 });
  }
  if (!TARGETS.has(targetType)) {
    return NextResponse.json({ ok: false, error: "invalid_target_type" }, { status: 400 });
  }

  const target_url =
    typeof body.target_url === "string" && body.target_url.trim() ? body.target_url.trim().slice(0, 2000) : null;
  const image_url =
    typeof body.image_url === "string" && body.image_url.trim() ? body.image_url.trim().slice(0, 2000) : null;
  const scheduled_at =
    typeof body.scheduled_at === "string" && body.scheduled_at.trim() ? body.scheduled_at.trim() : null;
  const segment_region_code =
    typeof body.segment_region_code === "string" && body.segment_region_code.trim()
      ? body.segment_region_code.trim().slice(0, 32)
      : null;

  const initialStatus =
    typeof body.status === "string" && body.status === "scheduled" && scheduled_at ? "scheduled" : "draft";

  const insertRow = {
    title,
    body: content,
    type: typ,
    target_type: targetType,
    target_url,
    image_url,
    scheduled_at: initialStatus === "scheduled" ? scheduled_at : null,
    segment_region_code: targetType === "region" ? segment_region_code : null,
    status: initialStatus,
    created_by: admin.userId,
    send_progress_offset: 0,
    updated_at: new Date().toISOString(),
  };

  const { data: row, error } = await svc.from("admin_notification_campaigns").insert(insertRow).select("id").maybeSingle();

  if (error) {
    if (error.message?.includes("does not exist")) {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const campaignId = String((row as { id?: string })?.id ?? "");
  if (targetType === "selected_users" && Array.isArray(body.target_user_ids) && campaignId) {
    const ids = body.target_user_ids
      .map((x) => String(x).trim())
      .filter(Boolean)
      .slice(0, 5000);
    await ensureCampaignTargetsForSelectedUsers(svc, campaignId, ids);
  }

  return NextResponse.json({ ok: true, id: campaignId });
}
