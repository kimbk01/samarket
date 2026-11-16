/**
 * CREW REP 매너(M)·제재(S)·거래 사기(T⁻) 사건 동기화기 — S4 (Owner 2026-11-16 「S4 진행해」).
 *
 * 원칙: 신고 「접수」는 사건이 아니다. 운영자가 확정한 결과만 사건이 된다.
 *  - 제재(S): `sanctions` (거래·커뮤니티·모임 이용 제한 모두 이 표로 모인다). 철회(revoked_at)면 되돌림.
 *  - 신고 확정(M −2): 운영자가 콘텐츠를 숨김·삭제한 신고 중 **같은 신고로 제재가 나가지 않은 것** (제재가 있으면 S 로만 — 이중 감점 없음).
 *    같은 대상(글·댓글·메시지) 여러 신고 = 1건.
 *  - 거래 사기·노쇼 확정(T −3): 사유가 사기·노쇼·외부 결제인 신고가 확정(제재 포함)되면 1건 — 구매자가 보는 거래 신뢰.
 *  - 모임 출석(M +0.5) / 노쇼(M −2): 끝난 일정(done)에서 모임장·공동모임장이 체크한 출석. 일정 주최자 본인 출석은 제외.
 *    노쇼는 끝난 뒤 7일이 지나야 반영(정정 기간).
 *  - 허위 신고(M −2, 신고자): 어드민 결정 API 가 바로 기록한다(이 동기화기 대상 아님).
 * 기록 시작 이전 결정은 대상이 아니다(CREW_REP_MANNER_START_ISO).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CREW_REP_MANNER_RULES as R,
  CREW_REP_MANNER_START_ISO,
  crewRepSanctionEventType,
} from "@/lib/trust/crew-rep-policy";
import {
  applyTrustEventDiff,
  chunk,
  desiredEvent,
  diffTrustEvents,
  fetchAll,
  loadExistingTrustEvents,
  type DesiredTrustEvent,
  type TrustEventSyncResult,
} from "@/lib/trust/crew-rep-sync-core";
import type { TrustDomain } from "@/lib/trust/manner-battery-policy-v1";

type Sb = SupabaseClient<any>;
const DAY_MS = 86_400_000;

export const MANNER_SYNC_EVENT_TYPES = [
  "sanction_warning",
  "sanction_restriction",
  "sanction_suspension",
  "manner_report_confirmed",
  "trade_fraud_confirmed",
  "manner_moim_attended",
  "manner_moim_no_show",
] as const;

const SYNC_REVERSE_REASON = "manner_source_invalid";

export type SanctionSource = {
  id: string;
  user_id: string;
  sanction_type: string;
  scope: string | null;
  start_at: string | null;
  end_at: string | null;
  created_at: string;
  revoked_at: string | null;
  source_report_id: string | null;
};

/** 운영자가 확정한 신고 1건 — 신고 종류와 무관하게 같은 모양으로 모은다. */
export type ConfirmedReport = {
  kind: "trade" | "community" | "chat" | "moim";
  reportId: string;
  /** 처분 받은 회원 */
  targetUserId: string;
  /** 같은 대상 묶음 키 (글·댓글·메시지·방 id) */
  targetKey: string;
  decidedAt: string;
  /** 거래 사기·노쇼 사유 */
  fraud: boolean;
  /** 콘텐츠를 숨김·삭제했는가 (매너 확정 조건) */
  contentRemoved: boolean;
};

export type MoimAttendanceSource = {
  id: string;
  user_id: string;
  attendance: string;
  status: string;
  schedule_host_user_id: string | null;
  schedule_status: string | null;
  schedule_starts_at: string | null;
  schedule_finished_at: string | null;
};

export type MannerSources = {
  sanctions: SanctionSource[];
  reports: ConfirmedReport[];
  attendance: MoimAttendanceSource[];
};

function domainForScope(scope: string | null): TrustDomain {
  if (scope === "trade") return "trade";
  if (scope === "community") return "community";
  return "platform";
}

/** 원천 → 지금 인정되어야 하는 매너·제재 사건 (순수 함수). */
export function planMannerEvents(src: MannerSources, asOf: Date): DesiredTrustEvent[] {
  const now = asOf.getTime();
  const startMs = new Date(CREW_REP_MANNER_START_ISO).getTime();
  const out: DesiredTrustEvent[] = [];

  // 1) 제재
  const sanctionedReportIds = new Set<string>();
  for (const s of src.sanctions) {
    if (s.source_report_id) sanctionedReportIds.add(s.source_report_id);
    if (s.revoked_at) continue;
    if (new Date(s.created_at).getTime() < startMs) continue;
    const type = crewRepSanctionEventType(s.sanction_type);
    if (!type) continue;
    out.push(
      desiredEvent({
        member_id: s.user_id,
        domain: domainForScope(s.scope),
        event_type: type,
        direction: "negative",
        source_type: "sanction",
        source_id: s.id,
        counterparty_id: null,
        occurred_at: s.start_at ?? s.created_at,
        metadata: {
          sanction_type: s.sanction_type,
          scope: s.scope,
          ends_at: s.end_at,
          source_report_id: s.source_report_id,
        },
      })
    );
  }

  // 2) 신고 확정 — 같은 대상 1건. 같은 대상의 어느 신고든 제재로 이어졌으면 매너 감점은 하지 않는다(S 로만).
  const decided = src.reports.filter((r) => new Date(r.decidedAt).getTime() >= startMs);
  const targetHasSanction = new Set<string>();
  for (const r of src.reports) {
    if (sanctionedReportIds.has(r.reportId)) targetHasSanction.add(`${r.targetUserId}:${r.targetKey}`);
  }
  const seenFraud = new Set<string>();
  const seenManner = new Set<string>();
  for (const r of [...decided].sort((a, b) => (a.decidedAt < b.decidedAt ? -1 : 1))) {
    const groupKey = `${r.targetUserId}:${r.targetKey}`;
    if (r.fraud) {
      if (seenFraud.has(groupKey)) continue;
      seenFraud.add(groupKey);
      out.push(
        desiredEvent({
          member_id: r.targetUserId,
          domain: "trade",
          event_type: "trade_fraud_confirmed",
          direction: "negative",
          source_type: `report_target_${r.kind}`,
          source_id: r.targetKey,
          counterparty_id: null,
          occurred_at: r.decidedAt,
          metadata: { report_kind: r.kind, report_id: r.reportId },
        })
      );
      continue;
    }
    if (!r.contentRemoved || targetHasSanction.has(groupKey) || seenManner.has(groupKey)) continue;
    seenManner.add(groupKey);
    out.push(
      desiredEvent({
        member_id: r.targetUserId,
        domain: r.kind === "trade" ? "trade" : "community",
        event_type: "manner_report_confirmed",
        direction: "negative",
        source_type: `report_target_${r.kind}`,
        source_id: r.targetKey,
        counterparty_id: null,
        occurred_at: r.decidedAt,
        metadata: { report_kind: r.kind, report_id: r.reportId },
      })
    );
  }

  // 3) 모임 출석·노쇼
  for (const a of src.attendance) {
    if (a.status !== "confirmed" || a.schedule_status !== "done" || !a.schedule_finished_at) continue;
    if (!a.schedule_starts_at || new Date(a.schedule_starts_at).getTime() < startMs) continue;
    if (a.schedule_host_user_id && a.schedule_host_user_id === a.user_id) continue;
    const finishedMs = new Date(a.schedule_finished_at).getTime();
    if (a.attendance === "present") {
      out.push(
        desiredEvent({
          member_id: a.user_id,
          domain: "community",
          event_type: "manner_moim_attended",
          direction: "positive",
          source_type: "moim_schedule_participant",
          source_id: a.id,
          counterparty_id: null,
          occurred_at: a.schedule_finished_at,
          metadata: {},
        })
      );
    } else if (a.attendance === "absent" && now - finishedMs >= R.moimNoShowHoldDays * DAY_MS) {
      out.push(
        desiredEvent({
          member_id: a.user_id,
          domain: "community",
          event_type: "manner_moim_no_show",
          direction: "negative",
          source_type: "moim_schedule_participant",
          source_id: a.id,
          counterparty_id: null,
          occurred_at: a.schedule_finished_at,
          metadata: {},
        })
      );
    }
  }

  return out;
}

/** 원천 표 읽기 — 신고 4종(거래·라운지·채팅·모임)·제재·모임 출석. */
export async function loadMannerSources(sb: Sb): Promise<MannerSources> {
  const start = CREW_REP_MANNER_START_ISO;
  const [sanctions, tradeReports, communityReports, chatReports, moimReports, schedules] = await Promise.all([
    // 제재 — 철회·되돌림 판정을 위해 시작 이후 만든 것 전부(철회 포함)
    fetchAll<SanctionSource>((a, b) =>
      sb
        .from("sanctions")
        .select("id, user_id, sanction_type, scope, start_at, end_at, created_at, revoked_at, source_report_id")
        .gte("created_at", start)
        .order("id")
        .range(a, b)
    ),
    fetchAll<{ id: string; target_type: string; target_id: string | null; product_id: string | null; reason_code: string | null; resolved_at: string | null }>(
      (a, b) =>
        sb
          .from("reports")
          .select("id, target_type, target_id, product_id, reason_code, resolved_at")
          .eq("status", "sanctioned")
          .gte("resolved_at", start)
          .order("id")
          .range(a, b)
    ),
    fetchAll<{ id: string; target_type: string | null; target_id: string | null; processed_at: string | null; resolution_actions: unknown }>(
      (a, b) =>
        sb
          .from("community_reports")
          .select("id, target_type, target_id, processed_at, resolution_actions")
          .eq("status", "resolved")
          .gte("processed_at", start)
          .order("id")
          .range(a, b)
    ),
    fetchAll<{ id: string; room_id: string | null; message_id: string | null; reported_user_id: string | null; reason_type: string | null; updated_at: string }>(
      (a, b) =>
        sb
          .from("chat_reports")
          .select("id, room_id, message_id, reported_user_id, reason_type, updated_at")
          .eq("status", "actioned")
          .gte("updated_at", start)
          .order("id")
          .range(a, b)
    ),
    fetchAll<{ id: string; moim_id: string; target_type: string; target_id: string; reason_code: string | null; handled_at: string | null }>(
      (a, b) =>
        sb
          .from("moim_reports")
          .select("id, moim_id, target_type, target_id, reason_code, handled_at")
          .eq("status", "actioned")
          .gte("handled_at", start)
          .order("id")
          .range(a, b)
    ),
    fetchAll<{ id: string; host_user_id: string | null; status: string | null; starts_at: string | null; finished_at: string | null }>(
      (a, b) =>
        sb
          .from("moim_schedules")
          .select("id, host_user_id, status, starts_at, finished_at")
          .eq("status", "done")
          .gte("starts_at", start)
          .order("id")
          .range(a, b)
    ),
  ]);

  // 신고된 회원이 제재를 받았는지(같은 신고로) — 시작 이전 제재까지 포함해 읽는다
  const reportIds = [
    ...tradeReports.map((r) => r.id),
    ...communityReports.map((r) => r.id),
    ...chatReports.map((r) => r.id),
    ...moimReports.map((r) => r.id),
  ];
  const sanctionsByReport: SanctionSource[] = [];
  for (const ids of chunk(reportIds, 200)) {
    const { data, error } = await sb
      .from("sanctions")
      .select("id, user_id, sanction_type, scope, start_at, end_at, created_at, revoked_at, source_report_id")
      .in("source_report_id", ids);
    if (error) throw new Error(error.message);
    sanctionsByReport.push(...((data ?? []) as SanctionSource[]));
  }
  const allSanctions = new Map<string, SanctionSource>();
  for (const s of [...sanctions, ...sanctionsByReport]) allSanctions.set(s.id, s);

  const reports: ConfirmedReport[] = [];

  // 거래(일반) 신고 — 글 주인 또는 신고된 회원
  const postIds = [...new Set(tradeReports.map((r) => r.product_id ?? (r.target_type === "product" || r.target_type === "post" ? r.target_id : null)).filter(Boolean))] as string[];
  const postOwner = new Map<string, string>();
  for (const ids of chunk(postIds, 200)) {
    const { data, error } = await sb.from("posts").select("id, user_id").in("id", ids);
    if (error) throw new Error(error.message);
    for (const p of (data ?? []) as { id: string; user_id: string }[]) postOwner.set(p.id, p.user_id);
  }
  for (const r of tradeReports) {
    const postId = r.product_id ?? (r.target_type === "product" || r.target_type === "post" ? r.target_id : null);
    const target = postId ? postOwner.get(postId) : r.target_type === "user" ? r.target_id : null;
    if (!target || !r.resolved_at) continue;
    reports.push({
      kind: "trade",
      reportId: r.id,
      targetUserId: target,
      targetKey: postId ?? `user:${target}`,
      decidedAt: r.resolved_at,
      fraud: R.tradeFraudReportReasons.includes(r.reason_code ?? ""),
      // 거래 신고의 sanctioned = 글 숨김 또는 제재(경고·제한). 제재가 있으면 위에서 매너 감점을 빼므로 남는 것은 숨김.
      contentRemoved: true,
    });
  }

  // 라운지 신고 — 숨김·삭제가 실제로 적용된 것
  const cpIds = communityReports.filter((r) => r.target_type === "post").map((r) => r.target_id!).filter(Boolean);
  const ccIds = communityReports.filter((r) => r.target_type === "comment").map((r) => r.target_id!).filter(Boolean);
  const contentOwner = new Map<string, string>();
  for (const [table, ids] of [["community_posts", cpIds], ["community_comments", ccIds]] as const) {
    for (const part of chunk(ids, 200)) {
      const { data, error } = await sb.from(table).select("id, user_id").in("id", part);
      if (error) throw new Error(error.message);
      for (const c of (data ?? []) as { id: string; user_id: string }[]) contentOwner.set(c.id, c.user_id);
    }
  }
  for (const r of communityReports) {
    const actions = Array.isArray(r.resolution_actions) ? (r.resolution_actions as Record<string, unknown>[]) : [];
    const removed = actions.some((a) => (a.action === "hide" || a.action === "delete") && !a.skipped);
    const target =
      r.target_type === "user" ? r.target_id : r.target_id ? contentOwner.get(r.target_id) ?? null : null;
    if (!target || !r.target_id || !r.processed_at) continue;
    reports.push({
      kind: "community",
      reportId: r.id,
      targetUserId: target,
      targetKey: r.target_id,
      decidedAt: r.processed_at,
      fraud: false,
      contentRemoved: removed,
    });
  }

  // 채팅 신고 — 운영자 조치 완료(actioned)
  for (const r of chatReports) {
    if (!r.reported_user_id) continue;
    reports.push({
      kind: "chat",
      reportId: r.id,
      targetUserId: r.reported_user_id,
      targetKey: r.message_id ?? r.room_id ?? `user:${r.reported_user_id}`,
      decidedAt: r.updated_at,
      fraud: R.tradeFraudChatReasons.includes(r.reason_type ?? ""),
      contentRemoved: true,
    });
  }

  // 모임 신고 — 콘텐츠 숨김(content_hide) 된 것, 작성자 기준
  const moimHidden = new Set<string>();
  for (const ids of chunk(moimReports.map((r) => r.id), 200)) {
    const { data, error } = await sb
      .from("moim_sanctions")
      .select("source_report_id, level, revoked_at")
      .in("source_report_id", ids);
    if (error) throw new Error(error.message);
    for (const s of (data ?? []) as { source_report_id: string; level: string; revoked_at: string | null }[]) {
      if (s.level === "content_hide" && !s.revoked_at) moimHidden.add(s.source_report_id);
    }
  }
  const ownerTables: Record<string, { table: string; col: string }> = {
    post: { table: "moim_posts", col: "author_id" },
    comment: { table: "moim_comments", col: "author_id" },
    album: { table: "moim_album_items", col: "uploader_id" },
    schedule: { table: "moim_schedules", col: "host_user_id" },
    chat_message: { table: "community_messenger_messages", col: "sender_id" },
  };
  const moimOwner = new Map<string, string>();
  for (const [type, def] of Object.entries(ownerTables)) {
    const ids = moimReports.filter((r) => r.target_type === type).map((r) => r.target_id);
    for (const part of chunk(ids, 200)) {
      const { data, error } = await sb.from(def.table).select(`id, ${def.col}`).in("id", part);
      if (error) throw new Error(error.message);
      for (const row of (data ?? []) as unknown as Record<string, string>[]) moimOwner.set(row.id!, row[def.col]!);
    }
  }
  for (const r of moimReports) {
    const target = r.target_type === "member" ? r.target_id : moimOwner.get(r.target_id) ?? null;
    if (!target || !r.handled_at) continue;
    reports.push({
      kind: "moim",
      reportId: r.id,
      targetUserId: target,
      targetKey: r.target_id,
      decidedAt: r.handled_at,
      fraud: false,
      contentRemoved: moimHidden.has(r.id),
    });
  }

  // 모임 출석
  const schedById = new Map(schedules.map((s) => [s.id, s]));
  const attendance: MoimAttendanceSource[] = [];
  for (const ids of chunk([...schedById.keys()], 200)) {
    const { data, error } = await sb
      .from("moim_schedule_participants")
      .select("id, schedule_id, user_id, attendance, status")
      .in("schedule_id", ids);
    if (error) throw new Error(error.message);
    for (const p of (data ?? []) as { id: string; schedule_id: string; user_id: string; attendance: string; status: string }[]) {
      const s = schedById.get(p.schedule_id);
      attendance.push({
        id: p.id,
        user_id: p.user_id,
        attendance: p.attendance,
        status: p.status,
        schedule_host_user_id: s?.host_user_id ?? null,
        schedule_status: s?.status ?? null,
        schedule_starts_at: s?.starts_at ?? null,
        schedule_finished_at: s?.finished_at ?? null,
      });
    }
  }

  return { sanctions: [...allSanctions.values()], reports, attendance };
}

/** 원천 ↔ 원장 동기화. dryRun 이면 쓰지 않고 차이만 센다. 재계산은 호출자가 한다. */
export async function syncMannerTrustEvents(
  sb: Sb,
  opts: { asOf?: Date; dryRun?: boolean } = {}
): Promise<TrustEventSyncResult> {
  const asOf = opts.asOf ?? new Date();
  const sources = await loadMannerSources(sb);
  const desired = planMannerEvents(sources, asOf);
  const existing = await loadExistingTrustEvents(sb, MANNER_SYNC_EVENT_TYPES);
  const diff = diffTrustEvents(desired, existing, SYNC_REVERSE_REASON);
  return applyTrustEventDiff(sb, desired, diff, { asOf, reverseReason: SYNC_REVERSE_REASON, dryRun: opts.dryRun });
}
