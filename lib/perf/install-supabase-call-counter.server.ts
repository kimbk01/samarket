/**
 * `instrumentation.ts` 에서만 부른다 — 운영 Node 런타임에 Supabase 호출 계수기를 설치한다.
 * 라우트·요청 구분은 Next 요청 저장소에서 읽는다(Next 자신이 fetch 추적에 쓰는 저장소 · 읽기만 하며 동적 렌더 판정에 영향 없음).
 * 저장소를 읽지 못하면 route=null(`unknown`)로 센다 — 요청은 그대로 진행된다.
 */
import { installSupabaseCallCounter, type SupabaseCallContext } from "@/lib/perf/supabase-call-counter";

type WorkStoreLike = { route?: unknown };
type WorkUnitStoreLike = { type?: unknown; headers?: { get(name: string): string | null } };
type AsyncStorageLike<T> = { getStore(): T | undefined };

export function shouldInstallSupabaseCallCounter(env: NodeJS.ProcessEnv): boolean {
  if (env.NEXT_RUNTIME !== "nodejs") return false;
  if (env.SUPABASE_CALL_COUNTER === "0") return false;
  return env.VERCEL_ENV === "production" || env.SUPABASE_CALL_COUNTER === "1";
}

export async function installSupabaseCallCounterFromEnv(): Promise<boolean> {
  if (!shouldInstallSupabaseCallCounter(process.env)) return false;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceKey) return false;

  let workStorage: AsyncStorageLike<WorkStoreLike> | null = null;
  let workUnitStorage: AsyncStorageLike<WorkUnitStoreLike> | null = null;
  try {
    const w = await import("next/dist/server/app-render/work-async-storage.external");
    workStorage = (w as unknown as { workAsyncStorage: AsyncStorageLike<WorkStoreLike> }).workAsyncStorage ?? null;
  } catch {
    workStorage = null;
  }
  try {
    const u = await import("next/dist/server/app-render/work-unit-async-storage.external");
    workUnitStorage =
      (u as unknown as { workUnitAsyncStorage: AsyncStorageLike<WorkUnitStoreLike> }).workUnitAsyncStorage ?? null;
  } catch {
    workUnitStorage = null;
  }

  const readContext = (): SupabaseCallContext => {
    let route: string | null = null;
    let requestKey: object | null = null;
    let userAgent: string | null = null;
    try {
      const ws = workStorage?.getStore();
      if (ws) {
        requestKey = ws;
        route = typeof ws.route === "string" ? ws.route : null;
      }
    } catch {
      /* 저장소 없음 */
    }
    try {
      const us = workUnitStorage?.getStore();
      if (us && us.type === "request" && us.headers) userAgent = us.headers.get("user-agent");
    } catch {
      /* 저장소 없음 */
    }
    return { route, requestKey, userAgent };
  };

  return installSupabaseCallCounter({ supabaseUrl, serviceKey, readContext }) !== null;
}
