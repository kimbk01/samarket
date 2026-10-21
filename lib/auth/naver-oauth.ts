import type { SupabaseClient, User } from "@supabase/supabase-js";

/**
 * Naver 로그인은 Owner 결정(2026-10-21 P0-1)으로 비활성 — start/callback 라우트는 410 만 반환한다.
 * 이메일 기반 계정 재사용(비밀번호 재설정·식별 컬럼 덮어쓰기) 헬퍼는 제거했다.
 * 아래 `findAuthUserByEmail` 은 native synthetic email 복구 경로가 계속 사용한다.
 */
export const NAVER_LOGIN_DISABLED_ERROR_CODE = "naver_login_disabled";

/** OA-08 — 페이지 스캔 안전 상한 (perPage × pages = 100,000명). 기존 4,000명 상한 대체. */
const LIST_USERS_PER_PAGE = 1000;
const LIST_USERS_MAX_PAGES = 100;
const INDEXED_CANDIDATE_LIMIT = 5;

function normalizeEmail(email: string | null | undefined): string {
  return String(email ?? "").trim().toLowerCase();
}

async function collectIndexedCandidateIds(adminSb: SupabaseClient, normalized: string): Promise<string[]> {
  const ids = new Set<string>();
  const add = (rows: unknown, key: "id" | "user_id") => {
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
      const id = String((row as Record<string, unknown>)[key] ?? "").trim();
      if (id) ids.add(id);
    }
  };
  try {
    const { data } = await adminSb
      .from("profiles")
      .select("id")
      .eq("auth_login_email", normalized)
      .limit(INDEXED_CANDIDATE_LIMIT);
    add(data, "id");
  } catch {
    /* indexed lookup is best-effort — paged scan follows */
  }
  try {
    const { data } = await adminSb
      .from("user_auth_identities")
      .select("user_id")
      .eq("email", normalized)
      .limit(INDEXED_CANDIDATE_LIMIT);
    add(data, "user_id");
  } catch {
    /* indexed lookup is best-effort — paged scan follows */
  }
  return Array.from(ids);
}

/**
 * auth.users 를 email 로 찾는다 (정확 일치, 대소문자 무시).
 * 1) profiles.auth_login_email / user_auth_identities.email 인덱스 후보 → getUserById 로 email 재확인
 * 2) 없으면 listUsers 페이지 스캔 (상한 100,000명)
 */
export async function findAuthUserByEmail(
  adminSb: SupabaseClient,
  email: string
): Promise<User | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const candidateIds = await collectIndexedCandidateIds(adminSb, normalized);
  for (const id of candidateIds) {
    try {
      const { data } = await adminSb.auth.admin.getUserById(id);
      const user = data?.user ?? null;
      if (user && normalizeEmail(user.email) === normalized) return user;
    } catch {
      /* fall through to paged scan */
    }
  }

  for (let page = 1; page <= LIST_USERS_MAX_PAGES; page += 1) {
    const { data, error } = await adminSb.auth.admin.listUsers({ page, perPage: LIST_USERS_PER_PAGE });
    if (error) throw new Error(error.message || "list_users_failed");
    const users = Array.isArray(data?.users) ? data.users : [];
    const hit = users.find((user) => normalizeEmail(user.email) === normalized);
    if (hit) return hit;
    if (users.length < LIST_USERS_PER_PAGE) break;
  }
  return null;
}
