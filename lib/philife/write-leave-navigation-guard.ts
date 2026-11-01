/**
 * 작성 중 글 보호 — 앱 밖에서 시작된 화면 이동(푸시 알림 탭 등) 앞에서 묻는다 (Owner 승인 2026-11-02).
 *
 * 열려 있는 커뮤니티 작성기(시트·별도 페이지) 하나가 확인 함수를 등록한다. 이동하려는 쪽은
 * `confirmLeaveWriteBeforeNavigation()` 를 부르고 true 일 때만 이동한다.
 * - 작성기가 없거나 바뀐 내용이 없으면 바로 true.
 * - 바뀐 내용이 있으면 작성기의 나가기 시트(같은 1종)를 띄우고, 「나가기」면 정리(업로드·가드 기록) 후 true.
 * 통화 화면 이동은 이 확인을 거치지 않는다(호출부에서 제외).
 */
type LeaveConfirm = () => Promise<boolean>;

let current: LeaveConfirm | null = null;

/** 작성기가 열려 있는 동안 등록 · 반환 함수로 해제(자기 등록일 때만) */
export function registerWriteLeaveNavigationGuard(confirm: LeaveConfirm): () => void {
  current = confirm;
  return () => {
    if (current === confirm) current = null;
  };
}

export function hasWriteLeaveNavigationGuard(): boolean {
  return current !== null;
}

export async function confirmLeaveWriteBeforeNavigation(): Promise<boolean> {
  const confirm = current;
  if (!confirm) return true;
  try {
    return await confirm();
  } catch {
    return true;
  }
}
