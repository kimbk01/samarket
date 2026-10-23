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
