import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  mergeMemberNoticeListItems,
  type MemberNoticeListItem,
} from "@/lib/notifications/member-notices-ssot";
import { resolveAdminCampaignTypeFromPayload } from "@/lib/notifications/admin-campaign-inbox";
import { isInboxDismissedNotificationEvent } from "@/lib/notifications/inbox-events-merge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isMissingTableError(message: string): boolean {
  const lowered = message.toLowerCase();
  return lowered.includes("app_notices") && lowered.includes("does not exist");
}

export async function GET() {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: true, notices: [], source: "fallback" });
  }

  const board: MemberNoticeListItem[] = [];
  const { data: boardRows, error: boardError } = await sb
    .from("app_notices")
    .select("id, title, body, created_at")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(20);

  if (boardError) {
    if (!isMissingTableError(boardError.message ?? "")) {
      return NextResponse.json(
        { ok: false, error: boardError.message ?? "notices_fetch_failed" },
        { status: 500 }
      );
    }
  } else {
    for (const row of boardRows ?? []) {
      board.push({
        id: `board:${String(row.id ?? "")}`,
        title: String(row.title ?? ""),
        body: String(row.body ?? ""),
        createdAt: String(row.created_at ?? ""),
        source: "board",
        notificationId: null,
        campaignType: "notice",
        isRead: true,
      });
    }
  }

  const push: MemberNoticeListItem[] = [];
  const { data: eventRows, error: eventError } = await sb
    .from("notification_events")
    .select("id, title, body, created_at, read_at, type, category, display_payload")
    .eq("user_id", auth.userId)
    .eq("type", "admin_notice")
    .order("created_at", { ascending: false })
    .limit(40);

  if (!eventError) {
    for (const row of eventRows ?? []) {
      const displayPayload = row.display_payload;
      if (
        isInboxDismissedNotificationEvent({
          id: String(row.id ?? ""),
          type: "admin_notice",
          category: "admin_notice",
          title: String(row.title ?? ""),
          body: String(row.body ?? ""),
          display_payload: displayPayload,
          read_at: row.read_at == null ? null : String(row.read_at),
          created_at: String(row.created_at ?? ""),
          dedupe_key: "",
          room_id: "",
        })
      ) {
        continue;
      }
      const campaignType = resolveAdminCampaignTypeFromPayload(row.display_payload);
      if (campaignType === "marketing") continue;
      const id = String(row.id ?? "").trim();
      if (!id) continue;
      push.push({
        id: `push:${id}`,
        title: String(row.title ?? ""),
        body: String(row.body ?? ""),
        createdAt: String(row.created_at ?? ""),
        source: "push",
        notificationId: id,
        campaignType: campaignType === "system" ? "system" : "notice",
        isRead: row.read_at != null && String(row.read_at).trim() !== "",
      });
    }
  }

  const notices = mergeMemberNoticeListItems({ board, push, limit: 40 });
  return NextResponse.json({
    ok: true,
    notices,
    source: "ssot_v1",
  });
}
