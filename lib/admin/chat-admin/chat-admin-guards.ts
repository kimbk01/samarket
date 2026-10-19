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
  chatRoomAdminPermissionKeys,
  normalizeChatAdminReason,
  resolveCmRoomContentDomain,
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

/**
 * 거래 채팅 Admin 게이트 — 거래 Admin Owner 결정 O-2: 활성 관리자 전원 같은 권한
 * (로그인·활성 멤버십 확인은 유지, 세부 키 검사 없음). 본문 열람 감사·사유 규칙은 각 라우트 그대로.
 */
export async function requireTradeChatAdmin(): Promise<ChatAdminGate> {
  return requireAdminApiActor();
}

/**
 * CM 방 Admin 게이트 (설계 §2-2) — 방의 `chat_domain` 으로 허용 권한을 정한다.
 * 방이 없으면 404 `room_not_found`.
 */
export async function requireChatRoomAdmin(
  roomId: string
): Promise<
  | { ok: true; actor: AdminApiActor; sb: SupabaseClient; domain: ChatAdminContentDomain }
  | { ok: false; response: NextResponse }
> {
  const base = await requireAdminApiActor();
  if (!base.ok) return base;
  const id = String(roomId ?? "").trim();
  if (!id) return { ok: false, response: NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 }) };
  const { data, error } = await base.sb
    .from("community_messenger_rooms")
    .select("id, chat_domain, room_type, direct_key")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 }) };
  }
  if (!data) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "room_not_found" }, { status: 404 }) };
  }
  const domain = resolveCmRoomContentDomain(data as { chat_domain?: string; room_type?: string; direct_key?: string });
  if (base.actor.isSuperAdmin) return { ...base, domain };
  // 거래 방: O-2 (거래 Admin) — 활성 관리자 전원
  if (domain === "trade") return { ...base, domain };
  const keys = chatRoomAdminPermissionKeys(domain);
  if (keys.some((k) => permissionKeyAllowed(base.actor.permissions, k))) return { ...base, domain };
  return {
    ok: false,
    response: NextResponse.json(
      { ok: false, error: "forbidden_permission", permission: keys.join("|") },
      { status: 403 }
    ),
  };
}

/** 방에 딸린 행(신고·통화 세션)으로 방을 찾아 `requireChatRoomAdmin` 적용. 행이 없으면 404. */
export async function requireChatRoomAdminForRow(
  table: "community_messenger_reports" | "community_messenger_call_sessions",
  rowId: string
): ReturnType<typeof requireChatRoomAdmin> {
  const base = await requireAdminApiActor();
  if (!base.ok) return base;
  const id = String(rowId ?? "").trim();
  const { data, error } = id
    ? await base.sb.from(table).select("room_id").eq("id", id).maybeSingle()
    : { data: null, error: null };
  if (error) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 }) };
  }
  const roomId = String((data as { room_id?: string | null } | null)?.room_id ?? "").trim();
  if (!roomId) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "not_found" }, { status: 404 }) };
  }
  return requireChatRoomAdmin(roomId);
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
