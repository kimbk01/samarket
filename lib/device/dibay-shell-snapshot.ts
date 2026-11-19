/**
 * 지금 셸의 기기 판정·메뉴 형태 사진 — 앱 진입 계측(`entry-telemetry.client.ts`)이 이벤트에 붙인다.
 * 2026-11-19 (Owner 승인 D3, `docs/audit/mac-bottom-nav-device-class-2026-11-19.md`): 맥·태블릿에서 하단 메뉴가
 * 나왔을 때 어떤 판정·창 폭이었는지 운영 로그로 확인하려고 둔다. 새 요청 없음(기존 계측 이벤트에 필드만).
 */
export type DibayShellSnapshot = {
  deviceClass: string;
  deviceClassSource: string | null;
  nav: "rail" | "bottom";
  usableWidth: number;
};

let snapshot: DibayShellSnapshot | null = null;

export function setDibayShellSnapshot(next: DibayShellSnapshot): void {
  snapshot = next;
}

export function readDibayShellSnapshot(): DibayShellSnapshot | null {
  return snapshot;
}

export function resetDibayShellSnapshotForTests(): void {
  snapshot = null;
}
