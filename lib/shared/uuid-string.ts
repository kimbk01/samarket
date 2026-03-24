const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** RFC 4122 variant까지 검사 (엄격) */
export function isUuidString(v: string): boolean {
  return UUID_RE.test(v.trim());
}

/**
 * 8-4-4-4-12 hex 형태만 검사 (Postgres uuid 텍스트).
 * test_users 시드(`11111111-1111-1111-1111-...`)처럼 variant 니블이 8/9/a/b가 아닌 값도 허용.
 */
const UUID_LIKE_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuidLikeString(v: string): boolean {
  return UUID_LIKE_RE.test(v.trim());
}
