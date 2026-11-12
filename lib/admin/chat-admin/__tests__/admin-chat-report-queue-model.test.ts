import { describe, expect, it } from "vitest";
import {
  buildChatReportQueueSearch,
  chatReportBucketOf,
  chatReportRawStatuses,
  mergeChatReportQueuePage,
  parseChatReportQueueQuery,
  type ChatReportQueueRow,
  type ChatReportSource,
} from "@/lib/admin/chat-admin/admin-chat-report-queue-model";
import { decodeAdminKeysetCursor } from "@/lib/admin/chat-admin/admin-chat-list-url-state";
import { CHAT_REPORT_OPEN_STATUSES } from "@/lib/admin/metrics/chat-metrics";

function row(source: ChatReportSource, id: string, createdAt: string): ChatReportQueueRow {
  return {
    key: `${source}:${id}`,
    source,
    id,
    createdAt,
    rawStatus: "received",
    bucket: "received",
    targetType: "room",
    reasonCode: "spam",
    reasonDetail: "",
    roomId: null,
    roomKind: null,
    messageId: null,
    reporterId: null,
    reporterLabel: "",
    reportedUserId: null,
    reportedUserLabel: "",
    adminNote: "",
    handledAt: null,
  };
}

describe("채팅 신고 단일 큐 — 병합 페이지 (O-C10)", () => {
  const cm = [
    row("messenger", "c3", "2026-10-19T10:00:00.000Z"),
    row("messenger", "c2", "2026-10-18T10:00:00.000Z"),
    row("messenger", "c1", "2026-10-10T10:00:00.000Z"),
  ];
  const legacy = [
    row("trade_chat", "l2", "2026-10-19T09:00:00.000Z"),
    row("trade_chat", "l1", "2026-10-11T09:00:00.000Z"),
  ];
  const reports = [row("trade_report", "r1", "2026-10-18T10:00:00.000Z")];

  it("merges three sources newest-first with a stable key tie-break", () => {
    const page = mergeChatReportQueuePage(
      [
        { rows: cm, full: false },
        { rows: legacy, full: false },
        { rows: reports, full: false },
      ],
      null,
      10
    );
    expect(page.rows.map((r) => r.key)).toEqual([
      "messenger:c3",
      "trade_chat:l2",
      "trade_report:r1",
      "messenger:c2",
      "trade_chat:l1",
      "messenger:c1",
    ]);
    expect(page.nextCursor).toBeNull();
  });

  it("paginates by keyset cursor without gaps or duplicates", () => {
    const batches = [
      { rows: cm, full: false },
      { rows: legacy, full: false },
      { rows: reports, full: false },
    ];
    const p1 = mergeChatReportQueuePage(batches, null, 3);
    expect(p1.rows.map((r) => r.key)).toEqual(["messenger:c3", "trade_chat:l2", "trade_report:r1"]);
    expect(p1.nextCursor).toBeTruthy();
    const cursor = decodeAdminKeysetCursor(p1.nextCursor);
    expect(cursor).toEqual({ ts: "2026-10-18T10:00:00.000Z", id: "trade_report:r1" });
    const p2 = mergeChatReportQueuePage(batches, cursor, 3);
    // same timestamp as cursor: messenger:c2 < trade_report:r1 → after cursor
    expect(p2.rows.map((r) => r.key)).toEqual(["messenger:c2", "trade_chat:l1", "messenger:c1"]);
    expect(p2.nextCursor).toBeNull();
  });

  it("keeps a next cursor when any source returned a full batch", () => {
    const page = mergeChatReportQueuePage([{ rows: cm.slice(0, 2), full: true }], null, 5);
    expect(page.rows).toHaveLength(2);
    expect(page.nextCursor).not.toBeNull();
  });
});

describe("채팅 신고 큐 — 상태 묶음은 대시보드 지표와 같은 원시 상태", () => {
  it("open = dashboard CHAT_REPORT_OPEN_STATUSES per source", () => {
    for (const source of ["messenger", "trade_chat", "trade_report"] as const) {
      expect(new Set(chatReportRawStatuses(source, "open"))).toEqual(
        new Set(CHAT_REPORT_OPEN_STATUSES[source])
      );
    }
    expect(chatReportRawStatuses("messenger", "all")).toBeNull();
    expect(chatReportRawStatuses("trade_chat", "resolved")).toEqual(["actioned"]);
  });

  it("buckets raw statuses", () => {
    expect(chatReportBucketOf("messenger", "sanctioned")).toBe("resolved");
    expect(chatReportBucketOf("messenger", "rejected")).toBe("dismissed");
    expect(chatReportBucketOf("trade_chat", "escalated")).toBe("reviewing");
    expect(chatReportBucketOf("trade_report", "pending")).toBe("received");
  });
});

describe("채팅 신고 큐 — URL 상태", () => {
  it("parses dashboard links (status=open&type=…) and legacy aliases", () => {
    expect(parseChatReportQueueQuery(new URLSearchParams("status=open&type=trade_chat"))).toMatchObject({
      source: "trade_chat",
      status: "open",
    });
    expect(parseChatReportQueueQuery(new URLSearchParams("source=reports")).source).toBe("trade_report");
    expect(parseChatReportQueueQuery(new URLSearchParams("type=bogus&status=bogus"))).toMatchObject({
      source: "all",
      status: "open",
      target: "",
      cursor: "",
    });
  });

  it("reads the 「신고 보기」 target param (and legacy targetId) as a uuid only", () => {
    const id = "11111111-2222-4333-8444-555555555555";
    expect(parseChatReportQueueQuery(new URLSearchParams(`target=${id}`)).target).toBe(id);
    expect(parseChatReportQueueQuery(new URLSearchParams(`targetId=${id}`)).target).toBe(id);
    expect(parseChatReportQueueQuery(new URLSearchParams("target=not-a-uuid")).target).toBe("");
  });

  it("round-trips through build → parse and omits defaults", () => {
    expect(buildChatReportQueueSearch({ source: "all", status: "open" })).toBe("");
    const search = buildChatReportQueueSearch({
      source: "messenger",
      status: "resolved",
      cursor: "2026-10-18T10:00:00.000Z~messenger:c2",
    });
    const parsed = parseChatReportQueueQuery(new URLSearchParams(search.slice(1)));
    expect(parsed).toMatchObject({
      source: "messenger",
      status: "resolved",
      cursor: "2026-10-18T10:00:00.000Z~messenger:c2",
    });
  });
});
