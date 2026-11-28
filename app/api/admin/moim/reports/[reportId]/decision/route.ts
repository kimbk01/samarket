/**
 * POST /api/admin/moim/reports/[reportId]/decision — 모임 신고 처리 (설계 moim §6 P13·P14 · §8 「모임 신고 처리」 · M6). 권한 키 `moim`.
 * body {
 *   expectedStatus: "received"|"reviewing"  — 화면을 연 때의 상태 (다르면 409)
 *   decision: "actioned"|"dismissed", reason(필수)
 *   contentHide?: bool                       — 글·댓글·사진 숨김 / 일정 취소 / 채팅 메시지 숨김 (모임·멤버 대상은 불가)
 *   moimLevel?: "unlist"|"warn"|"block"|null, moimEndsAt?: ISO|null — 끝나는 날은 추천 제외만 (R4 D-14 · 경고·차단 + 날짜 = 400 moim_sanction_period_not_allowed)
 *   userRestrict?: { who: "target"|"host", restriction: "post"|"comment"|"all", days: number|null(영구) } | null
 *   closeSameTarget?: bool                   — 같은 대상의 다른 열린 신고도 같은 결과로 닫기
 * }
 * 신고 상태·조치·moim_sanctions·운영 기록(moim_events·audit_logs)은 SQL 한 트랜잭션. 성공 후 알림(best effort — 실패해도 응답은 성공):
 *  - 신고자 전원 `moim_report_result` (조치 여부만 · 조치 내용 비공개) — 이동 위치는 신고자가 활동 멤버인지로 둘로 나눈다(R5 E4 · reporter_member_ids)
 *  - 모임 제재 시 `moim_sanctioned` (추천 제외·경고 = 모임장 · 차단 = 전체 멤버) — 같은 단계가 이미 진행 중이라 그 행을 쓴 경우(created=false)는 보내지 않는다(R5 D3)
 *  - 콘텐츠 숨김(일정 제외) 시 모임장 `moim_sanctioned`(content_hide) + 작성자 `moim_content_moderated`(hidden) (R2 N-05 · P14 「모든 제재」)
 *  - 이용 제한은 제한받은 본인에게만 (D-21 — 다른 사람의 제재를 모임장에게 알리지 않음)
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
  moimAdminLevelAllowsPeriod,
  type MoimAdminReportDecision,
  type MoimAdminRestriction,
  type MoimAdminRestrictWho,
  type MoimAdminSanctionLevel,
} from "@/lib/admin/moim/moim-admin-contract";
import { moimAdminBad, moimAdminJson, moimAdminReason, moimAdminRpcResponse, moimAdminUuid } from "@/lib/admin/moim/moim-admin-route.server";
import { moimAdminReportDecide, type MoimAdminReportDecideInput } from "@/lib/moim/server/moim-rpc.server";
import { moimNotifyLink, moimPaths, notifyMoimAfterResponse, notifyMoimMany } from "@/lib/moim/server/moim-notify.server";
import { moimViewStateFromRpc } from "@/lib/moim/moim-view-rule";
import { notifyCommunitySanction } from "@/lib/notifications/notify-community-moderation";
import { syncRoomAfterAdminMessageVisibility } from "@/lib/admin-community-messenger/sync-room-after-admin-hide";
import type { MessageKey } from "@/lib/i18n/messages";

/** 작성자 알림의 콘텐츠 종류 문구 (R2 N-05) — 채팅 메시지는 「메시지」 */
const CONTENT_TYPE_KEY: Partial<Record<string, MessageKey>> = {
  post: "notify_moim_content_type_post",
  comment: "notify_moim_content_type_comment",
  album: "notify_moim_content_type_album",
  chat_message: "notify_moim_content_type_message",
};

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
    if (moimLevel && !moimAdminLevelAllowsPeriod(moimLevel)) return moimAdminBad("moim_sanction_period_not_allowed");
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

  const contentHideAction = actions.find((a) => a.kind === "content_hide");
  /** R5 E4: 이동 위치 — 모임 상태(키가 없는 옛 DB = null → 원래 위치) */
  const view = moimViewStateFromRpc(r);
  const home = moimPaths.home(moimId);
  /** 멤버에게 보내는 알림(제재·콘텐츠) — 멤버도 열 수 없는 모임이면 보내지 않는다 */
  const memberLink = moimNotifyLink(view, true, home, { result: false });
  /** 발송은 응답 뒤 (R2 R-e). 채팅 미리보기 정합(5)은 데이터라 응답 전에 한다 */
  notifyMoimAfterResponse(async () => {
  // 1. 신고자 결과 — 조치 여부만 (상대에게 내린 조치 내용은 쓰지 않는다 · 설계 P13). 결과 알림이라 열 수 없으면 모임 탭으로
  const reporters = r.reporter_ids ?? [];
  const memberIds = Array.isArray(r.reporter_member_ids) ? new Set(r.reporter_member_ids) : null;
  const groups: [string[], boolean][] = memberIds
    ? [
        [reporters.filter((id) => memberIds.has(id)), true],
        [reporters.filter((id) => !memberIds.has(id)), false],
      ]
    : [[reporters, false]];
  for (const [ids, isMember] of groups) {
    if (!ids.length) continue;
    await bestEffort("report_result", () =>
      notifyMoimMany(gate.sb, ids, {
        kind: "moim_report_result",
        variant: decision,
        moimId,
        linkUrl: (memberIds ? moimNotifyLink(view, isMember, home, { result: true }) : home) ?? moimPaths.list(),
        dedupeRef: reportId,
        vars: { moim: moimName },
      })
    );
  }

  // 2. 모임 제재 (필수 알림) — 같은 단계가 진행 중이라 새로 만들지 않았으면(created=false · R5 D3) 다시 보내지 않는다
  const levelAction = r.moim_level ? actions.find((a) => a.kind === `moim_${r.moim_level}`) : undefined;
  if (r.moim_level && levelAction && levelAction.created !== false && memberLink) {
    await bestEffort("moim_sanctioned", () =>
      notifyMoimMany(gate.sb, r.moim_notify_user_ids ?? [], {
        kind: "moim_sanctioned",
        variant: r.moim_level as string,
        moimId,
        linkUrl: memberLink,
        dedupeRef: levelAction.sanction_id ?? reportId,
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

  // 4. 일정 취소 → 확정 참여자 (R2 N-08f)
  const scheduleLink = moimNotifyLink(view, true, moimPaths.schedule(moimId, r.target_id), { result: false });
  if (r.target_type === "schedule" && r.schedule_title != null && scheduleLink) {
    await bestEffort("schedule_cancelled", () =>
      notifyMoimMany(gate.sb, r.schedule_notify_user_ids ?? [], {
        kind: "moim_schedule_cancelled",
        moimId,
        linkUrl: scheduleLink,
        dedupeRef: r.target_id,
        vars: { title: r.schedule_title ?? "" },
      })
    );
  }

  // 4-2. 콘텐츠 숨김(글·댓글·사진·채팅) → 모임장 제재 알림 + 작성자 조치 알림 (R2 N-05). 일정은 4번 취소 알림이 간다
  /** 이미 숨겨져 있어 바뀐 것이 없으면(changed=false) 「숨겼어요」를 보내지 않는다 (재감사 F5 · 옛 DB 는 키 없음 = 바뀐 것으로 본다) */
  if (contentHideAction && contentHideAction.changed !== false && r.target_type !== "schedule" && memberLink) {
    const host = typeof r.host_user_id === "string" ? r.host_user_id : null;
    const owner = typeof r.target_owner_id === "string" ? r.target_owner_id : null;
    /** E18: 종료된 모임에는 모임장 제재 알림을 보내지 않는다(모임 단위 제재와 같은 규칙) — 작성자 조치 알림은 자기 콘텐츠라 보낸다 */
    const moimActive = view == null || view.status === "active";
    if (host && moimActive) {
      await bestEffort("moim_sanctioned_content_hide", () =>
        notifyMoimMany(gate.sb, [host], {
          kind: "moim_sanctioned",
          variant: "content_hide",
          moimId,
          linkUrl: memberLink,
          dedupeRef: contentHideAction.sanction_id ?? reportId,
          vars: { moim: moimName },
        })
      );
    }
    const typeKey = CONTENT_TYPE_KEY[r.target_type];
    if (owner && owner !== host && typeKey) {
      await bestEffort("content_moderated", () =>
        notifyMoimMany(gate.sb, [owner], {
          kind: "moim_content_moderated",
          variant: "hidden",
          moimId,
          linkUrl: memberLink,
          dedupeRef: contentHideAction.sanction_id ?? reportId,
          vars: { moim: moimName },
          keyVars: { type: typeKey },
        })
      );
    }
  }
  });

  // 5. 채팅 메시지 숨김 → 방 미리보기·부트스트랩 정합
  if (r.chat_room_id) {
    await syncRoomAfterAdminMessageVisibility(r.chat_room_id);
  }

  return moimAdminRpcResponse({ ok: true }, {
    status: r.status,
    closedReportIds: r.closed_report_ids ?? [],
    /** R5 D3: created=false = 이미 진행 중인 같은 제재를 근거로 연결함 (화면 「이미 진행 중인 같은 제재를 근거로 연결했어요」) */
    actions: actions.map((a) => ({ kind: a.kind, sanctionId: a.sanction_id, duplicate: a.duplicate ?? false, created: a.created !== false })),
  });
}
