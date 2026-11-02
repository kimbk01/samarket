"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { USER_SETTINGS_SAVE_FAILED_EVENT } from "@/lib/settings/user-settings-store";
import {
  MYPAGE_TOAST_EVENT,
  MYPAGE_TOAST_MOTION_MS,
  mypageToastDurationMs,
  type MypageToastDetail,
} from "@/lib/mypage/mypage-toast";
import { DibayToast } from "@/components/ui/dibay-overlay/DibayToast";
import { DIBAY_TOAST_Z_CLASS } from "@/lib/main-menu/bottom-nav-config";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { MYPAGE_TOAST_BOTTOM_VAR } from "@/components/mypage/ds/MyStickyCta";

/**
 * 하단 위치 — 기본은 공통 토스트 줄(`.dibay-toast-stack`, 팝업 SSOT §3-10 · B4).
 * `MyStickyCta` 가 떠 있으면 CTA 가 `--mypage-toast-bottom`(= CTA 높이 + 8px) 을 문서 루트에 지정해
 * CTA 위로 올린다 — 그때만 인라인 bottom 으로 덮는다.
 */
function readMypageToastBottomOverride(): string | null {
  if (typeof document === "undefined") return null;
  const v = document.documentElement.style.getPropertyValue(MYPAGE_TOAST_BOTTOM_VAR).trim();
  return v ? `var(${MYPAGE_TOAST_BOTTOM_VAR})` : null;
}

/**
 * 내정보 토스트 1개 — 일반 3초 · 액션([되돌리기]) 5초 · 등장/퇴장 220ms.
 * 설정 저장 실패(되돌림)도 여기서 알린다 (D16).
 */
export function MypageToastHost() {
  const { t } = useI18n();
  const [toast, setToast] = useState<MypageToastDetail | null>(null);
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const removeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enterRaf = useRef<number | null>(null);
  /** 리스너는 1회만 등록 — `t` 정체성이 바뀌어도 진행 중 타이머를 지우지 않도록 ref 로 읽는다 */
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  useEffect(() => {
    const clearTimers = () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (removeTimer.current) clearTimeout(removeTimer.current);
      if (enterRaf.current != null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(enterRaf.current);
      }
      hideTimer.current = null;
      removeTimer.current = null;
      enterRaf.current = null;
    };
    const show = (detail: MypageToastDetail) => {
      clearTimers();
      setToast(detail);
      setVisible(false);
      if (typeof requestAnimationFrame === "function") {
        enterRaf.current = requestAnimationFrame(() => setVisible(true));
      } else {
        setVisible(true);
      }
      hideTimer.current = setTimeout(() => {
        setVisible(false);
        removeTimer.current = setTimeout(() => setToast(null), MYPAGE_TOAST_MOTION_MS);
      }, mypageToastDurationMs(detail));
    };
    const onToast = (e: Event) => {
      const detail = (e as CustomEvent<MypageToastDetail>).detail;
      if (detail?.message) show(detail);
    };
    const onSettingsFailed = () =>
      show({ message: tRef.current("mypage_settings_save_failed_reverted"), tone: "error" });
    window.addEventListener(MYPAGE_TOAST_EVENT, onToast);
    window.addEventListener(USER_SETTINGS_SAVE_FAILED_EVENT, onSettingsFailed);
    return () => {
      window.removeEventListener(MYPAGE_TOAST_EVENT, onToast);
      window.removeEventListener(USER_SETTINGS_SAVE_FAILED_EVENT, onSettingsFailed);
      clearTimers();
    };
  }, []);

  if (!toast) return null;

  const action = toast.action;
  const onAction = () => {
    if (!action) return;
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = null;
    setToast(null);
    setVisible(false);
    action.onPress();
  };

  const bottomOverride = readMypageToastBottomOverride();
  const motion = `transition-[opacity,transform] duration-[220ms] ease-out motion-reduce:transition-none ${
    visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
  }`;

  return (
    <DibayToast
      message={toast.message}
      tone={toast.tone}
      role={toast.tone === "error" ? "alert" : "status"}
      stackClassName={`${OverlayUi.toastStack} ${DIBAY_TOAST_Z_CLASS} ${motion}`}
      stackStyle={bottomOverride ? { bottom: bottomOverride } : undefined}
      dataAttrs={{ "data-testid": "mypage-toast", "data-toast-visible": visible ? "true" : "false" }}
      action={
        action
          ? {
              label: (
                <span data-testid="mypage-toast-action">
                  {action.label?.trim() ? action.label : t("mypage_comp_ds_undo")}
                </span>
              ),
              onPress: onAction,
            }
          : null
      }
    />
  );
}
