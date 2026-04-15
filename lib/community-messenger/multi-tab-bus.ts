"use client";

type MessengerBusEvent =
  | { type: "cm.room.message_sent"; roomId: string; clientMessageId?: string; at: number }
  | { type: "cm.room.bump"; roomId: string; at: number };

const CHANNEL = "samarket:community-messenger";

function getChannel(): BroadcastChannel | null {
  if (typeof window === "undefined") return null;
  const BC = (globalThis as any).BroadcastChannel as typeof BroadcastChannel | undefined;
  if (!BC) return null;
  try {
    return new BC(CHANNEL);
  } catch {
    return null;
  }
}

export function postCommunityMessengerBusEvent(ev: MessengerBusEvent): void {
  const ch = getChannel();
  if (!ch) return;
  try {
    ch.postMessage(ev);
  } catch {
    /* ignore */
  } finally {
    ch.close();
  }
}

export function onCommunityMessengerBusEvent(handler: (ev: MessengerBusEvent) => void): () => void {
  const ch = getChannel();
  if (!ch) return () => {};
  const onMsg = (e: MessageEvent) => {
    const d = e.data as any;
    if (!d || typeof d !== "object") return;
    if (d.type !== "cm.room.message_sent" && d.type !== "cm.room.bump") return;
    if (typeof d.roomId !== "string" || !d.roomId.trim()) return;
    handler(d as MessengerBusEvent);
  };
  ch.addEventListener("message", onMsg);
  return () => {
    try {
      ch.removeEventListener("message", onMsg);
      ch.close();
    } catch {
      /* ignore */
    }
  };
}

