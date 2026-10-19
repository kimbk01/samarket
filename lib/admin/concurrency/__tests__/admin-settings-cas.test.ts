import { describe, expect, it } from "vitest";
import {
  ADMIN_SETTING_ROW_WITHOUT_TIMESTAMP,
  adminSettingVersionsFromRows,
  casWriteAdminSetting,
  checkExpectedAdminSettingVersions,
} from "@/lib/admin/concurrency/admin-settings-cas";
import { createFakeSupabase, filterValue } from "./fake-supabase-query";

const T1 = "2026-10-19T01:00:00.000+00:00";
const T2 = "2026-10-19T02:00:00.000+00:00";

describe("admin_settings versions", () => {
  it("absent row → null, null updated_at → present token", () => {
    const v = adminSettingVersionsFromRows(["a", "b", "c"], [
      { key: "a", updated_at: T1 },
      { key: "b", updated_at: null },
    ]);
    expect(v).toEqual({ a: T1, b: ADMIN_SETTING_ROW_WITHOUT_TIMESTAMP, c: null });
  });

  it("400 when expected map or written field entry is missing", () => {
    expect(checkExpectedAdminSettingVersions(undefined, ["f"], { f: T1 })).toEqual({
      ok: false,
      status: 400,
      error: "expected_updated_at_required",
    });
    expect(checkExpectedAdminSettingVersions({ other: T1 }, ["f"], { f: T1 })).toMatchObject({ status: 400 });
  });

  it("409 stale_updated_at when the row changed, was created or removed", () => {
    expect(checkExpectedAdminSettingVersions({ f: T1 }, ["f"], { f: T2 })).toEqual({
      ok: false,
      status: 409,
      error: "stale_updated_at",
    });
    expect(checkExpectedAdminSettingVersions({ f: null }, ["f"], { f: T1 })).toMatchObject({ status: 409 });
    expect(checkExpectedAdminSettingVersions({ f: T1 }, ["f"], { f: null })).toMatchObject({ status: 409 });
  });

  it("passes when versions match (only written fields are checked)", () => {
    expect(checkExpectedAdminSettingVersions({ f: T1, g: "x" }, ["f"], { f: T1, g: T2 })).toEqual({ ok: true });
    expect(checkExpectedAdminSettingVersions({ f: null }, ["f"], { f: null })).toEqual({ ok: true });
  });
});

describe("casWriteAdminSetting", () => {
  it("existing row → conditional UPDATE on previous updated_at; 0 rows → 409", async () => {
    const { sb, calls } = createFakeSupabase(() => ({ data: null, error: null }));
    const r = await casWriteAdminSetting(sb as never, {
      key: "k",
      prev: T1,
      op: { kind: "upsert", valueJson: { value: 1 } },
      nowIso: T2,
    });
    expect(r).toEqual({ ok: false, status: 409, error: "stale_updated_at" });
    expect(calls[0]!.op).toBe("update");
    expect(calls[0]!.values).toEqual({ value_json: { value: 1 }, updated_at: T2 });
    expect(filterValue(calls[0]!, "eq", "updated_at")).toBe(T1);
  });

  it("existing row → UPDATE succeeds and writes updated_at explicitly", async () => {
    const { sb } = createFakeSupabase(() => ({ data: { key: "k" }, error: null }));
    const r = await casWriteAdminSetting(sb as never, {
      key: "k",
      prev: T1,
      op: { kind: "upsert", valueJson: { value: 1 } },
      nowIso: T2,
    });
    expect(r).toEqual({ ok: true, updatedAt: T2 });
  });

  it("absent row → INSERT; concurrent insert (23505) → 409", async () => {
    const { sb, calls } = createFakeSupabase(() => ({
      data: null,
      error: { code: "23505", message: "duplicate key value violates unique constraint" },
    }));
    const r = await casWriteAdminSetting(sb as never, {
      key: "k",
      prev: null,
      op: { kind: "upsert", valueJson: { value: 2 } },
    });
    expect(calls[0]!.op).toBe("insert");
    expect(r).toEqual({ ok: false, status: 409, error: "stale_updated_at" });
  });

  it("delete of a changed row → 409; delete of an absent row → no write", async () => {
    const { sb, calls } = createFakeSupabase(() => ({ data: null, error: null }));
    expect(await casWriteAdminSetting(sb as never, { key: "k", prev: T1, op: { kind: "delete" } })).toEqual({
      ok: false,
      status: 409,
      error: "stale_updated_at",
    });
    expect(calls[0]!.op).toBe("delete");
    expect(await casWriteAdminSetting(sb as never, { key: "k", prev: null, op: { kind: "delete" } })).toEqual({
      ok: true,
      updatedAt: null,
    });
    expect(calls).toHaveLength(1);
  });

  it("legacy row with NULL updated_at uses IS NULL condition", async () => {
    const { sb, calls } = createFakeSupabase(() => ({ data: { key: "k" }, error: null }));
    await casWriteAdminSetting(sb as never, {
      key: "k",
      prev: ADMIN_SETTING_ROW_WITHOUT_TIMESTAMP,
      op: { kind: "upsert", valueJson: {} },
    });
    expect(filterValue(calls[0]!, "is", "updated_at")).toBeNull();
  });
});
