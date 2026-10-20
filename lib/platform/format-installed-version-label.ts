/**
 * 설치 앱 버전 표기 `버전 (빌드)` — 버전 화면(S18)과 내정보 홈 「버전 정보」 행이 같은 함수 사용.
 * 버전명이 없으면 null (호출부가 「알 수 없음」 등 문구 결정).
 */
export function formatInstalledVersionLabel(
  versionName: string | null | undefined,
  buildNumber: number | null | undefined,
): string | null {
  const name = (versionName ?? "").trim();
  if (!name) return null;
  return buildNumber != null ? `${name} (${buildNumber})` : name;
}

/** 웹 배포 SHA 7자리 — 네이티브 앱 버전이 없을 때(웹) 홈 행 값 */
export function formatWebDeployShaLabel(sha: string | null | undefined): string | null {
  const s = (sha ?? "").trim();
  return s ? s.slice(0, 7) : null;
}
