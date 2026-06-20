"use client";

export type CallSystemPipModeDetail = {
  active: boolean;
  sessionId: string;
};

export function installCallSystemPipBridge(handlers: {
  onPipModeChange: (detail: CallSystemPipModeDetail) => void;
}): () => void {
  if (typeof window === "undefined") return () => {};

  const onPip = (ev: Event) => {
    const detail = (ev as CustomEvent<Partial<CallSystemPipModeDetail>>).detail;
    const sessionId = detail?.sessionId?.trim() ?? "";
    if (!sessionId) return;
    handlers.onPipModeChange({ active: detail?.active === true, sessionId });
  };

  window.addEventListener("dibay:call-pip", onPip);
  return () => window.removeEventListener("dibay:call-pip", onPip);
}
