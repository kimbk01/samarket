"use client";

import { create } from "zustand";

/**
 * 스캔 결과 시트 열기 — 앱 안 스캔·갤러리·`?friendQr=` 주소가 모두 여기로 토큰을 넘긴다 (설계안 v3 §3.6 · 시안 D).
 * 시트는 메신저 홈의 `FriendQrResultHost` 하나만 그린다.
 */
type FriendQrResultState = {
  token: string | null;
  open: (token: string) => void;
  close: () => void;
};

export const useFriendQrResultStore = create<FriendQrResultState>((set) => ({
  token: null,
  open: (token) => set((s) => (s.token === token ? s : { token })),
  close: () => set((s) => (s.token === null ? s : { token: null })),
}));
