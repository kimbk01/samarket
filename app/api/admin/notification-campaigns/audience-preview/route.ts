import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { previewCampaignAudience } from "@/lib/admin/notification-campaigns/campaign-audience-preview";
import { CAMPAIGN_CHANNELS, type CampaignChannel } from "@/lib/admin/notification-campaigns/campaign-types";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES = new Set(["notice", "marketing", "system"]);
const TARGETS = new Set(["all", "selected_users", "marketing_opt_in", "active_users", "region"]);

type Body = {
  type?: unknown;
  target_type?: unknown;
  channel?: unknown;
  segment_region_code?: unknown;
  target_user_ids?: unknown;
};

/** POST — audience counts using the same target resolver as send. */
export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const svc = tryCreateSupabaseServiceClient();
  if (!svc) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const typ = typeof body.type === "string" ? body.type.trim() : "";
  const targetType = typeof body.target_type === "string" ? body.target_type.trim() : "all";
  const channelRaw = typeof body.channel === "string" ? body.channel.trim() : "push_and_in_app";
  const channel = (CAMPAIGN_CHANNELS as readonly string[]).includes(channelRaw)
    ? (channelRaw as CampaignChannel)
    : "push_and_in_app";

  if (!TYPES.has(typ)) {
    return NextResponse.json({ ok: false, error: "invalid_fields" }, { status: 400 });
  }
  if (targetType === "segment") {
    return NextResponse.json(
      {
        ok: false,
        error: "segment_unsupported",
        message: "Segment targeting is not supported yet. Choose another audience.",
      },
      { status: 400 }
    );
  }
  if (!TARGETS.has(targetType)) {
    return NextResponse.json({ ok: false, error: "invalid_target_type" }, { status: 400 });
  }

  const target_user_ids = Array.isArray(body.target_user_ids)
    ? body.target_user_ids.map((x) => String(x).trim()).filter(Boolean).slice(0, 5000)
    : [];

  const preview = await previewCampaignAudience(svc, {
    type: typ as "notice" | "marketing" | "system",
    target_type: targetType,
    channel,
    segment_region_code:
      typeof body.segment_region_code === "string" ? body.segment_region_code.trim() : null,
    target_user_ids,
  });

  return NextResponse.json({ ok: true, audience: preview });
}
