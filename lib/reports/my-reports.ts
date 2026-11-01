/**
 * 내 신고 내역 (알림 최종 설계 §5-5 · Owner 승인 2026-11-01 D2) — 서버 전용.
 *
 * 신고 4종을 한 목록으로: 커뮤니티(`community_reports`) · 메신저 채팅(`community_messenger_reports`) ·
 * 거래 채팅(`chat_reports`) · 거래(`reports`). 상태는 관리자 큐와 같은 단계 정의를 쓴다.
 * 처리 시각은 저장된 열만 쓴다(거래 채팅 신고는 처리 시각 열이 없어 비워 둔다).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { chatReportBucketOf } from "@/lib/admin/chat-admin/admin-chat-report-queue-model";
import { communityReportStatusStage } from "@/lib/mypage/community-activity-types";
import { compareKeysetDesc, encodeMypageListCursor, type MypageListCursor } from "@/lib/mypage/mypage-list-cursor";

import {
  buildMyReportDetailPath,
  isMyReportSource,
  MY_REPORT_SOURCES,
  myReportSourceFromChatReportSource,
  type MyReportSource,
} from "@/lib/reports/my-report-paths";

export { buildMyReportDetailPath, isMyReportSource, MY_REPORT_SOURCES, myReportSourceFromChatReportSource };
export type { MyReportSource };

/** 접수됨 → 검토 중 → 결과(조치 완료 / 위반 없음) */
export type MyReportStage = "received" | "reviewing" | "resolved" | "rejected";

export type MyReportItem = {
  source: MyReportSource;
  id: string;
  /** `/mypage/reports/{source}/{id}` */
  href: string;
  stage: MyReportStage;
  rawStatus: string;
  reasonCode: string;
  reasonDetail: string;
  targetType: string;
  createdAt: string;
  processedAt: string | null;
};

function stageOf(source: MyReportSource, raw: string): MyReportStage {
  if (source === "community") return communityReportStatusStage(raw);
  const bucket = chatReportBucketOf(source === "trade" ? "trade_report" : source, raw);
  return bucket === "dismissed" ? "rejected" : bucket;
}

type Spec = {
  table: string;
  reporterCol: string;
  select: string;
  map: (row: Record<string, unknown>) => Omit<MyReportItem, "source" | "href" | "stage">;
};

const str = (v: unknown) => (v == null ? "" : String(v));
const strOrNull = (v: unknown) => (v == null || v === "" ? null : String(v));

const SPECS: Record<MyReportSource, Spec> = {
  community: {
    table: "community_reports",
    reporterCol: "user_id",
    select: "id, target_type, reason, status, created_at, processed_at",
    map: (r) => ({
      id: str(r.id),
      rawStatus: str(r.status) || "open",
      reasonCode: str(r.reason) || "etc",
      reasonDetail: "",
      targetType: str(r.target_type) || "post",
      createdAt: str(r.created_at),
      processedAt: strOrNull(r.processed_at),
    }),
  },
  messenger: {
    table: "community_messenger_reports",
    reporterCol: "reporter_user_id",
    select: "id, report_type, reason_type, reason_detail, status, created_at, handled_at",
    map: (r) => ({
      id: str(r.id),
      rawStatus: str(r.status) || "received",
      reasonCode: str(r.reason_type) || "etc",
      reasonDetail: str(r.reason_detail),
      targetType: str(r.report_type) || "room",
      createdAt: str(r.created_at),
      processedAt: strOrNull(r.handled_at),
    }),
  },
  trade_chat: {
    table: "chat_reports",
    reporterCol: "reporter_user_id",
    select: "id, report_type, reason_type, reason_detail, status, created_at",
    map: (r) => ({
      id: str(r.id),
      rawStatus: str(r.status) || "received",
      reasonCode: str(r.reason_type) || "etc",
      reasonDetail: str(r.reason_detail),
      targetType: str(r.report_type) || "room",
      createdAt: str(r.created_at),
      processedAt: null,
    }),
  },
  trade: {
    table: "reports",
    reporterCol: "reporter_id",
    select: "id, target_type, reason_code, reason_text, status, created_at, resolved_at",
    map: (r) => ({
      id: str(r.id),
      rawStatus: str(r.status) || "pending",
      reasonCode: str(r.reason_code) || "etc",
      reasonDetail: str(r.reason_text),
      targetType: str(r.target_type) || "product",
      createdAt: str(r.created_at),
      processedAt: strOrNull(r.resolved_at),
    }),
  },
};

function toItem(source: MyReportSource, row: Record<string, unknown>): MyReportItem {
  const base = SPECS[source].map(row);
  return { ...base, source, href: buildMyReportDetailPath(source, base.id), stage: stageOf(source, base.rawStatus) };
}

function isMissingTable(message: string): boolean {
  return /does not exist|schema cache/i.test(message);
}

/** 4종 병합 최신순 · 커서(`created_at|source-id`) · 상태 필터(진행 중 / 처리 완료). */
export async function loadMyReports(
  sb: SupabaseClient,
  userId: string,
  opts: { cursor: MypageListCursor | null; limit: number; filter: "all" | "open" | "done" }
): Promise<{ items: MyReportItem[]; next_cursor: string | null }> {
  const limit = Math.min(Math.max(opts.limit, 1), 50);
  const results = await Promise.all(
    MY_REPORT_SOURCES.map(async (source) => {
      const spec = SPECS[source];
      let q = sb.from(spec.table).select(spec.select).eq(spec.reporterCol, userId);
      if (opts.cursor) q = q.lte("created_at", opts.cursor.ts);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(limit + 20);
      if (error) {
        if (isMissingTable(error.message ?? "")) return [] as MyReportItem[];
        throw new Error(`my_reports_load_failed:${source}:${error.message}`);
      }
      return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => toItem(source, r));
    })
  );
  // 커서 id 는 영문·숫자·_- 만 허용(mypage-list-cursor) → `source-id`.
  const keyOf = (r: MyReportItem) => `${r.source}-${r.id}`;
  let merged = results
    .flat()
    .filter((r) =>
      opts.filter === "open"
        ? r.stage === "received" || r.stage === "reviewing"
        : opts.filter === "done"
          ? r.stage === "resolved" || r.stage === "rejected"
          : true
    )
    .sort((a, b) => compareKeysetDesc(a.createdAt, keyOf(a), b.createdAt, keyOf(b)));
  if (opts.cursor) {
    const c = opts.cursor;
    merged = merged.filter((r) => compareKeysetDesc(c.ts, c.id, r.createdAt, keyOf(r)) < 0);
  }
  const page = merged.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page,
    next_cursor: merged.length > limit && last ? encodeMypageListCursor(last.createdAt, keyOf(last)) : null,
  };
}

/** 본인 신고만 — 다른 회원의 신고 id 는 not_found. */
export async function loadMyReportDetail(
  sb: SupabaseClient,
  userId: string,
  source: MyReportSource,
  id: string
): Promise<MyReportItem | null> {
  const spec = SPECS[source];
  const { data, error } = await sb
    .from(spec.table)
    .select(spec.select)
    .eq("id", id)
    .eq(spec.reporterCol, userId)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error.message ?? "")) return null;
    throw new Error(`my_report_load_failed:${source}:${error.message}`);
  }
  return data ? toItem(source, data as unknown as Record<string, unknown>) : null;
}
