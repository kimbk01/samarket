import { create } from "zustand";

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
