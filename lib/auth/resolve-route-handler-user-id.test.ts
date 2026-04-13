import { describe, expect, it, vi } from "vitest";
import { resolveRouteHandlerUserIdFromSupabase } from "@/lib/auth/resolve-route-handler-user-id";

describe("resolveRouteHandlerUserIdFromSupabase", () => {
  it("uses getClaims sub when present (no getUser call)", async () => {
    const getClaims = vi.fn().mockResolvedValue({
      data: { claims: { sub: "11111111-1111-1111-1111-111111111111" } },
      error: null,
    });
    const getUser = vi.fn();
    const sb = { auth: { getClaims, getUser } } as never;
    const id = await resolveRouteHandlerUserIdFromSupabase(sb);
    expect(id).toBe("11111111-1111-1111-1111-111111111111");
    expect(getUser).not.toHaveBeenCalled();
  });

  it("falls back to getUser when getClaims yields no sub", async () => {
    const getClaims = vi.fn().mockResolvedValue({ data: { claims: null }, error: { message: "x" } });
    const getUser = vi.fn().mockResolvedValue({
      data: { user: { id: "22222222-2222-2222-2222-222222222222" } },
      error: null,
    });
    const sb = { auth: { getClaims, getUser } } as never;
    const id = await resolveRouteHandlerUserIdFromSupabase(sb);
    expect(id).toBe("22222222-2222-2222-2222-222222222222");
    expect(getUser).toHaveBeenCalledTimes(1);
  });
});
