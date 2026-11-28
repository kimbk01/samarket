/**
 * Support mark-read idempotency — closes Realtime self-loop.
 * already-read → no UPDATE; unread>0 → one transition write.
 */
import { describe, expect, it, vi } from "vitest";
import {
  markSupportCaseReadForAdmin,
  markSupportCaseReadForRequester,
} from "@/lib/support/support-case-service";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type FakeRow = {
  id: string;
  requester_user_id: string;
  audience: "MEMBER" | "OWNER";
  owner_store_id: string | null;
  requester_unread_count: number;
  admin_unread_count: number;
  last_message_at?: string;
};

function makeSb(opts: {
  row: FakeRow | null;
  onUpdate?: (patch: Record<string, unknown>) => void;
}) {
  const update = vi.fn(async (patch: Record<string, unknown>) => {
    opts.onUpdate?.(patch);
    return { data: null, error: null };
  });
  const maybeSingle = vi.fn(async () => ({
    data: opts.row,
    error: null,
  }));
  // chain: from().select().eq().maybeSingle() and from().update().eq()
  const from = vi.fn((table: string) => {
    expect(table).toBe("support_cases");
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle,
        })),
      })),
      // 2차 재감사 E: update().eq(id).eq(last_message_at) — 마지막 await 1번 = UPDATE 1번
      update: (patch: Record<string, unknown>) => {
        const link = (): { eq: () => unknown; then: PromiseLike<unknown>["then"] } => ({
          eq: vi.fn(() => link()),
          then: (onFulfilled, onRejected) =>
            update(patch)
              .then(() => ({ data: null, error: null }))
              .then(onFulfilled, onRejected),
        });
        return link();
      },
    };
  });
  return { sb: { from } as never, update, maybeSingle };
}

const CASE_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

/**
 * T-1 (전체 재감사 2026-11-28): CASE2·4 는 가짜 행에 `last_message_at` 이 없어 기준 시각이 "" → 세기를 건너뛰었다.
 * 실제 경로(본 시각 뒤 상대방 공개 글 세기 → CAS UPDATE)를 타도록 문의 행·글 세기·조건 UPDATE 를 모두 흉내 낸다.
 */
function makeCountingSb(opts: { repliesAfter: number }) {
  const countFilters: [string, unknown][] = [];
  const updates: { patch: Record<string, unknown>; where: [string, unknown][] }[] = [];
  const from = (table: string) => {
    if (table === "support_messages") {
      const q: Record<string, unknown> = {};
      const rec = (op: string) => (col: string, val: unknown) => (countFilters.push([`${op}:${col}`, val]), q);
      Object.assign(q, {
        select: () => q,
        eq: rec("eq"),
        is: rec("is"),
        gt: rec("gt"),
        in: rec("in"),
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ count: opts.repliesAfter, error: null }).then(ok),
      });
      return q;
    }
    expect(table).toBe("support_cases");
    return {
      update: (patch: Record<string, unknown>) => {
        const where: [string, unknown][] = [];
        updates.push({ patch, where });
        const link: Record<string, unknown> = {
          eq: (col: string, val: unknown) => (where.push([col, val]), link),
          then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(ok),
        };
        return link;
      },
    };
  };
  return { sb: { from } as never, countFilters, updates };
}

const LAST_AT = "2026-11-28T03:00:00.000Z";
const SEEN_AT = "2026-11-28T02:00:00.000Z";
const caseRowFor = (over: Partial<FakeRow>) =>
  ({
    id: CASE_ID,
    requester_user_id: USER_ID,
    audience: "MEMBER",
    owner_store_id: null,
    requester_unread_count: 0,
    admin_unread_count: 0,
    last_message_at: LAST_AT,
    ...over,
  }) as never;

describe("support mark-read idempotency (self-loop close)", () => {
  it("CASE1 already-read requester → no UPDATE (wrote:false)", async () => {
    const { sb, update } = makeSb({
      row: {
        id: CASE_ID,
        requester_user_id: USER_ID,
        audience: "MEMBER",
        owner_store_id: null,
        requester_unread_count: 0,
        admin_unread_count: 0,
      },
    });
    const res = await markSupportCaseReadForRequester(sb, {
      userId: USER_ID,
      caseId: CASE_ID,
    });
    expect(res).toEqual({ ok: true, wrote: false });
    expect(update).not.toHaveBeenCalled();
  });

  it("CASE2 unread requester → 본 시각 뒤 답변 수를 세어 그 값으로 1번 UPDATE (CAS: 숫자 + 마지막 글 시각)", async () => {
    const { sb, countFilters, updates } = makeCountingSb({ repliesAfter: 1 });
    const res = await markSupportCaseReadForRequester(sb, {
      userId: USER_ID,
      caseId: CASE_ID,
      seenLastMessageAt: SEEN_AT,
      caseRow: caseRowFor({ requester_unread_count: 2 }),
    });
    expect(res).toEqual({ ok: true, wrote: true });
    expect(countFilters).toContainEqual(["gt:created_at", SEEN_AT]);
    expect(countFilters).toContainEqual(["eq:sender_type", "ADMIN"]);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.patch).toMatchObject({ requester_unread_count: 1 });
    expect(updates[0]!.where).toEqual([
      ["id", CASE_ID],
      ["requester_unread_count", 2],
      ["last_message_at", LAST_AT],
    ]);
  });

  it("CASE3 admin already-read → no UPDATE", async () => {
    const { sb, update } = makeSb({
      row: {
        id: CASE_ID,
        requester_user_id: USER_ID,
        audience: "MEMBER",
        owner_store_id: null,
        requester_unread_count: 0,
        admin_unread_count: 0,
      },
    });
    const res = await markSupportCaseReadForAdmin(sb, CASE_ID);
    expect(res).toEqual({ ok: true, wrote: false });
    expect(update).not.toHaveBeenCalled();
  });

  it("CASE4 admin unread → 본 시각 뒤 고객 글 0 → 0 으로 1번 UPDATE · 계산값 = 지금 값이면 UPDATE 없음", async () => {
    const { sb, countFilters, updates } = makeCountingSb({ repliesAfter: 0 });
    const res = await markSupportCaseReadForAdmin(sb, CASE_ID, SEEN_AT, caseRowFor({ admin_unread_count: 3 }));
    expect(res).toEqual({ ok: true, wrote: true });
    expect(countFilters).toContainEqual(["in:sender_type", ["MEMBER", "OWNER"]]);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.patch).toMatchObject({ admin_unread_count: 0 });
    const same = makeCountingSb({ repliesAfter: 3 });
    expect(await markSupportCaseReadForAdmin(same.sb, CASE_ID, SEEN_AT, caseRowFor({ admin_unread_count: 3 }))).toEqual({
      ok: true,
      wrote: false,
    });
    expect(same.updates).toHaveLength(0);
  });

  it("CASE5 접수형 문의 상세는 실시간 구독 없음 — 열 때 1회 읽기(채팅과 별도 운영, Owner 2026-11-10)", () => {
    const host =
      readFileSync(join(process.cwd(), "components/support/SupportModalHost.tsx"), "utf8") +
      readFileSync(join(process.cwd(), "components/support/SupportTicketViews.tsx"), "utf8");
    expect(host).not.toContain("postgres_changes");
    expect(host).not.toContain('table: "support_messages"');
    expect(host).toContain("void load();");
  });

  it("CASE6 (전체 수정 §3): GET 은 읽기만 — 읽음은 seen 요청이 원장으로 (멱등 계약 유지)", () => {
    const route = readFileSync(
      join(process.cwd(), "app/api/support/cases/[caseId]/route.ts"),
      "utf8"
    );
    const get = route.slice(route.indexOf("export async function GET"), route.indexOf("export async function POST"));
    expect(get).not.toContain("markSupportCase");
    expect(route).toContain("requesterSeenSupportCase(sb");
    const svc = readFileSync(
      join(process.cwd(), "lib/support/support-notification-ledger.ts"),
      "utf8"
    );
    expect(svc).toMatch(/unread <= 0/);
    expect(svc).toContain("wrote: false");
  });
});
