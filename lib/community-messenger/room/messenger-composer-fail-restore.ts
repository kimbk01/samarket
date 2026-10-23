/**
 * M-8 — restore failed send text into the composer only when the user has not
 * touched the draft (including type-then-clear) and no newer outbound began.
 */

export type ComposerFailRestoreSession = {
  generation: number;
  dirty: boolean;
};

export function createComposerFailRestoreSession(): ComposerFailRestoreSession {
  return { generation: 0, dirty: false };
}

/** Call when an outbound text send that may restore on fail starts. */
export function beginComposerFailRestoreSession(session: ComposerFailRestoreSession): number {
  session.generation += 1;
  session.dirty = false;
  return session.generation;
}

/** Call on any user draft edit while a restore-capable send may be in flight. */
export function markComposerFailRestoreDirty(session: ComposerFailRestoreSession): void {
  if (session.generation === 0) return;
  session.dirty = true;
}

export function shouldRestoreComposerAfterSendFail(args: {
  session: ComposerFailRestoreSession;
  sendGeneration: number;
  restoreOnFail: string | undefined;
}): boolean {
  if (args.restoreOnFail === undefined) return false;
  if (args.sendGeneration !== args.session.generation) return false;
  if (args.session.dirty) return false;
  return true;
}
