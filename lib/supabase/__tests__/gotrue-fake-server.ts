/**
 * GoTrue v2.197.0 인증 서버 모사 (테스트 전용).
 *
 * 갱신 규칙 = `internal/tokens/service.go` RefreshTokenGrant 의 v1 토큰 분기
 * (운영 프로젝트는 v2 카운터 세션 0건 — v1 경로만 사용):
 * - 활성 토큰 → `GrantRefreshTokenSwap`: 폐기(`UpdateOnly(token,"revoked")` → updated_at = now) + 자식 발급
 * - 폐기 토큰 & 현재 활성 토큰(세션의 마지막 생성 미폐기 토큰, `id desc`)의 parent → 활성 토큰 반환 (시간 제한 없음)
 * - 그 외 폐기 토큰: now > updated_at + reuse interval → `RevokeTokenFamily`(세션의 미폐기 토큰 전부 폐기, updated_at = now)
 *   + 400 refresh_token_already_used. 허용 시간 안이면 `GrantRefreshTokenSwap`(다시 폐기 → updated_at = now, 자식 발급)
 * - 세션 삭제(logout) 시 refresh_tokens 는 FK cascade 로 함께 삭제 → 400 refresh_token_not_found
 */

export const FAKE_AUTH_ORIGIN = "https://proj.supabase.co";
export const FAKE_AUTH_URL = `${FAKE_AUTH_ORIGIN}/auth/v1`;
export const FAKE_USER_ID = "00000000-0000-4000-8000-000000000001";
export const FAKE_EMAIL = "owner@example.com";
export const FAKE_PASSWORD = "correct-password";
/** 운영 `security_refresh_token_reuse_interval` = 10 (Management API, 2026-11-06 11:12 PHT) */
export const REUSE_INTERVAL_MS = 10_000;
/** 운영 `jwt_exp` = 3600 */
export const JWT_EXP_SECONDS = 3600;

export type TokenRow = {
  id: number;
  revoked: boolean;
  parent: string | null;
  updatedAt: number;
  sessionId: string;
};

/**
 * - immediate: 처리 후 즉시 응답
 * - delayMs: 처리(커밋) 후 응답 전달 지연
 * - hang: 처리(커밋) 후 응답 영구 미도착
 * - body_stall: 처리 후 헤더만 오고 본문 멈춤
 * - lost: 처리(커밋) 후 연결 끊김 (fetch reject)
 * - offline: 서버 도달 전 실패 (처리 안 됨)
 */
export type ResponsePlan = "immediate" | { delayMs: number } | "hang" | "body_stall" | "lost" | "offline";

export type GrantOutcome = "rotated" | "parent_recovered" | "reuse_swapped" | "already_used" | "not_found";

function abortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

function b64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function accessTokenFor(sessionId: string, refreshToken: string): string {
  const iat = Math.floor(Date.now() / 1000);
  return [
    b64url({ alg: "HS256", typ: "JWT" }),
    b64url({
      sub: FAKE_USER_ID,
      aud: "authenticated",
      role: "authenticated",
      session_id: sessionId,
      iat,
      exp: iat + JWT_EXP_SECONDS,
      ref: refreshToken,
    }),
    "sig",
  ].join(".");
}

function sessionIdOfAccessToken(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString()) as { session_id?: string };
    return payload.session_id ?? null;
  } catch {
    return null;
  }
}

const USER = {
  id: FAKE_USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: FAKE_EMAIL,
  app_metadata: { provider: "email" },
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};

export function createGoTrueServer() {
  const tokens = new Map<string, TokenRow>();
  const sessions = new Set<string>();
  let tokenSeq = 0;
  let sessionSeq = 0;
  /** refresh 요청마다 하나씩 소비 (없으면 immediate) */
  const plans: ResponsePlan[] = [];
  const state = {
    refreshCalls: 0,
    refreshProcessed: 0,
    rotations: 0,
    familyRevoked: false,
    passwordGrants: 0,
    logoutCalls: 0,
    outcomes: [] as GrantOutcome[],
  };

  function issue(parent: string | null, sessionId: string): string {
    tokenSeq += 1;
    const token = `rt-${tokenSeq}`;
    tokens.set(token, { id: tokenSeq, revoked: false, parent, updatedAt: Date.now(), sessionId });
    return token;
  }

  function createSession(): { sessionId: string; refreshToken: string } {
    sessionSeq += 1;
    const sessionId = `session-${sessionSeq}`;
    sessions.add(sessionId);
    return { sessionId, refreshToken: issue(null, sessionId) };
  }

  /** `FindCurrentlyActiveRefreshToken`: session_id = ? and revoked is false order by id desc */
  function activeOf(sessionId: string): string | null {
    let best: { token: string; id: number } | null = null;
    for (const [token, row] of tokens) {
      if (row.sessionId === sessionId && !row.revoked && (!best || row.id > best.id)) best = { token, id: row.id };
    }
    return best?.token ?? null;
  }

  function deleteSession(sessionId: string) {
    sessions.delete(sessionId);
    for (const [token, row] of tokens) if (row.sessionId === sessionId) tokens.delete(token);
  }

  function sessionBody(refreshToken: string, sessionId: string) {
    return {
      access_token: accessTokenFor(sessionId, refreshToken),
      refresh_token: refreshToken,
      token_type: "bearer",
      expires_in: JWT_EXP_SECONDS,
      expires_at: Math.floor(Date.now() / 1000) + JWT_EXP_SECONDS,
      user: USER,
    };
  }

  function grant(refreshToken: string): { status: number; body: Record<string, unknown>; outcome: GrantOutcome } {
    const row = tokens.get(refreshToken);
    if (!row || !sessions.has(row.sessionId)) {
      return {
        status: 400,
        outcome: "not_found",
        body: { code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token: Refresh Token Not Found" },
      };
    }
    const now = Date.now();
    let issued: string;
    let outcome: GrantOutcome;
    if (row.revoked) {
      const active = activeOf(row.sessionId);
      if (active && tokens.get(active)!.parent === refreshToken) {
        issued = active;
        outcome = "parent_recovered";
      } else if (now > row.updatedAt + REUSE_INTERVAL_MS) {
        for (const r of tokens.values()) {
          if (r.sessionId === row.sessionId && !r.revoked) {
            r.revoked = true;
            r.updatedAt = now;
          }
        }
        state.familyRevoked = true;
        return {
          status: 400,
          outcome: "already_used",
          body: { code: 400, error_code: "refresh_token_already_used", msg: "Invalid Refresh Token: Already Used" },
        };
      } else {
        row.updatedAt = now;
        issued = issue(refreshToken, row.sessionId);
        outcome = "reuse_swapped";
      }
    } else {
      row.revoked = true;
      row.updatedAt = now;
      issued = issue(refreshToken, row.sessionId);
      state.rotations += 1;
      outcome = "rotated";
    }
    return { status: 200, outcome, body: sessionBody(issued, row.sessionId) };
  }

  /** 다른 주체(다른 탭·서버 proxy)가 같은 서버에 직접 갱신 — 응답은 그 주체가 받는다 */
  function refreshAsOtherActor(refreshToken: string) {
    state.refreshCalls += 1;
    state.refreshProcessed += 1;
    const result = grant(refreshToken);
    state.outcomes.push(result.outcome);
    return result;
  }

  function respond(json: string, status: number, plan: ResponsePlan, signal?: AbortSignal): Promise<Response> | Response {
    if (plan === "immediate") return new Response(json, { status });
    if (plan === "lost") return Promise.reject(new TypeError("Failed to fetch"));
    if (plan === "body_stall") {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          signal?.addEventListener("abort", () => controller.error(abortError()), { once: true });
        },
      });
      return new Response(body, { status });
    }
    return new Promise<Response>((resolve, reject) => {
      const timer =
        plan === "hang" || plan === "offline"
          ? null
          : setTimeout(() => resolve(new Response(json, { status })), plan.delayMs);
      signal?.addEventListener(
        "abort",
        () => {
          if (timer) clearTimeout(timer);
          reject(abortError());
        },
        { once: true },
      );
    });
  }

  function bodyOf(init?: RequestInit): Record<string, unknown> {
    try {
      return JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  function headerOf(input: RequestInfo | URL, init: RequestInit | undefined, name: string): string | null {
    const fromInit = init?.headers ? new Headers(init.headers).get(name) : null;
    if (fromInit) return fromInit;
    return input instanceof Request ? input.headers.get(name) : null;
  }

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined) ?? undefined;
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

    if (url.includes("/token?grant_type=password")) {
      state.passwordGrants += 1;
      const body = bodyOf(init);
      if (body.email !== FAKE_EMAIL || body.password !== FAKE_PASSWORD) {
        return json({ code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" }, 400);
      }
      const { sessionId, refreshToken } = createSession();
      return json(sessionBody(refreshToken, sessionId));
    }

    if (url.includes("/token?grant_type=refresh_token")) {
      state.refreshCalls += 1;
      const plan = plans.shift() ?? "immediate";
      if (plan === "offline") return Promise.reject(new TypeError("Failed to fetch"));
      // 서버는 요청을 받는 즉시 처리(커밋)한다 — 응답 전달만 지연·유실될 수 있다.
      state.refreshProcessed += 1;
      const result = grant(String(bodyOf(init).refresh_token ?? ""));
      state.outcomes.push(result.outcome);
      return respond(JSON.stringify(result.body), result.status, plan, signal);
    }

    if (url.includes("/logout")) {
      state.logoutCalls += 1;
      const auth = headerOf(input, init, "authorization") ?? "";
      const sessionId = sessionIdOfAccessToken(auth.replace(/^Bearer\s+/i, ""));
      const scope = new URL(url).searchParams.get("scope") ?? "global";
      if (sessionId && sessions.has(sessionId)) {
        if (scope === "global") for (const s of [...sessions]) deleteSession(s);
        else if (scope === "local") deleteSession(sessionId);
      }
      return new Response(null, { status: 204 });
    }

    if (url.includes("/auth/v1/user")) {
      const auth = headerOf(input, init, "authorization") ?? "";
      const sessionId = sessionIdOfAccessToken(auth.replace(/^Bearer\s+/i, ""));
      if (!sessionId || !sessions.has(sessionId)) {
        return json({ code: 403, error_code: "session_not_found", msg: "Session from session_id claim in JWT does not exist" }, 403);
      }
      return json(USER);
    }

    return json({ ok: true });
  };

  return {
    tokens,
    sessions,
    plans,
    state,
    issue,
    createSession,
    activeOf,
    refreshAsOtherActor,
    fetchImpl,
  };
}

export type GoTrueServer = ReturnType<typeof createGoTrueServer>;

export function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

/** 저장소에 만료된 세션을 심는다 (앱이 장시간 미사용 후 재진입한 상태) */
export function seedExpiredSession(
  storage: { setItem: (k: string, v: string) => void },
  storageKey: string,
  refreshToken: string,
) {
  storage.setItem(
    storageKey,
    JSON.stringify({
      access_token: "at-expired",
      refresh_token: refreshToken,
      token_type: "bearer",
      expires_in: JWT_EXP_SECONDS,
      expires_at: Math.floor(Date.now() / 1000) - 60,
      user: USER,
    }),
  );
}
