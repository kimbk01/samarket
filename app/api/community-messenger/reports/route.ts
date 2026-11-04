import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import { inferReportReasonCode } from "@/lib/reports/report-reason-code";
import { messengerRoomCanonicalOrJsonError } from "@/lib/community-messenger/server/messenger-room-canonical-resolve-api";
import {
  resolveMessengerReportTarget,
  type MessengerReportMessageRow,
  type MessengerReportType,
} from "@/lib/community-messenger/server/messenger-report-target";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPORT_TYPES = ["room", "message", "user"] as const;
const REASON_TYPES = [
  "abuse",
  "spam",
  "scam",
  "sexual",
  "hate",
  "threat",
  "impersonation",
  "stalking",
  "harassment",
  "privacy",
  "etc",
] as const;

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:report:${getRateLimitKey(req, auth.userId)}`,
    limit: 25,
    windowMs: 60_000,
    message: "신고 접수 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_report_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  let body: {
    reportType?: string;
    roomId?: string;
    messageId?: string;
    reportedUserId?: string;
    reasonType?: string;
    reasonDetail?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const reportType = String(body.reportType ?? "").trim();
  if (!REPORT_TYPES.includes(reportType as never)) {
    return NextResponse.json({ ok: false, error: "bad_report_type" }, { status: 400 });
  }

  const detail = typeof body.reasonDetail === "string" ? body.reasonDetail.trim().slice(0, 2000) : "";
  const inferred = inferReportReasonCode(detail || String(body.reasonType ?? "").trim());
  const reasonType = REASON_TYPES.includes(String(body.reasonType ?? "").trim() as never)
    ? String(body.reasonType).trim()
    : inferred === "fraud"
      ? "scam"
      : inferred === "spam" || inferred === "privacy"
        ? inferred
        : inferred === "harassment"
          ? "harassment"
          : "etc";

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const target = await resolveMessengerReportTarget(
    {
      reporterUserId: auth.userId,
      reportType: reportType as MessengerReportType,
      roomId: body.roomId,
      messageId: body.messageId,
      reportedUserId: body.reportedUserId,
    },
    {
      resolveMemberRoomId: async (userId, rawRoomId) => {
        const canon = await messengerRoomCanonicalOrJsonError(userId, rawRoomId);
        return canon.ok ? canon.canonicalRoomId : null;
      },
      loadMessage: async (roomId, messageId) => {
        const { data } = await (sb as any)
          .from("community_messenger_messages")
          .select("sender_id, deleted_at, deleted_for_everyone_at")
          .eq("id", messageId)
          .eq("room_id", roomId)
          .maybeSingle();
        return (data as MessengerReportMessageRow | null) ?? null;
      },
      hasParticipantRow: async (roomId, userId) => {
        const { data } = await (sb as any)
          .from("community_messenger_participants")
          .select("id")
          .eq("room_id", roomId)
          .eq("user_id", userId)
          .limit(1);
        return Array.isArray(data) && data.length > 0;
      },
      loadProfile: async (userId) => {
        const { data } = await (sb as any)
          .from("profiles")
          .select("id, status, deleted_at")
          .eq("id", userId)
          .maybeSingle();
        return data ?? null;
      },
    }
  );
  if (!target.ok) {
    return NextResponse.json({ ok: false, error: target.error }, { status: target.status });
  }

  const payload = {
    report_type: reportType,
    room_id: target.roomId,
    message_id: target.messageId,
    reported_user_id: target.reportedUserId,
    reporter_user_id: auth.userId,
    reason_type: reasonType,
    reason_detail: detail,
    status: "received",
  };

  const { data, error } = await (sb as any)
    .from("community_messenger_reports")
    .insert(payload)
    .select("id")
    .single();
  if (error) {
    return NextResponse.json({ ok: false, error: "report_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, reportId: data.id as string });
}
