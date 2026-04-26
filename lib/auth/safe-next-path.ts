/**
 * 로그인 흐름의 `next` 경로 안전 검증.
 *
 * `next` 는 사용자가 로그인 후 돌아갈 *내부* 경로다.
 * 외부 URL·인증 자체 라우트(`/login`, `/auth/callback`, `/auth/consent`)·프로토콜 상대 URL(`//foo`)
 * 은 모두 거부해 다음 두 사고를 차단한다.
 *
 * 1) Open redirect: `next=https://attacker.example` → 외부로 송출
 * 2) 인증 루프: `next=/login` 또는 `next=/auth/callback` → 무한 루프
 *
 * 정상 입력: `/`, `/home`, `/trade/123`, `/community/55?tab=hot` 등 동일 출처 경로.
 */

const NEXT_PATH_MAX_LENGTH = 1024;

const FORBIDDEN_PREFIXES = [
  "/login",
  "/signup",
  "/auth/callback",
  "/auth/consent",
  "/api/",
] as const;

function isForbiddenPath(pathname: string): boolean {
  for (const prefix of FORBIDDEN_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`) || pathname.startsWith(`${prefix}?`)) {
      return true;
    }
  }
  return false;
}

/**
 * 입력을 검증해 안전한 내부 경로(시작 `/`)만 그대로 돌려준다. 그 외에는 `null`.
 */
export function sanitizeNextPath(input: string | null | undefined): string | null {
  if (typeof input !== "string") return null;
  let raw = input.trim();
  if (!raw) return null;
  if (raw.length > NEXT_PATH_MAX_LENGTH) return null;
  // 흔히 한 번 더 인코딩되어 들어오는 경우 대비.
  try {
    if (raw.startsWith("%2F") || raw.startsWith("%2f")) {
      raw = decodeURIComponent(raw);
    }
  } catch {
    return null;
  }
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//")) return null;
  if (raw.startsWith("/\\")) return null;
  // 절대 URL · 백슬래시 트릭 차단.
  if (raw.includes("\\")) return null;
  // 동일 출처 경로 내에 호스트가 섞여 들어오는 경우.
  if (/^\/+https?:/i.test(raw)) return null;

  let pathname = raw;
  let search = "";
  const qIdx = raw.indexOf("?");
  if (qIdx >= 0) {
    pathname = raw.slice(0, qIdx);
    search = raw.slice(qIdx);
  }
  if (isForbiddenPath(pathname)) return null;
  // 콜백·로그인을 우회해 다른 라우트로 들어가도록 만든 search 도 차단.
  if (/auth_error=/i.test(search)) return null;
  return raw;
}

/**
 * URL(상대 또는 절대)에 `?next=<sanitized>` 를 안전하게 부착해 돌려준다.
 * `next` 가 무효면 base 그대로 반환.
 */
export function withNextSearchParam(base: string, next: string | null | undefined): string {
  const safe = sanitizeNextPath(next);
  if (!safe) return base;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}next=${encodeURIComponent(safe)}`;
}

/**
 * 로그인 페이지 자체로 보낼 때 사용하는 헬퍼. (`/login` 또는 `/login?next=...`)
 */
export function buildLoginPath(next?: string | null): string {
  return withNextSearchParam("/login", next);
}
