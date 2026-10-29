/**
 * RS-02 (감사 2026-10-30 보완 §2) — 원장 통합 조회 병합 계약 (순수 함수).
 * 누락 없음(원장별 건수 합 = 총건수 · 전 쪽 순회 = 전체 행) · 중복 없음((source,id) 유일) · 권한 제외 표시 ·
 * (created_at DESC, id DESC) 커서 — 경계 동일 시각 · 원장 0건 · 마지막 쪽 · offset 원장(기존 RPC) 혼합.
 */
import { describe, expect, it } from "vitest";
import {
  compareLedgerRows,
  decodeLedgerCursor,
  encodeLedgerCursor,
  ledgerKeysetOrFilter,
  ledgerRowKey,
  ledgerTimeKey,
  mergeLedgerPage,
  type LedgerCursorMap,
  type LedgerMergeResult,
  type LedgerMergeRow,
  type LedgerSourceBatch,
} from "@/lib/admin-reports/admin-ledger-merge";
import {
  adminReportLedgerRawStatuses,
  adminReportLedgerUiStatus,
  adminTradeReportsHrefFromCentral,
  ADMIN_REPORT_READ_ONLY_LEDGERS,
} from "@/lib/admin-reports/admin-report-ledger-sources";

type Row = LedgerMergeRow;

/** 원장 하나를 DB 처럼 흉내 — 커서 뒤 상위 page+1 건 (keyset) 또는 offset 슬라이스. */
function fakeBatch(
  source: string,
  all: Row[],
  mode: "keyset" | "offset",
  cursors: LedgerCursorMap,
  limit: number
): LedgerSourceBatch<Row> {
  const sorted = [...all].sort(compareLedgerRows);
  const cursor = cursors[source] ?? null;
  if (cursor?.k === "done") return { source, mode, cursor, rows: [], count: all.length };
  let rows: Row[];
  if (mode === "offset") {
    const o = cursor?.k === "offset" ? cursor.o : 0;
    rows = sorted.slice(o, o + limit + 1);
  } else {
    const after =
      cursor?.k === "keyset"
        ? sorted.filter((r) => compareLedgerRows(r, { source, id: cursor.id, createdAt: cursor.ts }) > 0)
        : sorted;
    rows = after.slice(0, limit + 1);
  }
  return { source, mode, cursor, rows, count: all.length };
}

function walkAll(sources: { source: string; rows: Row[]; mode: "keyset" | "offset" }[], limit: number) {
  const pages: Row[][] = [];
  let raw: string | null = null;
  const names = sources.map((s) => s.source);
  let totals: number[] = [];
  for (let guard = 0; guard < 100; guard += 1) {
    const cursors: LedgerCursorMap = decodeLedgerCursor(raw, names) ?? {};
    const res: LedgerMergeResult<Row> = mergeLedgerPage(
      sources.map((s) => fakeBatch(s.source, s.rows, s.mode, cursors, limit)),
      limit
    );
    pages.push(res.rows);
    totals.push(res.total);
    if (!res.nextCursor) break;
    raw = res.nextCursor;
  }
  totals = [...new Set(totals)];
  return { pages, totals };
}

const ts = (min: number, micro = 0) =>
  `2026-10-30T01:${String(min).padStart(2, "0")}:00.${String(micro).padStart(6, "0")}+00:00`;
const mk = (source: string, n: number, at: (i: number) => string): Row[] =>
  Array.from({ length: n }, (_, i) => ({ source, id: `${source.slice(0, 2)}-${String(i).padStart(3, "0")}`, createdAt: at(i) }));

describe("원장 병합 — 누락·중복 없음", () => {
  it("원장 6종 순회: 전 쪽 합 = 원장별 행 전체, 키 (source,id) 유일, 총건수 = Σ 원장 건수, 전역 정렬 유지", () => {
    const sources = [
      { source: "reports", rows: mk("reports", 7, (i) => ts(i * 3)), mode: "offset" as const },
      { source: "community_feed", rows: mk("community_feed", 3, (i) => ts(i * 5 + 1)), mode: "offset" as const },
      { source: "store_reports", rows: mk("store_reports", 0, () => ts(0)), mode: "keyset" as const },
      { source: "meeting_reports", rows: mk("meeting_reports", 4, (i) => ts(i * 2)), mode: "keyset" as const },
      { source: "community_messenger_reports", rows: mk("community_messenger_reports", 5, () => ts(10)), mode: "keyset" as const },
      { source: "chat_reports", rows: mk("chat_reports", 2, (i) => ts(30 + i)), mode: "keyset" as const },
    ];
    for (const limit of [1, 2, 3, 5, 20]) {
      const { pages, totals } = walkAll(sources, limit);
      const flat = pages.flat();
      const expected = sources.flatMap((s) => s.rows).sort(compareLedgerRows);
      expect(totals).toEqual([21]);
      expect(flat.map(ledgerRowKey)).toEqual(expected.map(ledgerRowKey));
      expect(new Set(flat.map(ledgerRowKey)).size).toBe(flat.length);
      for (const p of pages.slice(0, -1)) expect(p.length).toBe(limit);
    }
  });

  it("경계 동일 시각(같은 μs·다른 원장) — 쪽 경계에서 빠지거나 겹치지 않는다", () => {
    const same = ts(5, 123456);
    const sources = [
      { source: "store_reports", rows: mk("store_reports", 4, () => same), mode: "keyset" as const },
      { source: "chat_reports", rows: mk("chat_reports", 4, () => same), mode: "keyset" as const },
      { source: "reports", rows: mk("reports", 3, () => same), mode: "offset" as const },
    ];
    const { pages } = walkAll(sources, 3);
    const flat = pages.flat();
    expect(flat).toHaveLength(11);
    expect(new Set(flat.map(ledgerRowKey)).size).toBe(11);
  });

  it("같은 ms 다른 μs 는 DB 와 같은 순서 (JS Date 는 ms 까지만)", () => {
    expect(ledgerTimeKey("2026-10-30T01:00:00.000002+00:00")).toBeGreaterThan(ledgerTimeKey("2026-10-30T01:00:00.000001+00:00"));
    expect(ledgerTimeKey("2026-10-30 01:00:00+00")).toBe(Date.parse("2026-10-30T01:00:00Z") * 1000);
    expect(ledgerTimeKey("")).toBe(0);
  });

  it("원장 0건 · 마지막 쪽 · 한 원장 중복 행 입력도 한 번만", () => {
    const empty = mergeLedgerPage(
      [
        { source: "a", mode: "keyset", cursor: null, rows: [], count: 0 },
        { source: "b", mode: "offset", cursor: null, rows: [], count: 0 },
      ],
      20
    );
    expect(empty).toMatchObject({ rows: [], nextCursor: null, total: 0, sourceCounts: { a: 0, b: 0 } });

    const dupRow = { source: "a", id: "x", createdAt: ts(1) };
    const last = mergeLedgerPage([{ source: "a", mode: "keyset", cursor: null, rows: [dupRow, dupRow], count: 1 }], 20);
    expect(last.rows).toHaveLength(1);
    expect(last.nextCursor).toBeNull();
  });

  it("다 읽은 원장(done)은 다시 읽지 않고 건수만 더한다", () => {
    const res = mergeLedgerPage(
      [
        { source: "a", mode: "keyset", cursor: { k: "done" }, rows: [{ source: "a", id: "z", createdAt: ts(59) }], count: 9 },
        { source: "b", mode: "keyset", cursor: null, rows: [{ source: "b", id: "1", createdAt: ts(1) }], count: 1 },
      ],
      5
    );
    expect(res.rows.map(ledgerRowKey)).toEqual(["b:1"]);
    expect(res.total).toBe(10);
  });
});

describe("원장 커서 인코딩", () => {
  it("왕복 · 모르는 원장 키·잘못된 값 버림 · 깨진 문자열 = 처음 쪽", () => {
    const map: LedgerCursorMap = {
      reports: { k: "offset", o: 40 },
      store_reports: { k: "keyset", ts: ts(3, 5), id: "6f1c2d3e-0000-4000-8000-000000000001" },
      chat_reports: { k: "done" },
    };
    const enc = encodeLedgerCursor(map);
    expect(enc).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeLedgerCursor(enc, ["reports", "store_reports", "chat_reports"])).toEqual(map);
    expect(decodeLedgerCursor(enc, ["reports"])).toEqual({ reports: { k: "offset", o: 40 } });
    expect(decodeLedgerCursor(encodeLedgerCursor({ a: { k: "keyset", ts: ts(1), id: "x,id.gt.0" } }), ["a"])).toBeNull();
    expect(decodeLedgerCursor("%%%", ["a"])).toBeNull();
    expect(decodeLedgerCursor("", ["a"])).toBeNull();
  });

  it("keyset 조건 = (created_at < ts) or (created_at = ts and id < id)", () => {
    expect(ledgerKeysetOrFilter({ ts: "2026-10-30T01:00:00+00:00", id: "abc" })).toBe(
      "created_at.lt.2026-10-30T01:00:00+00:00,and(created_at.eq.2026-10-30T01:00:00+00:00,id.lt.abc)"
    );
  });
});

describe("원장 상태 매핑 (처리 대기 / 처리 완료 / 반려)", () => {
  it("원장 원시 상태 → 화면 상태, 화면 상태 필터 → 원시 상태 목록 (왕복 일치)", () => {
    expect(adminReportLedgerUiStatus("store_reports", "open")).toBe("pending");
    expect(adminReportLedgerUiStatus("store_reports", "actioned")).toBe("resolved");
    expect(adminReportLedgerUiStatus("chat_reports", "escalated")).toBe("reviewing");
    expect(adminReportLedgerUiStatus("community_messenger_reports", "sanctioned")).toBe("sanctioned");
    expect(adminReportLedgerUiStatus("meeting_reports", "weird")).toBe("pending");
    expect(adminReportLedgerRawStatuses("chat_reports", "reviewing")).toEqual(["triaging", "escalated"]);
    expect(adminReportLedgerRawStatuses("store_reports", "sanctioned")).toEqual([]);
    expect(adminReportLedgerRawStatuses("meeting_reports", "")).toBeNull();
    for (const src of ADMIN_REPORT_READ_ONLY_LEDGERS) {
      for (const ui of ["pending", "reviewing", "resolved", "rejected", "sanctioned", "reviewed"]) {
        for (const raw of adminReportLedgerRawStatuses(src, ui) ?? []) {
          expect(adminReportLedgerUiStatus(src, raw)).toBe(ui);
        }
      }
    }
  });

  it("RS-03 — 거래 신고 화면 링크는 redirect 없이 상태·대상 조건을 그대로 넘긴다", () => {
    expect(adminTradeReportsHrefFromCentral({ status: "pending", targetType: "chat", target: "room-1" })).toBe(
      "/admin/trade/reports?targetType=chat_room&targetId=room-1"
    );
    expect(adminTradeReportsHrefFromCentral({ status: "sanctioned" })).toBe("/admin/trade/reports?tab=sanctioned");
    expect(adminTradeReportsHrefFromCentral({ status: "rejected", targetType: "community" })).toBe(
      "/admin/trade/reports?tab=rejected"
    );
    expect(adminTradeReportsHrefFromCentral({ status: "" })).toBe("/admin/trade/reports?tab=all");
  });
});
