"use client";

import type { ChatRoomSource } from "@/lib/types/chat";
import { logClientPerf } from "@/lib/performance/samarket-perf";

const TRADE_CHAT_ENTRY_KEY = "samarket.trade-chat-entry";

export type TradeChatEntryMode = "existing" | "create";

export type TradeChatEntryMark = {
  startedAt: number;
  mode: TradeChatEntryMode;
  productId: string | null;
  roomId: string | null;
  sourceHint: ChatRoomSource | null;
  shellShownAt?: number;
  roomResolvedAt?: number;
  firstMessagePaintAt?: number;
};

function canUseStorage(): boolean {
  return typeof window !== "undefined";
}

export function readTradeChatEntryMark(): TradeChatEntryMark | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.sessionStorage.getItem(TRADE_CHAT_ENTRY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TradeChatEntryMark> | null;
    if (!parsed || typeof parsed.startedAt !== "number") return null;
    return {
      startedAt: parsed.startedAt,
      mode: parsed.mode === "existing" ? "existing" : "create",
      productId: typeof parsed.productId === "string" ? parsed.productId : null,
      roomId: typeof parsed.roomId === "string" ? parsed.roomId : null,
      sourceHint:
        parsed.sourceHint === "chat_room" || parsed.sourceHint === "product_chat"
          ? parsed.sourceHint
          : null,
      shellShownAt: typeof parsed.shellShownAt === "number" ? parsed.shellShownAt : undefined,
      roomResolvedAt: typeof parsed.roomResolvedAt === "number" ? parsed.roomResolvedAt : undefined,
      firstMessagePaintAt:
        typeof parsed.firstMessagePaintAt === "number" ? parsed.firstMessagePaintAt : undefined,
    };
  } catch {
    return null;
  }
}

export function startTradeChatEntryMark(input: {
  mode: TradeChatEntryMode;
  productId?: string | null;
  roomId?: string | null;
  sourceHint?: ChatRoomSource | null;
}): void {
  if (!canUseStorage()) return;
  const mark: TradeChatEntryMark = {
    startedAt: Date.now(),
    mode: input.mode,
    productId: input.productId?.trim() || null,
    roomId: input.roomId?.trim() || null,
    sourceHint: input.sourceHint ?? null,
  };
  try {
    window.sessionStorage.setItem(TRADE_CHAT_ENTRY_KEY, JSON.stringify(mark));
  } catch {
    /* ignore storage errors */
  }
  logClientPerf("chat-entry.click", {
    mode: mark.mode,
    productId: mark.productId,
    roomId: mark.roomId,
    sourceHint: mark.sourceHint,
    startedAt: mark.startedAt,
  });
}

export function patchTradeChatEntryMark(
  patch: Partial<Omit<TradeChatEntryMark, "startedAt" | "mode">>
): TradeChatEntryMark | null {
  const current = readTradeChatEntryMark();
  if (!current || !canUseStorage()) return current;
  const next: TradeChatEntryMark = {
    ...current,
    ...patch,
  };
  try {
    window.sessionStorage.setItem(TRADE_CHAT_ENTRY_KEY, JSON.stringify(next));
  } catch {
    /* ignore storage errors */
  }
  return next;
}

export function clearTradeChatEntryMark(): void {
  if (!canUseStorage()) return;
  try {
    window.sessionStorage.removeItem(TRADE_CHAT_ENTRY_KEY);
  } catch {
    /* ignore storage errors */
  }
}
