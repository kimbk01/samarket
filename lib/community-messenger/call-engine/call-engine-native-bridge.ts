"use client";

export type CallEngineNativeEventAction = "accept" | "reject" | "missed" | "end";

export type CallEngineNativeEvent = {
  callId: string;
  action: CallEngineNativeEventAction;
  source: "native_notification" | "native_fsi" | "native_service";
};

const EVENT_NAME = "dibay:call-engine-native-action";

function resolveEventTarget(): EventTarget | null {
  if (typeof window !== "undefined") return window;
  const maybeGlobal = globalThis as unknown as EventTarget;
  if (typeof maybeGlobal?.addEventListener === "function") return maybeGlobal;
  return null;
}

export function dispatchCallEngineNativeEvent(event: CallEngineNativeEvent): void {
  const target = resolveEventTarget();
  if (!target) return;
  target.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: event }));
}

export function subscribeCallEngineNativeEvent(listener: (event: CallEngineNativeEvent) => void): () => void {
  const target = resolveEventTarget();
  if (!target) return () => {};
  const onEvent = (ev: Event) => {
    const detail = (ev as CustomEvent<CallEngineNativeEvent>).detail;
    if (!detail?.callId) return;
    listener(detail);
  };
  target.addEventListener(EVENT_NAME, onEvent);
  return () => target.removeEventListener(EVENT_NAME, onEvent);
}
