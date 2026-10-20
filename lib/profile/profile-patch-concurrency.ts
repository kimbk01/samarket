/**
 * PATCH /api/me/profile — 필드 단위 낙관적 동시성 (compare-and-set).
 *
 * 클라이언트는 편집 화면을 열 때 읽은 원본 값을 `expected` 로 함께 보낸다.
 * 서버는 UPDATE 에 `col = expected` 조건을 붙여, 그 사이 다른 기기·탭·화면이 먼저 바꾼 값을
 * 오래된 화면 값으로 덮어쓰지 않는다(0행 → 409 `profile_conflict`).
 */

export const PROFILE_PATCH_EXPECTABLE_KEYS = ["nickname", "bio", "avatar_url"] as const;
export type ProfilePatchExpectableKey = (typeof PROFILE_PATCH_EXPECTABLE_KEYS)[number];
export type ProfilePatchExpected = Partial<Record<ProfilePatchExpectableKey, string | null>>;

export const PROFILE_CONFLICT_ERROR_CODE = "profile_conflict" as const;
export const PROFILE_CONFLICT_MESSAGE_KO =
  "다른 곳에서 프로필이 먼저 변경되었습니다. 최신 내용을 다시 불러왔으니 확인 후 저장해 주세요.";

/** body.expected 파싱 — 허용 키만, 문자열/null 만 */
export function parseProfilePatchExpected(body: unknown): ProfilePatchExpected {
  if (body == null || typeof body !== "object") return {};
  const raw = (body as Record<string, unknown>).expected;
  if (raw == null || typeof raw !== "object") return {};
  const src = raw as Record<string, unknown>;
  const out: ProfilePatchExpected = {};
  for (const key of PROFILE_PATCH_EXPECTABLE_KEYS) {
    if (!(key in src)) continue;
    const v = src[key];
    if (v === null) out[key] = null;
    else if (typeof v === "string") out[key] = v;
  }
  return out;
}

/** 실제로 바뀌는 컬럼에 대한 기대값만 조건으로 사용 */
export function expectedConditionsForPatch(
  patch: Record<string, unknown>,
  expected: ProfilePatchExpected
): Array<{ column: ProfilePatchExpectableKey; value: string | null }> {
  const out: Array<{ column: ProfilePatchExpectableKey; value: string | null }> = [];
  for (const key of PROFILE_PATCH_EXPECTABLE_KEYS) {
    if (!(key in patch) || !(key in expected)) continue;
    out.push({ column: key, value: expected[key] ?? null });
  }
  return out;
}

type FilterableQuery<Q> = {
  eq(column: string, value: string): Q;
  is(column: string, value: null): Q;
};

export function applyExpectedConditions<Q extends FilterableQuery<Q>>(
  query: Q,
  conditions: Array<{ column: string; value: string | null }>
): Q {
  let q = query;
  for (const c of conditions) {
    q = c.value === null ? q.is(c.column, null) : q.eq(c.column, c.value);
  }
  return q;
}

/** 편집 화면 — 원본 대비 바뀐 필드만 payload 로 (오래된 값 재전송 금지) */
export function diffProfileEdit(
  baseline: { nickname: string | null; bio: string | null },
  draft: { nickname: string; bio: string }
): {
  payload: { nickname?: string; bio?: string | null };
  expected: ProfilePatchExpected;
} {
  const payload: { nickname?: string; bio?: string | null } = {};
  const expected: ProfilePatchExpected = {};
  const nextNick = draft.nickname.trim();
  if (nextNick && nextNick !== (baseline.nickname ?? "").trim()) {
    payload.nickname = nextNick;
    expected.nickname = baseline.nickname;
  }
  const nextBio = draft.bio.trim() || null;
  const prevBio = (baseline.bio ?? "").trim() || null;
  if (nextBio !== prevBio) {
    payload.bio = nextBio;
    expected.bio = baseline.bio;
  }
  return { payload, expected };
}
