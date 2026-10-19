/**
 * 채팅 Admin R1-A — 서버 전용 권한 게이트·열람 감사.
 * 클라이언트 컴포넌트에서 import 금지 (next/server · service-role · lib/audit).
 */
import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  requireAdminApiActor,
  requireAdminPermission,
  type AdminApiActor,
} from "@/lib/admin/require-admin-permission";
import { permissionKeyAllowed } from "@/lib/admin/admin-user-server";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import type { AdminPermissionKey } from "@/lib/types/admin-staff";
import {
  CHAT_ADMIN_AUDIT_CONTENT_VIEW,
  CHAT_ADMIN_CONTENT_VIEW_AUDIT_DEDUPE_MS,
  CHAT_ADMIN_REASON_HEADER,
  CHAT_ADMIN_REASON_QUERY_PARAM,
  normalizeChatAdminReason,
  type ChatAdminContentBasis,
  type ChatAdminContentDomain,
} from "@/lib/admin/chat-admin/chat-content-access-policy";

export type ChatAdminGate =
  | { ok: true; actor: AdminApiActor; sb: SupabaseClient }
  | { ok: false; response: NextResponse };

/** 채팅·메신저·통화 Admin API 공통 — 권한 키 `chats` (super_admin 통과). */
export function requireChatAdmin(): Promise<ChatAdminGate> {
  return requireAdminPermission("chats");
}

/** 여러 권한 중 하나 (주문 채팅: `chats` 또는 `business`). */
export async function requireAnyAdminPermission(keys: AdminPermissionKey[]): Promise<ChatAdminGate> {
  const base = await requireAdminApiActor();
  if (!base.ok) return base;
  if (base.actor.isSuperAdmin) return base;
  if (keys.some((k) => permissionKeyAllowed(base.actor.permissions, k))) return base;
  return {
    ok: false,
    response: NextResponse.json(
      { ok: false, error: "forbidden_permission", permission: keys.join("|") },
      { status: 403 }
    ),
  };
}

/** 열람 사유 — `?reason=` 우선, 없으면 `x-admin-reason` 헤더 (URI 인코딩 허용). */
export function readChatAdminReason(req: Request): string {
  let raw = "";
  try {
    raw = new URL(req.url).searchParams.get(CHAT_ADMIN_REASON_QUERY_PARAM) ?? "";
  } catch {
    raw = "";
  }
  if (!raw) {
    const header = req.headers.get(CHAT_ADMIN_REASON_HEADER) ?? "";
    try {
      raw = decodeURIComponent(header);
    } catch {
      raw = header;
    }
  }
  return normalizeChatAdminReason(raw);
}

export function chatAdminReasonRequired(min: number): NextResponse {
  return NextResponse.json({ ok: false, error: "reason_required", minLength: min }, { status: 400 });
}

export function chatAdminStaleState(detail?: string): NextResponse {
  return NextResponse.json({ ok: false, error: "stale_state", detail: detail ?? null }, { status: 409 });
}

/**
 * 메시지 본문 열람 감사 — 본문을 반환하는 GET 내부에서만 호출.
 * 같은 관리자·대상·사유의 기록이 30분 안에 있으면 중복 기록하지 않는다 (실시간 새로고침 루프 방지).
 */
export async function appendChatContentViewAudit(
  sb: SupabaseClient,
  req: Request,
  input: {
    actorId: string;
    targetType: string;
    roomId: string;
    domain: ChatAdminContentDomain;
    basis: ChatAdminContentBasis;
    reason: string;
    scope: Record<string, unknown>;
  }
): Promise<void> {
  try {
    const since = new Date(Date.now() - CHAT_ADMIN_CONTENT_VIEW_AUDIT_DEDUPE_MS).toISOString();
    const { data: recent } = await sb
      .from("audit_logs")
      .select("id, after_json")
      .eq("actor_id", input.actorId)
      .eq("target_type", input.targetType)
      .eq("target_id", input.roomId)
      .eq("action", CHAT_ADMIN_AUDIT_CONTENT_VIEW)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5);
    const dup = ((recent ?? []) as Array<{ after_json?: Record<string, unknown> | null }>).some(
      (row) =>
        String(row.after_json?.reason ?? "") === input.reason &&
        String(row.after_json?.basis ?? "") === input.basis
    );
    if (dup) return;
  } catch {
    /* dedupe 조회 실패 → 기록은 남긴다 */
  }
  await appendAdminRouteAudit(sb, req, {
    actorId: input.actorId,
    targetType: input.targetType,
    targetId: input.roomId,
    action: CHAT_ADMIN_AUDIT_CONTENT_VIEW,
    after: {
      roomId: input.roomId,
      chatDomain: input.domain,
      basis: input.basis,
      ghost: input.basis === "ghost",
      reason: input.reason,
      scope: input.scope,
      viewedAt: new Date().toISOString(),
    },
  });
}
