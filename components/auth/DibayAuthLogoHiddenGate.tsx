"use client";

import { useCallback, useRef } from "react";
import { DibayAuthLogo } from "@/components/auth/DibayAuthLogo";

/** 운영자(아이디·비밀번호) 로그인 숨김 — 로고를 3초 안에 4번 눌러야 폼이 열린다 (Owner 2026-11-02). */
export const HIDDEN_INTERNAL_LOGIN_TAP_COUNT = 4;
export const HIDDEN_INTERNAL_LOGIN_WINDOW_MS = 3000;

/** 탭 시각 목록에 이번 탭을 더하고, 창 안에서 횟수를 채웠는지 돌려준다 (채우면 목록 비움). */
export function registerHiddenInternalLoginTap(
  taps: readonly number[],
  nowMs: number,
): { taps: number[]; unlocked: boolean } {
  const recent = taps.filter((t) => nowMs - t < HIDDEN_INTERNAL_LOGIN_WINDOW_MS);
  recent.push(nowMs);
  if (recent.length >= HIDDEN_INTERNAL_LOGIN_TAP_COUNT) return { taps: [], unlocked: true };
  return { taps: recent, unlocked: false };
}

/**
 * 로그인 화면 로고 — 고객에게는 그냥 로고. 1~3번째 탭은 아무 반응 없음.
 * 화면 숨김일 뿐 보안 장치가 아니다 (서버 비밀번호 로그인 설정은 그대로).
 */
export function DibayAuthLogoHiddenGate({
  size = 56,
  enabled,
  onUnlock,
}: {
  size?: number;
  /** 관리자 설정에서 아이디 로그인이 꺼져 있으면 탭을 세지 않는다 */
  enabled: boolean;
  onUnlock: () => void;
}) {
  const tapsRef = useRef<number[]>([]);
  const onPointerUp = useCallback(() => {
    if (!enabled) return;
    const next = registerHiddenInternalLoginTap(tapsRef.current, Date.now());
    tapsRef.current = next.taps;
    if (next.unlocked) onUnlock();
  }, [enabled, onUnlock]);
  return (
    <div
      className="mx-auto flex justify-center select-none"
      aria-hidden
      data-testid="auth-logo-hidden-gate"
      onPointerUp={onPointerUp}
      style={{ WebkitTouchCallout: "none", touchAction: "manipulation" }}
    >
      <DibayAuthLogo size={size} />
    </div>
  );
}
