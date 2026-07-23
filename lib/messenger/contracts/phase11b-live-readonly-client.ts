/**
 * Phase 11B — Live Supabase read-only client wrapper.
 * mutation 메서드 호출 시 throw. 통합 bootstrap / home-sync 금지.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { assertPhase11bLiveConstraints } from "@/lib/messenger/contracts/phase11b-isolated-qa-gate";

export type Phase11bReadOnlySupabase = Readonly<{
  from: SupabaseClient["from"];
  rpc: never;
  kind: "phase11b_readonly_service";
}>;

const MUTATION_BLOCKED = new Set([
  "insert",
  "update",
  "upsert",
  "delete",
]);

/**
 * service role SELECT only. Viewer 권한은 Domain Loader 가 재검증.
 */
export function createPhase11bReadOnlySupabase(
  client?: SupabaseClient | null
): Phase11bReadOnlySupabase {
  assertPhase11bLiveConstraints();
  const sb = client ?? tryCreateSupabaseServiceClient();
  if (!sb) {
    throw new Error("dibay_phase11b_supabase_client_unavailable");
  }

  const from = ((table: string) => {
    const builder = sb.from(table) as unknown as Record<string, unknown>;
    return new Proxy(builder, {
      get(target, prop, receiver) {
        const key = String(prop);
        if (MUTATION_BLOCKED.has(key)) {
          return () => {
            throw new Error(`dibay_phase11b_write_forbidden:${key}:${table}`);
          };
        }
        if (key === "rpc") {
          return () => {
            throw new Error("dibay_phase11b_rpc_forbidden_use_select_only");
          };
        }
        const value = Reflect.get(target, prop, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }) as unknown as SupabaseClient["from"];

  return {
    from,
    rpc: undefined as never,
    kind: "phase11b_readonly_service",
  };
}

export type Phase11bQueryTiming = Readonly<{
  label: string;
  durationMs: number;
  rowCount: number | null;
}>;

export async function timedSelect<T>(
  label: string,
  run: () => PromiseLike<{ data: T; error: { message: string } | null; count?: number | null }>
): Promise<{ data: T; timing: Phase11bQueryTiming }> {
  const t0 = Date.now();
  const { data, error, count } = await run();
  if (error) throw new Error(`dibay_phase11b_query_failed:${label}:${error.message}`);
  const rowCount = Array.isArray(data) ? data.length : count ?? (data == null ? 0 : 1);
  return {
    data,
    timing: { label, durationMs: Date.now() - t0, rowCount },
  };
}
