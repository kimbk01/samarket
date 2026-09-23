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
  const eq = vi.fn(() => ({
    maybeSingle,
    eq: vi.fn(() => ({ maybeSingle })),
    update: undefined as unknown,
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
      update: (patch: Record<string, unknown>) => {
        const chain = {
          eq: vi.fn(async () => {
            await update(patch);
            return { data: null, error: null };
          }),
        };
        return chain;
      },
    };
  });
  return { sb: { from } as never, update, maybeSingle };
}

const CASE_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

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

  it("CASE2 unread requester → exactly one UPDATE clearing unread", async () => {
    const patches: Record<string, unknown>[] = [];
    const { sb, update } = makeSb({
      row: {
        id: CASE_ID,
        requester_user_id: USER_ID,
        audience: "MEMBER",
        owner_store_id: null,
        requester_unread_count: 2,
        admin_unread_count: 0,
      },
      onUpdate: (p) => patches.push(p),
    });
    const res = await markSupportCaseReadForRequester(sb, {
      userId: USER_ID,
      caseId: CASE_ID,
    });
    expect(res).toEqual({ ok: true, wrote: true });
    expect(update).toHaveBeenCalledTimes(1);
    expect(patches[0]).toMatchObject({ requester_unread_count: 0 });
    expect(typeof patches[0]!.updated_at).toBe("string");
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

  it("CASE4 admin unread → one UPDATE", async () => {
    const { sb, update } = makeSb({
      row: {
        id: CASE_ID,
        requester_user_id: USER_ID,
        audience: "MEMBER",
        owner_store_id: null,
        requester_unread_count: 0,
        admin_unread_count: 3,
      },
    });
    const res = await markSupportCaseReadForAdmin(sb, CASE_ID);
    expect(res).toEqual({ ok: true, wrote: true });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("CASE5 client still subscribes messages INSERT + cases UPDATE (legitimate refresh preserved)", () => {
    const host = readFileSync(
      join(process.cwd(), "components/support/SupportModalHost.tsx"),
      "utf8"
    );
    expect(host).toContain('table: "support_messages"');
    expect(host).toContain('event: "INSERT"');
    expect(host).toContain('table: "support_cases"');
    expect(host).toContain('event: "UPDATE"');
    expect(host).toContain("void load({ silent: true })");
  });

  it("CASE6 GET route still marks read (unread semantics entry preserved)", () => {
    const route = readFileSync(
      join(process.cwd(), "app/api/support/cases/[caseId]/route.ts"),
      "utf8"
    );
    expect(route).toContain("markSupportCaseReadForRequester");
    const svc = readFileSync(
      join(process.cwd(), "lib/support/support-case-service.ts"),
      "utf8"
    );
    expect(svc).toMatch(/unread <= 0/);
    expect(svc).toContain("wrote: false");
  });
});
