/**
 * POST /api/admin/moim/reports/[reportId]/decision — 모임 신고 처리 (설계 moim §6 P13·P14 · §8 「모임 신고 처리」 · M6). 권한 키 `moim`.
 * body {
 *   expectedStatus: "received"|"reviewing"  — 화면을 연 때의 상태 (다르면 409)
 *   decision: "actioned"|"dismissed", reason(필수)
 *   contentHide?: bool                       — 글·댓글·사진 숨김 / 일정 취소 / 채팅 메시지 숨김 (모임·멤버 대상은 불가)
 *   moimLevel?: "unlist"|"warn"|"block"|null, moimEndsAt?: ISO|null
 *   userRestrict?: { who: "target"|"host", restriction: "post"|"comment"|"all", days: number|null(영구) } | null
 *   closeSameTarget?: bool                   — 같은 대상의 다른 열린 신고도 같은 결과로 닫기
 * }
 * 신고 상태·조치·moim_sanctions·운영 기록(moim_events·audit_logs)은 SQL 한 트랜잭션. 성공 후 알림(best effort — 실패해도 응답은 성공):
 *  - 신고자 전원 `moim_report_result` (조치 여부만 · 조치 내용 비공개)
 *  - 모임 제재 시 `moim_sanctioned` (추천 제외·경고 = 모임장 · 차단 = 전체 멤버)
 *  - 이용 제한 시 기존 커뮤니티 제재 알림 (이미 같은 제한이 있으면 생략)
 *  - 일정 취소 시 참여자 `moim_schedule_cancelled` · 채팅 메시지 숨김 시 메신저 방 미리보기 정합
 */
import type { NextRequest } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import {
  MOIM_ADMIN_REPORT_DECISIONS,
  MOIM_ADMIN_RESTRICT_DAYS_MAX,
  MOIM_ADMIN_RESTRICT_WHO,
  MOIM_ADMIN_RESTRICTIONS,
  MOIM_ADMIN_SANCTION_LEVELS,
  isMoimAdminOpenReportStatus,
  type MoimAdminReportDecision,
  type MoimAdminRestriction,
  type MoimAdminRestrictWho,
  type MoimAdminSanctionLevel,
} from "@/lib/admin/moim/moim-admin-contract";
import { moimAdminBad, moimAdminJson, moimAdminReason, moimAdminRpcResponse, moimAdminUuid } from "@/lib/admin/moim/moim-admin-route.server";
import { moimAdminReportDecide, type MoimAdminReportDecideInput } from "@/lib/moim/server/moim-rpc.server";
import { moimPaths, notifyMoimMany } from "@/lib/moim/server/moim-notify.server";
import { notifyCommunitySanction } from "@/lib/notifications/notify-community-moderation";
import { syncRoomAfterAdminMessageVisibility } from "@/lib/admin-community-messenger/sync-room-after-admin-hide";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ reportId: string }> };

type Body = {
  expectedStatus?: unknown;
  decision?: unknown;
  reason?: unknown;
  contentHide?: unknown;
  moimLevel?: unknown;
  moimEndsAt?: unknown;
  userRestrict?: unknown;
  closeSameTarget?: unknown;
};

function parseUserRestrict(v: unknown): { ok: true; value: MoimAdminReportDecideInput["userRestrict"] } | { ok: false } {
  if (v == null) return { ok: true, value: null };
  if (typeof v !== "object") return { ok: false };
  const o = v as { who?: unknown; restriction?: unknown; days?: unknown };
  if (!(MOIM_ADMIN_RESTRICT_WHO as readonly unknown[]).includes(o.who)) return { ok: false };
  if (!(MOIM_ADMIN_RESTRICTIONS as readonly unknown[]).includes(o.restriction)) return { ok: false };
  let days: number | null = null;
  if (o.days != null && o.days !== "") {
    const n = Number(o.days);
    if (!Number.isInteger(n) || n < 1 || n > MOIM_ADMIN_RESTRICT_DAYS_MAX) return { ok: false };
    days = n;
  }
  return { ok: true, value: { who: o.who as MoimAdminRestrictWho, restriction: o.restriction as MoimAdminRestriction, days } };
}

async function bestEffort(label: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.warn("[admin-moim-report-decision] side effect failed", label, err);
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const gate = await requireAdminPermission("moim");
  if (!gate.ok) return gate.response;
  const reportId = moimAdminUuid((await params).reportId);
  if (!reportId) return moimAdminBad("moim_report_not_found", 404);
  const body = await moimAdminJson<Body>(req);
  if (!body) return moimAdminBad();

  if (!isMoimAdminOpenReportStatus(body.expectedStatus)) return moimAdminBad("moim_conflict", 409);
  const decision = (MOIM_ADMIN_REPORT_DECISIONS as readonly unknown[]).includes(body.decision) ? (body.decision as MoimAdminReportDecision) : null;
  if (!decision) return moimAdminBad("moim_report_decision_invalid");
  const reason = moimAdminReason(body.reason);
  if (!reason) return moimAdminBad("moim_admin_reason_required");

  const contentHide = body.contentHide === true;
  let moimLevel: MoimAdminSanctionLevel | null = null;
  if (body.moimLevel != null && body.moimLevel !== "") {
    if (!(MOIM_ADMIN_SANCTION_LEVELS as readonly unknown[]).includes(body.moimLevel)) return moimAdminBad("moim_sanction_level_invalid");
    moimLevel = body.moimLevel as MoimAdminSanctionLevel;
  }
  let moimEndsAt: string | null = null;
  if (typeof body.moimEndsAt === "string" && body.moimEndsAt.trim()) {
    const ms = Date.parse(body.moimEndsAt);
    if (!moimLevel || !Number.isFinite(ms) || ms <= Date.now()) return moimAdminBad("moim_sanction_period_invalid");
    moimEndsAt = new Date(ms).toISOString();
  }
  const ur = parseUserRestrict(body.userRestrict);
  if (!ur.ok) return moimAdminBad("moim_report_decision_invalid");
  const userRestrict = ur.value;

  const anyAction = contentHide || moimLevel !== null || userRestrict !== null;
  if ((decision === "dismissed" && anyAction) || (decision === "actioned" && !anyAction)) return moimAdminBad("moim_report_decision_invalid");

  const r = await moimAdminReportDecide(
    gate.actor.userId,
    reportId,
    {
      expectedStatus: body.expectedStatus,
      decision,
      reason,
      contentHide,
      moimLevel,
      moimEndsAt,
      userRestrict,
      closeSameTarget: body.closeSameTarget === true,
    },
    gate.sb
  );
  if (!r.ok) return moimAdminRpcResponse(r);

  const moimId = r.moim_id;
  const moimName = r.moim_name ?? "";
  const actions = Array.isArray(r.actions) ? r.actions : [];

  // 1. 신고자 결과 — 조치 여부만 (상대에게 내린 조치 내용은 쓰지 않는다 · 설계 P13)
  await bestEffort("report_result", () =>
    notifyMoimMany(gate.sb, r.reporter_ids ?? [], {
      kind: "moim_report_result",
      variant: decision,
      moimId,
      linkUrl: moimPaths.home(moimId),
      dedupeRef: reportId,
      vars: { moim: moimName },
    })
  );

  // 2. 모임 제재 (필수 알림)
  const levelAction = r.moim_level ? actions.find((a) => a.kind === `moim_${r.moim_level}`) : undefined;
  if (r.moim_level && levelAction) {
    await bestEffort("moim_sanctioned", () =>
      notifyMoimMany(gate.sb, r.moim_notify_user_ids ?? [], {
        kind: "moim_sanctioned",
        variant: r.moim_level as string,
        moimId,
        linkUrl: moimPaths.home(moimId),
        dedupeRef: levelAction.sanction_id,
        vars: { moim: moimName },
      })
    );
  }

  // 3. 이용 제한 — 커뮤니티 결정 라우트와 같은 알림 (이미 같은 제한이 있으면 새 제한이 없으므로 생략)
  for (const a of actions) {
    if (a.kind !== "user_restrict" || a.duplicate || !a.user_id || !a.community_sanction_id) continue;
    await bestEffort("community_sanction", () =>
      notifyCommunitySanction(gate.sb, {
        userId: a.user_id as string,
        sanctionId: String(a.community_sanction_id),
        kind: "restriction",
        restriction: a.restriction ?? null,
        endAt: a.end_at ?? null,
        reason,
      })
    );
  }

  // 4. 일정 취소 → 참여자
  if (r.target_type === "schedule" && r.schedule_title != null) {
    await bestEffort("schedule_cancelled", () =>
      notifyMoimMany(gate.sb, r.schedule_notify_user_ids ?? [], {
        kind: "moim_schedule_cancelled",
        moimId,
        linkUrl: moimPaths.schedule(moimId, r.target_id),
        dedupeRef: r.target_id,
        vars: { title: r.schedule_title ?? "" },
      })
    );
  }

  // 5. 채팅 메시지 숨김 → 방 미리보기·부트스트랩 정합
  if (r.chat_room_id) {
    await syncRoomAfterAdminMessageVisibility(r.chat_room_id);
  }

  return moimAdminRpcResponse({ ok: true }, {
    status: r.status,
    closedReportIds: r.closed_report_ids ?? [],
    actions: actions.map((a) => ({ kind: a.kind, sanctionId: a.sanction_id, duplicate: a.duplicate ?? false })),
  });
}
