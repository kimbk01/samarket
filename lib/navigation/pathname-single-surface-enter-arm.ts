/**
 * CONTRACT — single-surface route enter (bottom-nav hub RTL/LTR) arm ownership.
 *
 * Pathname transition owns the pending rAF. Intent clear / children rerenders must NOT
 * cancel an in-flight arm for the same pathKey. Only pathname supersede or unmount may cancel.
 *
 * DO NOT: wire this arm's cancel into React effect cleanup that also depends on
 * pendingMenuIntent / children (that recreates the intermittent hard-cut race).
 */

export type PathnameSingleSurfaceEnterArm = {
  pathKey: string;
  rafId: number;
};

export type PathnameSingleSurfaceEnterArmHost = {
  current: PathnameSingleSurfaceEnterArm | null;
};

export function cancelPathnameSingleSurfaceEnterArm(
  host: PathnameSingleSurfaceEnterArmHost,
  cancelAnimationFrameImpl: (id: number) => void = cancelAnimationFrame
): void {
  const pending = host.current;
  if (!pending) return;
  cancelAnimationFrameImpl(pending.rafId);
  host.current = null;
}

/**
 * Arm enter callback on the next animation frame for `pathKey`.
 * - Same pathKey already pending → keep existing arm (no replace / no double-fire).
 * - Different pathKey → cancel previous (supersede) then arm.
 */
export function armPathnameSingleSurfaceEnter(
  host: PathnameSingleSurfaceEnterArmHost,
  args: {
    pathKey: string;
    onFrame: () => void;
    requestAnimationFrameImpl?: (cb: FrameRequestCallback) => number;
    cancelAnimationFrameImpl?: (id: number) => void;
  }
): void {
  const rafImpl = args.requestAnimationFrameImpl ?? requestAnimationFrame;
  const cancelImpl = args.cancelAnimationFrameImpl ?? cancelAnimationFrame;

  if (host.current?.pathKey === args.pathKey) {
    return;
  }

  if (host.current) {
    cancelImpl(host.current.rafId);
    host.current = null;
  }

  const rafId = rafImpl(() => {
    if (host.current?.rafId !== rafId) return;
    host.current = null;
    args.onFrame();
  });
  host.current = { pathKey: args.pathKey, rafId };
}
