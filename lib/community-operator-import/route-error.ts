/**
 * 관리자 외부 글 가져오기 API 오류 — 코드 + 진단 원문(`detail`) 분리 (언어 재감사 2026-11-27 꼬리 정리 9번).
 *
 * - `error`·`code` 에는 코드만 넣는다(화면 문구는 관리자 화면 카탈로그가 정한다).
 * - DB·외부 사이트 원문은 관리자 진단용으로 `detail` 에만 넣는다(관리자 전용 API 만 — SSOT §4-4 S9).
 * - 라이브러리 오류는 `코드: 원문`·`코드:값` 모양이 많다 → 앞 코드만 `code` 로 쓴다.
 */
const CODE_SHAPE = /^[a-z][a-z0-9_]*$/;

export type ImportRouteErrorParts = { code: string; detail: string | null };

function rawMessage(e: unknown): string {
  if (e instanceof Error) return String(e.message ?? "").trim();
  if (typeof e === "string") return e.trim();
  return "";
}

/** 오류에서 코드(앞부분)와 진단 원문을 나눈다 — 코드 모양이 아니면 `fallbackCode` */
export function importRouteErrorParts(e: unknown, fallbackCode: string): ImportRouteErrorParts {
  const raw = rawMessage(e);
  const head = raw.split(":")[0]?.trim() ?? "";
  const code = CODE_SHAPE.test(head) ? head : fallbackCode;
  return { code, detail: raw && raw !== code ? raw : null };
}

/** 코드는 정해져 있고 원문만 진단용으로 붙일 때 */
export function importRouteErrorDetail(e: unknown, code: string): string | null {
  const raw = rawMessage(e);
  return raw && raw !== code ? raw : null;
}
