"use client";

/**
 * 상세 문의 카드 「보내기」 문구 → compose 에서 방 확정 후 첫 메시지로 1회 전송 (CTA-02, 2026-10-27).
 * 이전에는 카드 내부 상태로만 남아 방만 열리고 문구가 버려졌다.
 * `clientMessageId` 는 클릭 시 1회 생성 — 재시도·중복 마운트에도 서버가 같은 메시지로 취급한다.
 */

const STORAGE_KEY = "samarket.trade-chat-first-message";

type Stored = { productId: string; text: string; clientMessageId: string; createdAt: number };

/** 상세 → compose 이동 사이에만 유효 — 오래된 문구가 나중 방에 전송되지 않게 */
const MAX_AGE_MS = 5 * 60 * 1000;

function newClientMessageId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `tcfm-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function setTradeChatFirstMessage(productId: string, text: string): void {
  if (typeof window === "undefined") return;
  const id = productId.trim();
  const body = text.trim();
  try {
    if (!id || !body) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    const payload: Stored = { productId: id, text: body, clientMessageId: newClientMessageId(), createdAt: Date.now() };
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode — 문구 없이 방만 연다 */
  }
}

export function peekTradeChatFirstMessage(
  productId: string,
  now: number = Date.now()
): { text: string; clientMessageId: string } | null {
  if (typeof window === "undefined") return null;
  const id = productId.trim();
  if (!id) return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Stored> | null;
    if (!parsed || parsed.productId !== id) return null;
    if (typeof parsed.text !== "string" || !parsed.text.trim()) return null;
    if (typeof parsed.clientMessageId !== "string" || !parsed.clientMessageId) return null;
    if (typeof parsed.createdAt !== "number" || now - parsed.createdAt > MAX_AGE_MS) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return { text: parsed.text.trim(), clientMessageId: parsed.clientMessageId };
  } catch {
    return null;
  }
}

export function clearTradeChatFirstMessage(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
