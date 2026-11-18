import {
  beginComposerFailRestoreSession,
  createComposerFailRestoreSession,
  markComposerFailRestoreDirty,
  shouldRestoreComposerAfterSendFail,
  type ComposerFailRestoreSession,
} from "@/lib/community-messenger/room/messenger-composer-fail-restore";

/** Single active room composer — one outbound restore session at a time. */
const activeSession: ComposerFailRestoreSession = createComposerFailRestoreSession();

export function beginActiveComposerFailRestoreSession(): number {
  return beginComposerFailRestoreSession(activeSession);
}

export function getActiveComposerFailRestoreGeneration(): number {
  return activeSession.generation;
}

export function markActiveComposerDraftEditedDuringOutbound(): void {
  markComposerFailRestoreDirty(activeSession);
}

export function shouldRestoreActiveComposerAfterSendFail(args: {
  sendGeneration: number;
  restoreOnFail: string | undefined;
}): boolean {
  return shouldRestoreComposerAfterSendFail({
    session: activeSession,
    sendGeneration: args.sendGeneration,
    restoreOnFail: args.restoreOnFail,
  });
}

/**
 * FAIL-1 감사 #1: 실패 시 입력창 복원·방별 초안 저장 대상(restoreOnFail)은 **입력창에서 시작한 전송만**.
 * 입력창 밖 전송(주문 채팅 안내·매칭 확인 등)은 undefined → 거절돼도 입력창·초안을 건드리지 않고 실패 행으로 남는다.
 */
export function resolveSendRestoreOnFail(
  raw: string,
  opts?: { fromComposer?: boolean }
): string | undefined {
  return opts?.fromComposer ? raw : undefined;
}
