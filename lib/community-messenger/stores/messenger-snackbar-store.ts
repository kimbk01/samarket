import { create } from "zustand";
import { shouldSuppressCallOverlayToasts } from "@/lib/community-messenger/call-dock-presentation";

export type MessengerSnackbarVariant = "default" | "success" | "error";

type Entry = {
  id: number;
  message: string;
  variant: MessengerSnackbarVariant;
};

type MessengerSnackbarState = {
  current: Entry | null;
  hideTimer: ReturnType<typeof setTimeout> | null;
  show: (message: string, opts?: { variant?: MessengerSnackbarVariant; durationMs?: number }) => void;
  dismiss: () => void;
};

let nextId = 1;

/** NEW-13: 통화 오버레이 중 억제된 일반(비오류) 알림을 보관했다가 종료 후 재생. */
type PendingSnackbar = { message: string; variant: MessengerSnackbarVariant; durationMs?: number };
let pendingNonError: PendingSnackbar | null = null;

export const useMessengerSnackbarStore = create<MessengerSnackbarState>((set, get) => ({
  current: null,
  hideTimer: null,
  dismiss: () => {
    const t = get().hideTimer;
    if (t) clearTimeout(t);
    set({ current: null, hideTimer: null });
  },
  show: (message, opts) => {
    const trimmed = String(message ?? "").trim();
    if (!trimmed) return;
    const variant = opts?.variant ?? "default";
    // NEW-13: 오류는 통화 dock·PiP 중에도 항상 표시. 일반 알림만 보관했다가 종료 후 재생.
    if (shouldSuppressCallOverlayToasts() && variant !== "error") {
      pendingNonError = { message: trimmed, variant, durationMs: opts?.durationMs };
      return;
    }
    const durationMs =
      opts?.durationMs ?? (variant === "error" ? 5200 : variant === "success" ? 3200 : 4200);
    const id = nextId++;
    const prevTimer = get().hideTimer;
    if (prevTimer) clearTimeout(prevTimer);
    const hideTimer = setTimeout(() => {
      set((s) => (s.current?.id === id ? { current: null, hideTimer: null } : s));
    }, durationMs);
    set({ current: { id, message: trimmed, variant }, hideTimer });
  },
}));

/** 레이아웃 밖·훅 밖에서도 호출 가능한 비차단 안내 */
export function showMessengerSnackbar(
  message: string,
  opts?: { variant?: MessengerSnackbarVariant; durationMs?: number }
) {
  useMessengerSnackbarStore.getState().show(message, opts);
}

/**
 * NEW-13: 통화 오버레이가 닫힌 뒤 보관해 둔 일반(비오류) 알림을 재생한다.
 * 스낵바 호스트가 오버레이 종료를 감지할 때 호출한다. 아직 억제 상태면 아무것도 하지 않는다.
 */
export function flushPendingMessengerSnackbar(): void {
  if (shouldSuppressCallOverlayToasts()) return;
  const pending = pendingNonError;
  pendingNonError = null;
  if (pending) {
    useMessengerSnackbarStore.getState().show(pending.message, {
      variant: pending.variant,
      durationMs: pending.durationMs,
    });
  }
}
