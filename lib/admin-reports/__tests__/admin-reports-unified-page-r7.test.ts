/**
 * R7 — 통합 신고 목록(`/admin/reports`) 서버 페이지 계약 (가짜 DB).
 * 거래(reports)·커뮤니티(community_reports) 병합·필터·정렬·페이지·total = RPC `admin_reports_unified_page` 한 번.
 * 고정 상한(거래 처리 대기 2000·처리 완료 300 · 커뮤니티 300) 없음. 파라미터 없는 예전 호출은 예전 응답 그대로.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type Call = { kind: "rpc" | "from"; name: string; args?: unknown; ops: string[] };
const calls: Call[] = [];
let rpcPayload: unknown = { total: 0, rows: [] };

function fromChain(name: string) {
  const call: Call = { kind: "from", name, ops: [] };
  calls.push(call);
  const chain: Record<string, unknown> = {};
  for (const op of ["select", "in", "not", "eq", "or", "order", "limit", "range", "maybeSingle"]) {
    chain[op] = (...a: unknown[]) => {
      call.ops.push(`${op}:${JSON.stringify(a)}`);
      return chain;
    };
  }
  chain.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res);
  return chain;
}

const fakeSb = {
  rpc: (name: string, args: unknown) => {
    calls.push({ kind: "rpc", name, args, ops: [] });
    return Promise.resolve({ data: rpcPayload, error: null });
  },
  from: (name: string) => fromChain(name),
};

vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireAdminPermission: async () => ({ ok: true, sb: fakeSb, actor: { userId: "admin-1", isSuperAdmin: true } }),
}));
vi.mock("@/lib/admin-community/member-identity", () => ({
  loadAdminMemberIdentityMap: async (_sb: unknown, ids: string[]) =>
    new Map(ids.filter(Boolean).map((id) => [id, { id, nickname: `닉-${id}` }])),
  formatAdminMemberLabel: (identity: { nickname?: string } | null, fallback?: string) =>
    identity?.nickname ?? fallback ?? "",
}));
vi.mock("@/lib/community-feed/admin-community-reports", () => ({
  enrichCommunityReportRowsForAdmin: async (raw: Record<string, unknown>[]) =>
    raw.map((r) => ({
      id: String(r.id),
      target_type: String(r.target_type),
      target_id: String(r.target_id),
      reporter_id: String(r.user_id),
      reason_type: String(r.reason ?? "").split(":")[0],
      reason_text: r.reason ?? null,
      status: String(r.status),
      admin_memo: null,
      processed_at: null,
      created_at: String(r.created_at),
      post_title: "글 제목",
      post_author_id: "author-1",
      reporter_identity: { id: String(r.user_id) },
      reporter_label: "커뮤니티 신고자",
    })),
}));

import { GET } from "@/app/api/admin/reports/route";
import {
  ADMIN_REPORTS_UNIFIED_PAGE_RPC,
  adminReportsPageRpcArgs,
  parseAdminReportsPageQuery,
} from "@/lib/admin-reports/admin-reports-unified-page.server";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const req = (qs: string) => new NextRequest(`https://x.test/api/admin/reports${qs}`);

beforeEach(() => {
  calls.length = 0;
  rpcPayload = { total: 0, rows: [] };
});

describe("통합 신고 — R7 서버 페이지", () => {
  it("limit/offset + 필터 → RPC 인자 (도메인·상태·대상 유형·사유·대상 id), 페이지 상한 100", () => {
    const q = parseAdminReportsPageQuery(
      new URLSearchParams("limit=50&offset=100&domain=community&status=pending&target_type=community&reason=spam&target=abc")
    );
    expect(adminReportsPageRpcArgs(q)).toEqual({
      p_sources: ["community_feed"],
      p_status: "pending",
      p_target_type: "community",
      p_reason: "spam",
      p_target_q: "abc",
      p_limit: 50,
      p_offset: 100,
    });
    const big = parseAdminReportsPageQuery(new URLSearchParams("limit=5000&offset=-3&domain=trade&status=bogus"));
    expect(big.limit).toBe(100);
    expect(big.offset).toBe(0);
    expect(big.status).toBe("");
    expect(adminReportsPageRpcArgs(big).p_sources).toEqual(["reports"]);
    // 도메인 전체(기본) = 두 원장 합침 · 예전 `?targetType=` 키도 읽는다
    const all = parseAdminReportsPageQuery(new URLSearchParams("limit=20&offset=0&targetType=chat"));
    expect(adminReportsPageRpcArgs(all).p_sources).toEqual(["reports", "community_feed"]);
    expect(all.targetType).toBe("chat");
  });

  it("페이지 모드: RPC 한 번 · DB total · RPC 정렬 순서 유지 · reports 테이블 고정 상한 조회 없음", async () => {
    rpcPayload = {
      total: 1234,
      rows: [
        {
          source: "community_feed",
          id: "c1",
          created_at: "2026-10-19T10:00:00Z",
          row: { id: "c1", target_type: "post", target_id: "p9", user_id: "u2", reason: "spam: x", status: "open", created_at: "2026-10-19T10:00:00Z" },
        },
        {
          source: "reports",
          id: "t1",
          created_at: "2026-10-19T09:00:00Z",
          row: {
            id: "t1", reporter_id: "u1", target_type: "chat_room", target_id: "room-1", room_id: null, product_id: null,
            reason_code: "fraud", reason_text: null, status: "pending", admin_note: null,
            created_at: "2026-10-19T09:00:00Z", resolved_at: null, resolved_by: null,
          },
        },
      ],
    };
    const res = await GET(req("?limit=20&offset=40&domain=all"));
    const json = (await res.json()) as { ok: boolean; total: number; limit: number; offset: number; reports: { id: string; reportSource: string; status: string; targetType: string; targetUserId: string }[] };
    expect(json.ok).toBe(true);
    expect(json.total).toBe(1234);
    expect(json.limit).toBe(20);
    expect(json.offset).toBe(40);
    expect(json.reports.map((r) => `${r.reportSource}:${r.id}`)).toEqual(["community_feed:c1", "reports:t1"]);
    expect(json.reports[0].status).toBe("pending");
    expect(json.reports[1].targetType).toBe("chat");
    expect(json.reports[1].targetUserId).toBe("");

    const rpcCalls = calls.filter((c) => c.kind === "rpc");
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].name).toBe(ADMIN_REPORTS_UNIFIED_PAGE_RPC);
    expect(rpcCalls[0].args).toMatchObject({ p_sources: ["reports", "community_feed"], p_limit: 20, p_offset: 40 });
    expect(calls.some((c) => c.kind === "from" && c.name === "reports")).toBe(false);
    expect(calls.some((c) => c.kind === "from" && c.name === "community_reports")).toBe(false);
  });

  it("예전 호출(파라미터 없음)은 예전 응답 모양 그대로 — total 없음, RPC 안 부름", async () => {
    const res = await GET(req(""));
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.ok).toBe(true);
    expect(Array.isArray(json.reports)).toBe(true);
    expect("total" in json).toBe(false);
    expect(calls.some((c) => c.kind === "rpc")).toBe(false);
  });

  it("RPC 실패는 빈 목록이 아니라 오류 (「신고 없음」 오인 방지)", async () => {
    const orig = fakeSb.rpc;
    fakeSb.rpc = () => Promise.resolve({ data: null, error: { message: "boom" } }) as never;
    try {
      const res = await GET(req("?limit=20&offset=0"));
      expect(res.status).toBe(500);
      expect(((await res.json()) as { ok: boolean }).ok).toBe(false);
    } finally {
      fakeSb.rpc = orig;
    }
  });

  it("화면: 서버 페이지 API + 표준 페이지네이션, 브라우저 병합·커뮤니티 300건 조회 없음 · URL 키 유지", () => {
    const page = read("components/admin/reports/AdminReportListPage.tsx");
    expect(page).toContain("getReportsPageForAdminFromDb");
    expect(page).toContain("<AdminPagination");
    expect(page).not.toContain('fetch("/api/admin/community-reports"');
    expect(page).not.toContain("filterReports(");
    for (const key of ['"domain"', '"target_type"', '"reason"', 'searchParams.get("from")', 'searchParams.get("targetType")', 'searchParams.get("target")']) {
      expect(page).toContain(key);
    }
    const sql = read("supabase/migrations/20270601120000_r7_admin_reports_unified_page.sql");
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.admin_reports_unified_page\([^)]*\) FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_reports_unified_page\([^)]*\) TO service_role/);
    expect(sql).toContain("ORDER BY f.created_at DESC NULLS LAST, f.id DESC, f.source");
  });
});
