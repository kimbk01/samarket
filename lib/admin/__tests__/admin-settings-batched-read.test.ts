import { describe, expect, it, vi } from "vitest";
import { readAdminSettingsBatched } from "@/lib/admin/admin-settings-batched-read";

/** 2026-11-19 — home-feed admin_settings 2.7회/요청 → 같은 순간 읽기 1회로 */
function fakeSb(rows: Array<{ key: string; value_json: unknown }>, error: { message: string } | null = null) {
  const inFn = vi.fn(async (_col: string, keys: string[]) => ({
    data: error ? null : rows.filter((r) => keys.includes(r.key)),
    error,
  }));
  const from = vi.fn(() => ({ select: () => ({ in: inFn }) }));
  return { sb: { from } as never, from, inFn };
}

describe("admin_settings 읽기 묶음", () => {
  it("같은 순간 세 군데 읽기 → 조회 1번, 각자 자기 키만 받는다", async () => {
    const { sb, from, inFn } = fakeSb([
      { key: "a", value_json: { value: 1 } },
      { key: "b", value_json: { value: 2 } },
      { key: "c", value_json: { value: 3 } },
    ]);
    const [ra, rbc, rc] = await Promise.all([
      readAdminSettingsBatched(sb, ["a"]),
      readAdminSettingsBatched(sb, ["b", "c"]),
      readAdminSettingsBatched(sb, ["c"]),
    ]);
    expect(from).toHaveBeenCalledTimes(1);
    expect(new Set(inFn.mock.calls[0][1])).toEqual(new Set(["a", "b", "c"]));
    expect(ra.rows.map((r) => r.key)).toEqual(["a"]);
    expect(rbc.rows.map((r) => r.key).sort()).toEqual(["b", "c"]);
    expect(rc.rows.map((r) => r.key)).toEqual(["c"]);
  });

  it("다른 순간이면 따로 조회(캐시하지 않음 — 관리자 저장 반영 시점 그대로)", async () => {
    const { sb, from } = fakeSb([{ key: "a", value_json: 1 }]);
    await readAdminSettingsBatched(sb, ["a"]);
    await readAdminSettingsBatched(sb, ["a"]);
    expect(from).toHaveBeenCalledTimes(2);
  });

  it("오류는 그대로 모든 호출자에게 — 기존 오류 처리 유지", async () => {
    const { sb } = fakeSb([], { message: 'relation "admin_settings" does not exist' });
    const [x, y] = await Promise.all([readAdminSettingsBatched(sb, ["a"]), readAdminSettingsBatched(sb, ["b"])]);
    expect(x.error?.message).toContain("does not exist");
    expect(y.error?.message).toContain("does not exist");
    expect(x.rows).toEqual([]);
  });
});
