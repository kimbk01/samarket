"use client";

export type CallEngineRouter = {
  replace: (href: string) => void;
};

let callEngineRouter: CallEngineRouter | null = null;

export function registerCallEngineRouter(router: CallEngineRouter | null): void {
  callEngineRouter = router;
}

export function getCallEngineRouter(): CallEngineRouter | null {
  return callEngineRouter;
}

export function buildCallEngineAcceptHref(sessionId: string): string {
  const sid = sessionId.trim();
  return `/community-messenger/calls/${encodeURIComponent(sid)}?action=accept&nativeAccept=1&mode=active`;
}
