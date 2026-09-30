/**
 * Admin staff permissions — Live jsonb canonical contract (OWNER DECISION A).
 */
import { describe, expect, it, vi } from "vitest";
import {
  defaultPermissionsForUiRole,
  isAdminStaffPermissionsSchemaError,
  isMissingAdminStaffPermissionsTable,
  loadEffectiveStaffPermissions,
  loadStaffPermissionKeys,
  loadStaffPermissionsMap,
  normalizeAdminPermissionKeys,
  parseAdminPermissionsPayload,
  replaceStaffPermissions,
} from "@/lib/admin/admin-user-server";
import type { AdminPermissionKey } from "@/lib/types/admin-staff";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type StoreRow = {
  user_id: string;
  permissions: AdminPermissionKey[];
  updated_at?: string;
  updated_by?: string;
};

function createJsonbSb(opts?: {
  rows?: StoreRow[];
  readError?: { message: string } | null;
  writeError?: { message: string } | null;
}) {
  const rows = new Map<string, StoreRow>();
  for (const row of opts?.rows ?? []) {
    rows.set(row.user_id, { ...row, permissions: [...row.permissions] });
  }
  const writes: unknown[] = [];

  const sb = {
    from(table: string) {
      if (table !== "admin_staff_permissions") {
        throw new Error(`unexpected table ${table}`);
      }
      return {
        select(cols: string) {
          const chain = {
            eq(col: string, val: string) {
              return {
                async maybeSingle() {
                  if (opts?.readError) {
                    return { data: null, error: opts.readError };
                  }
                  if (col !== "user_id") return { data: null, error: null };
                  const row = rows.get(val);
                  if (!row) return { data: null, error: null };
                  if (cols.includes("permissions")) {
                    return {
                      data: { user_id: row.user_id, permissions: row.permissions },
                      error: null,
                    };
                  }
                  return { data: row, error: null };
                },
              };
            },
            async in(col: string, vals: string[]) {
              if (opts?.readError) {
                return { data: null, error: opts.readError };
              }
              if (col !== "user_id") return { data: [], error: null };
              const data = vals
                .map((id) => rows.get(id))
                .filter(Boolean)
                .map((row) => ({
                  user_id: row!.user_id,
                  permissions: row!.permissions,
                }));
              return { data, error: null };
            },
          };
          return chain;
        },
        upsert(payload: StoreRow, _opts?: { onConflict?: string }) {
          writes.push(payload);
          if (opts?.writeError) {
            return Promise.resolve({ error: opts.writeError });
          }
          rows.set(payload.user_id, {
            user_id: payload.user_id,
            permissions: [...(payload.permissions as AdminPermissionKey[])],
            updated_at: payload.updated_at,
            updated_by: payload.updated_by,
          });
          return Promise.resolve({ error: null });
        },
        delete() {
          return {
            eq(col: string, val: string) {
              if (col === "user_id") rows.delete(val);
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
    _rows: rows,
    _writes: writes,
  };
  return sb as unknown as {
    from: typeof sb.from;
    _rows: Map<string, StoreRow>;
    _writes: unknown[];
  } & Parameters<typeof loadStaffPermissionKeys>[0];
}

describe("admin staff permissions jsonb canonical", () => {
  it("normalizes empty / one / multiple / duplicates", () => {
    expect(normalizeAdminPermissionKeys([])).toEqual([]);
    expect(normalizeAdminPermissionKeys(["users"])).toEqual(["users"]);
    expect(normalizeAdminPermissionKeys(["users", "boards", "users"])).toEqual([
      "users",
      "boards",
    ]);
  });

  it("rejects invalid permission and malformed types", () => {
    expect(() => normalizeAdminPermissionKeys("users" as unknown)).toThrow(
      /permissions_must_be_array/
    );
    expect(() => normalizeAdminPermissionKeys([1] as unknown)).toThrow(
      /permissions_invalid_item/
    );
    expect(() => normalizeAdminPermissionKeys(["not_a_real_perm"])).toThrow(
      /permissions_unknown_key/
    );
    expect(() => parseAdminPermissionsPayload("{")).toThrow(/permissions_malformed_json/);
    expect(() => parseAdminPermissionsPayload({ users: true })).toThrow(
      /permissions_must_be_array/
    );
  });

  it("READ empty [] and missing row", async () => {
    const emptySb = createJsonbSb({
      rows: [{ user_id: "u1", permissions: [] }],
    });
    expect(await loadStaffPermissionKeys(emptySb, "u1")).toEqual([]);
    expect(await loadStaffPermissionKeys(emptySb, "missing")).toEqual([]);
  });

  it("READ one and multiple permissions", async () => {
    const sb = createJsonbSb({
      rows: [
        { user_id: "u1", permissions: ["users"] },
        { user_id: "u2", permissions: ["users", "boards", "ads"] },
      ],
    });
    expect(await loadStaffPermissionKeys(sb, "u1")).toEqual(["users"]);
    expect(await loadStaffPermissionKeys(sb, "u2")).toEqual([
      "users",
      "boards",
      "ads",
    ]);
    const map = await loadStaffPermissionsMap(sb, ["u1", "u2", "u3"]);
    expect(map.get("u1")).toEqual(["users"]);
    expect(map.get("u2")).toEqual(["users", "boards", "ads"]);
    expect(map.has("u3")).toBe(false);
  });

  it("WRITE upsert / update / removal", async () => {
    const sb = createJsonbSb();
    await replaceStaffPermissions(sb, "u1", ["users", "boards"], "actor");
    expect(sb._rows.get("u1")?.permissions).toEqual(["users", "boards"]);
    expect(sb._rows.get("u1")?.updated_by).toBe("actor");

    await replaceStaffPermissions(sb, "u1", ["ads"], "actor2");
    expect(sb._rows.get("u1")?.permissions).toEqual(["ads"]);
    expect(sb._rows.get("u1")?.updated_by).toBe("actor2");

    await replaceStaffPermissions(sb, "u1", [], "actor3");
    expect(sb._rows.get("u1")?.permissions).toEqual([]);
  });

  it("WRITE duplicate input normalization", async () => {
    const sb = createJsonbSb();
    await replaceStaffPermissions(sb, "u1", ["users", "users", "boards"], "a");
    expect(sb._rows.get("u1")?.permissions).toEqual(["users", "boards"]);
  });

  it("WRITE rejects invalid permission", async () => {
    const sb = createJsonbSb();
    await expect(
      replaceStaffPermissions(sb, "u1", ["nope" as AdminPermissionKey], "a")
    ).rejects.toThrow(/permissions_unknown_key/);
  });

  it("tier-default semantics for VALID EMPTY ARRAY", async () => {
    const sb = createJsonbSb({
      rows: [{ user_id: "u1", permissions: [] }],
    });
    const effective = await loadEffectiveStaffPermissions(sb, "u1", "admin", "operator");
    expect(effective).toEqual(defaultPermissionsForUiRole("operator"));
  });

  it("DB/schema error ≠ valid empty permissions", async () => {
    const colMsg =
      'column admin_staff_permissions.permission_key does not exist';
    expect(isMissingAdminStaffPermissionsTable(colMsg)).toBe(false);
    expect(isAdminStaffPermissionsSchemaError(colMsg)).toBe(true);

    const code42703 =
      "column permission_key does not exist (42703) on admin_staff_permissions";
    expect(isMissingAdminStaffPermissionsTable(code42703)).toBe(false);
    expect(isAdminStaffPermissionsSchemaError(code42703)).toBe(true);

    const missingTable =
      'relation "public.admin_staff_permissions" does not exist';
    expect(isMissingAdminStaffPermissionsTable(missingTable)).toBe(true);
    expect(isAdminStaffPermissionsSchemaError(missingTable)).toBe(false);

    const sb = createJsonbSb({
      readError: { message: colMsg },
    });
    await expect(loadStaffPermissionKeys(sb, "u1")).rejects.toThrow(/permission_key/);
    await expect(
      loadEffectiveStaffPermissions(sb, "u1", "admin", "operator")
    ).rejects.toThrow(/permission_key/);
  });

  it("product runtime has zero permission_key query/write references", () => {
    const root = process.cwd();
    const files = [
      "lib/admin/admin-user-server.ts",
      "lib/admin/require-admin-permission.ts",
      "lib/admin/admin-membership.ts",
      "app/api/admin/me/route.ts",
      "app/api/admin/staff/route.ts",
      "app/api/admin/staff/[id]/route.ts",
    ];
    const queryWrite = /\.select\([^)]*permission_key|permission_key\s*:|\{[^}]*permission_key/;
    for (const rel of files) {
      const src = readFileSync(join(root, rel), "utf8");
      // Schema-error classifiers may mention permission_key in messages; forbid query/write usage.
      const withoutClassifier = src
        .split("\n")
        .filter(
          (line) =>
            !line.includes("isMissingAdminStaffPermissionsTable") &&
            !line.includes("isAdminStaffPermissionsSchemaError") &&
            !line.includes("m.includes(\"permission_key\")") &&
            !line.includes("m.includes('permission_key')")
        )
        .join("\n");
      expect(withoutClassifier, rel).not.toMatch(queryWrite);
      expect(src, rel).not.toMatch(/\.select\(\s*["']permission_key["']/);
      expect(src, rel).not.toMatch(/permission_key\s*,\s*granted_by/);
    }
  });
});

describe("admin staff permissions — membership delete path", () => {
  it("membership revoke still deletes permissions row for user", async () => {
    const helper = readFileSync(
      join(process.cwd(), "lib/admin/admin-membership.ts"),
      "utf8"
    );
    expect(helper).toMatch(
      /from\("admin_staff_permissions"\)\.delete\(\)\.eq\("user_id", userId\)/
    );
  });
});

describe("require-admin-permission schema-error surface", () => {
  it("does not catch loadEffectiveStaffPermissions into empty array", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/admin/require-admin-permission.ts"),
      "utf8"
    );
    expect(src).not.toMatch(
      /loadEffectiveStaffPermissions\([\s\S]*?\)\.catch\(\s*\(\)\s*=>\s*\[\s*\]/
    );
    expect(src).toMatch(/admin_permissions_schema_error/);
  });
});
