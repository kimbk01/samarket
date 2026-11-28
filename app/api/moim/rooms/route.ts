import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { guardMoimRead } from "@/lib/moim/server/moim-route-guard.server";
import { isUuidString } from "@/lib/shared/uuid-string";
import type { SupabaseServer } from "@/lib/chat/supabase-server";
import {
  canMoimAction,
  isMoimRole,
  type MoimPlatformState,
  type MoimRole,
  type MoimStatus,
} from "@/lib/moim/moim-permission-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 메신저 방 이름 옆에 보이는 모임 역할 — 일반 멤버는 표시하지 않으므로 담지 않는다 (모임 R4 #18 · 시안 U8 「준호 · 운영진」) */
export type MoimRoomMemberRole = Exclude<MoimRole, "member">;

/**
 * scheduleId = 일정 방이면 그 일정 id (방 머리글 「일정 보기」 · 4번 묶음 D2)
 * moimStatus = 모임 상태 — 어드민이 삭제한 모임이면 「모임 홈」 진입점만 숨긴다 (모임 R4 D-3 · 모임 방 판정은 그대로)
 * memberRoles = 방 멤버 user_id → 모임 역할(모임장·부모임장·운영진만) (모임 R4 #18 · §5(b)②)
 * canStartDm = 보는 사람이 모임 권한 start_dm 을 가졌는가 — 멤버 시트 [1:1 대화] (모임 R4 §5(b)③ · D-45)
 */
export type MoimRoomOwnerDto = {
  moimId: string;
  kind: "moim" | "schedule";
  moimName: string;
  scheduleId?: string;
  moimStatus: MoimStatus | null;
  /** 「모임 홈」·「일정 보기」·「모임 공지」가 열리는가 — 삭제·종료+열람 끝·모임 행 없음 = false (모임 R5 A9) */
  homeOpen: boolean;
  /** 읽기 전용 이유 — 앞쪽 우선: 삭제 > 차단 > 종료 > 일정 취소 > 일정 끝 (모임 R5 A16) */
  readonlyReason: MoimRoomReadonlyReason | null;
  /** 일정 방 시작 시각 (모임 R5 A24) — 모임 방은 null */
  scheduleStartsAt: string | null;
  memberRoles: Record<string, MoimRoomMemberRole>;
  canStartDm: boolean;
};

export type MoimRoomReadonlyReason = "moim_deleted" | "moim_blocked" | "moim_closed" | "schedule_cancelled" | "schedule_done";

type MoimRowWithEmbeds = {
  id: string;
  name: string;
  status: MoimStatus;
  platform_state: MoimPlatformState;
  retention_ended_at?: string | null;
  moim_members?: { user_id: string; role: string }[] | null;
  moim_permissions?: { action: string; min_role: string }[] | null;
};

/**
 * 모임 + (같은 요청 안에서) 활성 멤버 중 역할 있는 사람·보는 사람 + start_dm 권한 저장값.
 * PostgREST 묶음 조회(embed)라 Supabase 요청 수는 그대로다 — 역할 맵·권한 때문에 요청이 늘지 않는다 (예산 "/api/moim/rooms").
 */
function selectMoimsWithEmbeds(sb: SupabaseServer, ids: string[], viewerId: string) {
  return sb
    .from("moims")
    .select("id, name, status, platform_state, retention_ended_at, moim_members(user_id, role), moim_permissions(action, min_role)")
    .in("id", ids)
    .eq("moim_members.status", "active")
    .or(`role.neq.member,user_id.eq.${viewerId}`, { referencedTable: "moim_members" })
    .eq("moim_permissions.action", "start_dm");
}

type MoimView = {
  name: string;
  status: MoimStatus;
  platformState: MoimPlatformState;
  retentionEndedAt: string | null;
  memberRoles: Record<string, MoimRoomMemberRole>;
  canStartDm: boolean;
};

type ScheduleRow = { id: string; moim_id: string; status?: string | null; starts_at?: string | null };

/** 진입점이 열리는가 (모임 R5 A9) — 모임 행이 없으면 false */
function moimRoomHomeOpen(view: Pick<MoimView, "status" | "retentionEndedAt"> | null | undefined): boolean {
  if (!view) return false;
  if (view.status === "deleted") return false;
  if (view.status === "closed" && view.retentionEndedAt) return false;
  return true;
}

/** 읽기 전용 이유 (모임 R5 A16) — 앞쪽 우선 */
function moimRoomReadonlyReason(
  view: Pick<MoimView, "status" | "platformState"> | null | undefined,
  scheduleStatus: string | null | undefined
): MoimRoomReadonlyReason | null {
  if (view?.status === "deleted") return "moim_deleted";
  if (view?.platformState === "blocked") return "moim_blocked";
  if (view?.status === "closed") return "moim_closed";
  if (scheduleStatus === "cancelled") return "schedule_cancelled";
  if (scheduleStatus === "done") return "schedule_done";
  return null;
}

function roomsUnavailable() {
  return NextResponse.json({ ok: false, error: "moim_rooms_unavailable" }, { status: 503 });
}

function toMoimView(m: MoimRowWithEmbeds, viewerId: string): MoimView {
  const memberRoles: Record<string, MoimRoomMemberRole> = {};
  let viewerRole: MoimRole | null = null;
  for (const row of m.moim_members ?? []) {
    if (!isMoimRole(row.role)) continue;
    if (row.user_id === viewerId) viewerRole = row.role;
    if (row.role !== "member") memberRoles[row.user_id] = row.role;
  }
  const override = (m.moim_permissions ?? []).find((p) => p.action === "start_dm")?.min_role;
  const canStartDm = canMoimAction(
    {
      moimStatus: m.status,
      platformState: m.platform_state,
      viewerRole,
      overrides: override && isMoimRole(override) ? { start_dm: override } : {},
    },
    "start_dm"
  );
  return {
    name: m.name,
    status: m.status,
    platformState: m.platform_state,
    retentionEndedAt: m.retention_ended_at ?? null,
    memberRoles,
    canStartDm,
  };
}

/**
 * 메신저 방 → 소유 모임 (보는 사람이 참여 중인 방만). 채팅 목록 「모임」 배지 · 방 「모임 홈」 버튼 · 관리 메뉴 숨김용.
 * 부트스트랩(채팅 목록 핫 경로)은 건드리지 않고 별도로 묻는다.
 * 조회 하나라도 오류면 503 `moim_rooms_unavailable` — 「모임 방 아님」으로 답하지 않는다 (모임 R5 A11 · 신규2).
 * 클라이언트는 이 실패를 판정 중처럼 숨김으로 보고 다음 표시 때 다시 묻는다(Owner 결정 1).
 */
export async function GET(req: NextRequest) {
  const g = await guardMoimRead(req, { rateKey: "room_owners", limit: 120 });
  if (!g.ok) return g.response;
  const viewerId = g.userId!;
  const ids = (req.nextUrl.searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => isUuidString(s))
    .slice(0, 100);
  if (!ids.length) return NextResponse.json({ ok: true, owners: {} });
  /** 나간 방은 「참여 중」이 아니다 (left_at 이 찍힌 참여 행 제외 · 모임 R4 D-3) */
  const { data: mine, error: mineError } = await g.sb
    .from("community_messenger_participants")
    .select("room_id")
    .eq("user_id", viewerId)
    .is("left_at", null)
    .in("room_id", ids);
  if (mineError) return roomsUnavailable();
  const myRoomIds = ((mine ?? []) as { room_id: string }[]).map((r) => r.room_id);
  if (!myRoomIds.length) return NextResponse.json({ ok: true, owners: {} });
  const { data: rooms, error: roomsError } = await g.sb
    .from("community_messenger_rooms")
    .select("id, owner_ref_id")
    .eq("owner_domain", "moim")
    .in("id", myRoomIds);
  if (roomsError) return roomsUnavailable();
  const roomRows = (rooms ?? []) as { id: string; owner_ref_id: string }[];
  if (!roomRows.length) return NextResponse.json({ ok: true, owners: {} });
  const refIds = roomRows.map((r) => r.owner_ref_id);
  const [{ data: moims, error: moimsError }, { data: schedules, error: schedulesError }] = await Promise.all([
    selectMoimsWithEmbeds(g.sb, refIds, viewerId),
    g.sb.from("moim_schedules").select("id, moim_id, status, starts_at").in("id", refIds),
  ]);
  if (moimsError || schedulesError) return roomsUnavailable();
  const moimView = new Map<string, MoimView>(
    ((moims ?? []) as MoimRowWithEmbeds[]).map((m) => [m.id, toMoimView(m, viewerId)])
  );
  const scheduleRows = new Map(((schedules ?? []) as ScheduleRow[]).map((s) => [s.id, s]));
  const missing = [...new Set([...scheduleRows.values()].map((s) => s.moim_id).filter((id) => !moimView.has(id)))];
  if (missing.length) {
    const { data: more, error: moreError } = await selectMoimsWithEmbeds(g.sb, missing, viewerId);
    if (moreError) return roomsUnavailable();
    for (const m of (more ?? []) as MoimRowWithEmbeds[]) moimView.set(m.id, toMoimView(m, viewerId));
  }
  const owners: Record<string, MoimRoomOwnerDto> = {};
  for (const r of roomRows) {
    const schedule = scheduleRows.get(r.owner_ref_id);
    const scheduleOf = schedule?.moim_id;
    const moimId = scheduleOf ?? r.owner_ref_id;
    const view = moimView.get(moimId);
    const shared = {
      moimId,
      moimName: view?.name ?? "",
      moimStatus: view?.status ?? null,
      homeOpen: moimRoomHomeOpen(view),
      readonlyReason: moimRoomReadonlyReason(view, schedule?.status),
      scheduleStartsAt: schedule?.starts_at ?? null,
      memberRoles: view?.memberRoles ?? {},
      canStartDm: view?.canStartDm ?? false,
    };
    owners[r.id] = scheduleOf
      ? { ...shared, kind: "schedule", scheduleId: r.owner_ref_id }
      : { ...shared, kind: "moim" };
  }
  return NextResponse.json({ ok: true, owners });
}
