/**
 * 어드민 광고 삭제·삭제 취소 서버 처리 (설계 §3-2 · §4 · R2 · 2026-11-07) — `POST /api/admin/ads/delete` · `undelete` 공용.
 * 권한 = 권한 표(`adminAdKindWriteRequirement`) · 사유 필수(2자) · 처리 = DB 함수 1번(한 트랜잭션 · 감사 1행).
 * 응답 오류는 코드 + 한국어 문구만 (DB 원문은 서버 로그만).
 */
import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdminApiActor, type AdminApiActor } from "@/lib/admin/require-admin-permission";
import { permissionKeyAllowed } from "@/lib/admin/admin-user-server";
import {
  adminAdKindWritePermissionKey,
  isAdminAdDeleteKind,
  type AdminAdDeleteKind,
} from "@/lib/admin/access/admin-ads-authority";
import { parseAdminReason } from "@/lib/admin/operator-ux/admin-reason";
import {
  adminAdDeleteErrorMessageKey,
  adminAdDeleteErrorStatus,
  parseAdminAdDeletePlan,
} from "@/lib/admin/ads-delete/admin-ad-delete-contract";
import { translate } from "@/lib/i18n/messages";
import { notifyCommunityPromotionEnded } from "@/lib/notifications/notify-community-moderation";
import { notifyTradePromotionDecision } from "@/lib/notifications/notify-trade-moderation";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function adminAdDeleteError(code: string, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json(
    { ok: false, error: code, message: translate("ko", adminAdDeleteErrorMessageKey(code)), ...(extra ?? {}) },
    { status: adminAdDeleteErrorStatus(code) }
  );
}

type ParsedBody = { kind: AdminAdDeleteKind; id: string; reason: string; raw: Record<string, unknown> };

export async function parseAdminAdDeleteBody(req: Request): Promise<ParsedBody | NextResponse> {
  const raw = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!raw || typeof raw !== "object") return adminAdDeleteError("invalid_json");
  if (!isAdminAdDeleteKind(raw.kind)) return adminAdDeleteError("invalid_kind");
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!UUID_RE.test(id)) return adminAdDeleteError("invalid_id");
  const reason = parseAdminReason(raw.reason);
  if (!reason) return adminAdDeleteError("reason_required");
  return { kind: raw.kind, id, reason, raw };
}

/** 사장님 팝업인지 — 권한 표에서 사장님 팝업은 business. 조회에 실패하면 null(= 처리하지 않고 막는다). */
async function isOwnerPopup(sb: SupabaseClient, id: string): Promise<boolean | null> {
  const { data, error } = await sb
    .from("platform_popup_campaigns")
    .select("owner_store_id, owner_request_id")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[admin/ads/delete] popup owner lookup failed", error.message);
    return null;
  }
  if (!data) return false;
  const row = data as { owner_store_id?: string | null; owner_request_id?: string | null };
  return Boolean(row.owner_store_id || row.owner_request_id);
}

/** 권한 표 가드 — 통과하면 actor·sb. */
export async function requireAdminAdKindWriter(
  kind: AdminAdDeleteKind,
  id: string
): Promise<{ ok: true; actor: AdminApiActor; sb: SupabaseClient } | { ok: false; response: NextResponse }> {
  const base = await requireAdminApiActor();
  if (!base.ok) return base;
  let ownerPopup = false;
  if (kind === "popup_campaign") {
    const owner = await isOwnerPopup(base.sb, id);
    if (owner == null) return { ok: false, response: adminAdDeleteError("delete_check_failed") };
    ownerPopup = owner;
  }
  const key = adminAdKindWritePermissionKey(kind, { ownerPopup });
  if (!base.actor.isSuperAdmin && !permissionKeyAllowed(base.actor.permissions, key)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          error: "forbidden_permission",
          permission: key,
          message: translate("ko", "admin_ad_delete_err_forbidden"),
        },
        { status: 403 }
      ),
    };
  }
  return base;
}

function faultFromBody(raw: Record<string, unknown>): "operator" | "advertiser" | null {
  return raw.fault === "operator" || raw.fault === "advertiser" ? raw.fault : null;
}

export async function handleAdminAdDelete(req: Request): Promise<NextResponse> {
  const parsed = await parseAdminAdDeleteBody(req);
  if (parsed instanceof NextResponse) return parsed;
  const gate = await requireAdminAdKindWriter(parsed.kind, parsed.id);
  if (!gate.ok) return gate.response;
  if (parsed.raw.fault != null && faultFromBody(parsed.raw) == null) return adminAdDeleteError("invalid_fault");

  const preview = parsed.raw.preview === true;
  const { data, error } = await gate.sb.rpc("admin_ad_delete", {
    p_kind: parsed.kind,
    p_id: parsed.id,
    p_admin: gate.actor.userId,
    p_reason: parsed.reason,
    p_fault: faultFromBody(parsed.raw),
    p_preview: preview,
  });
  if (error) {
    // 종료 단계 실패는 DB 가 예외로 전부 되돌린다(admin_ad_delete_end_failed) — 원문은 로그만.
    console.error("[admin/ads/delete] rpc failed", error.message);
    return adminAdDeleteError(String(error.message ?? "").includes("admin_ad_delete_end_failed") ? "end_failed" : "delete_failed");
  }
  const out = (data ?? {}) as Record<string, unknown>;
  if (out.ok !== true) {
    const code = typeof out.error === "string" ? out.error : "delete_failed";
    return adminAdDeleteError(code, code === "fault_required" ? { needsFault: true } : undefined);
  }
  const plan = parseAdminAdDeletePlan(out);
  // 상위노출 종료 알림 — 도메인 종료(거래 runTradePromotionAction · 커뮤니티 runCommunityPromotionOrderAction)와 같이 커밋 뒤 웹이 보낸다.
  if (!preview && plan.mode === "end_and_soft" && (parsed.kind === "community_promotion" || parsed.kind === "trade_promotion")) {
    try {
      const { data: order } = await gate.sb
        .from("point_promotion_orders")
        .select("user_id")
        .eq("id", parsed.id)
        .maybeSingle();
      const userId = (order as { user_id?: string } | null)?.user_id ?? null;
      const refundPoints = plan.refundUnit === "point" ? plan.refundAmount : 0;
      if (parsed.kind === "community_promotion") {
        await notifyCommunityPromotionEnded(gate.sb, { userId, orderId: parsed.id, refundPoints, reason: parsed.reason });
      } else {
        await notifyTradePromotionDecision(gate.sb, {
          userId,
          orderId: parsed.id,
          kind: "ended",
          points: refundPoints,
          reason: parsed.reason,
        });
      }
    } catch (e) {
      console.error("[admin/ads/delete] promotion end notify", e);
    }
  }
  return NextResponse.json({ ok: true, preview, kind: parsed.kind, id: parsed.id, plan });
}

export async function handleAdminAdUndelete(req: Request): Promise<NextResponse> {
  const parsed = await parseAdminAdDeleteBody(req);
  if (parsed instanceof NextResponse) return parsed;
  const gate = await requireAdminAdKindWriter(parsed.kind, parsed.id);
  if (!gate.ok) return gate.response;
  const { data, error } = await gate.sb.rpc("admin_ad_undelete", {
    p_kind: parsed.kind,
    p_id: parsed.id,
    p_admin: gate.actor.userId,
    p_reason: parsed.reason,
  });
  if (error) {
    console.error("[admin/ads/undelete] rpc failed", error.message);
    return adminAdDeleteError("undelete_failed");
  }
  const out = (data ?? {}) as Record<string, unknown>;
  if (out.ok !== true) return adminAdDeleteError(typeof out.error === "string" ? out.error : "undelete_failed");
  return NextResponse.json({ ok: true, kind: parsed.kind, id: parsed.id });
}
