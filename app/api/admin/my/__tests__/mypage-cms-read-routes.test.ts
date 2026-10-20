import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminApiUser = vi.fn();
const tryCreateSupabaseServiceClient = vi.fn();

vi.mock("@/lib/admin/require-admin-api", () => ({
  requireAdminApiUser: (...args: unknown[]) => requireAdminApiUser(...args),
}));
vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => tryCreateSupabaseServiceClient(),
}));

function fakeSb(result: { data: unknown; error: { message: string } | null }) {
  const calls: { table?: string; select?: string; order?: [string, unknown] } = {};
  const sb = {
    from: (table: string) => {
      calls.table = table;
      return {
        select: (cols: string) => {
          calls.select = cols;
          return {
            order: async (col: string, opts: unknown) => {
              calls.order = [col, opts];
              return result;
            },
          };
        },
      };
    },
  };
  return { sb, calls };
}

const CASES = [
  {
    name: "sections",
    load: () => import("../sections/route"),
    table: "my_page_sections",
    key: "sections",
    rows: [{ section_key: "trade", title: "나의 거래", is_active: true, sort_order: 1 }],
  },
  {
    name: "services",
    load: () => import("../services/route"),
    table: "my_services",
    key: "services",
    rows: [
      {
        code: "coupon",
        label: "쿠폰",
        icon_key: "coupon",
        href: "/my/coupons",
        is_active: false,
        sort_order: 3,
        admin_only: false,
        country_code: null,
      },
    ],
  },
] as const;

describe("V3-11 GET /api/admin/my/{sections,services}", () => {
  beforeEach(() => {
    vi.resetModules();
    requireAdminApiUser.mockReset();
    tryCreateSupabaseServiceClient.mockReset();
  });

  it.each(CASES)("$name: non-admin gets the guard response and no DB read", async (c) => {
    requireAdminApiUser.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }),
    });
    const { GET } = await c.load();
    const res = await GET();
    expect(res.status).toBe(403);
    expect(tryCreateSupabaseServiceClient).not.toHaveBeenCalled();
  });

  it.each(CASES)("$name: admin gets { ok, rows } ordered by sort_order", async (c) => {
    requireAdminApiUser.mockResolvedValue({ ok: true, userId: "admin-1" });
    const { sb, calls } = fakeSb({ data: c.rows, error: null });
    tryCreateSupabaseServiceClient.mockReturnValue(sb);
    const { GET } = await c.load();
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, [c.key]: c.rows });
    expect(calls.table).toBe(c.table);
    expect(calls.order).toEqual(["sort_order", { ascending: true }]);
  });

  it.each(CASES)("$name: DB error → 500, service missing → 503", async (c) => {
    requireAdminApiUser.mockResolvedValue({ ok: true, userId: "admin-1" });
    tryCreateSupabaseServiceClient.mockReturnValue(fakeSb({ data: null, error: { message: "boom" } }).sb);
    let { GET } = await c.load();
    let res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "boom" });

    vi.resetModules();
    tryCreateSupabaseServiceClient.mockReturnValue(null);
    ({ GET } = await c.load());
    res = await GET();
    expect(res.status).toBe(503);
  });
});
