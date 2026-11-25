"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayOverlayRoot, useOverlayTitleIds } from "@/components/ui/dibay-overlay/DibayOverlayRoot";
import { DIBAY_APP_ICON_512_PATH, dibayBrandAssetUrl } from "@/lib/brand/brand-asset-paths";
import { getActiveCallSessionCallId } from "@/lib/call/active-call-session";
import { isCapacitorNativePlatform, resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";
import { getCapacitorAppInstalledVersion } from "@/lib/platform/android-play-in-app-update";
import {
  readUpdatePromptSafetyInput,
  resolveUpdatePromptSafety,
  shouldYieldOpenUpdatePrompt,
} from "@/lib/platform/android-play-update-prompt-gate";
import {
  IOS_UPDATE_COLD_START_DELAY_MS,
  IOS_UPDATE_DEFERRAL_STORAGE_KEY,
  IOS_UPDATE_LOOKUP_TIMEOUT_MS,
  buildIosAppStoreLookupUrl,
  decideIosUpdatePrompt,
  isIosUpdateCheckDue,
  parseIosAppStoreLookupVersion,
  parseIosUpdateDeferral,
  type IosUpdateDeferral,
} from "@/lib/platform/ios-app-store-update-policy";
import { DIBAY_IOS_APP_STORE_REDIRECT_URL } from "@/lib/share/app-store-links";
import { Sam } from "@/lib/ui/css-vars";

/** 안내가 대기 중일 때 안전해졌는지 다시 보는 간격 (Android Host 와 같은 3초). */
const PENDING_RECHECK_MS = 3_000;

type Prompt = { installed: string; latest: string };

function readDeferral(): IosUpdateDeferral | null {
  try {
    return parseIosUpdateDeferral(window.localStorage.getItem(IOS_UPDATE_DEFERRAL_STORAGE_KEY));
  } catch {
    return null;
  }
}

function writeDeferral(value: IosUpdateDeferral): void {
  try {
    window.localStorage.setItem(IOS_UPDATE_DEFERRAL_STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* 저장 불가 — 다음 실행에 다시 안내될 뿐 */
  }
}

async function fetchLatestAppStoreVersion(): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), IOS_UPDATE_LOOKUP_TIMEOUT_MS);
  try {
    const res = await fetch(buildIosAppStoreLookupUrl(Date.now()), { cache: "no-store", signal: ctrl.signal });
    if (!res.ok) return null;
    return parseIosAppStoreLookupVersion(await res.json().catch(() => null));
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * iOS 앱 열 때 업데이트 안내 (Owner 「구현 승인」 2026-11-26 · 설계 docs/audit/ios-app-update-prompt-design-2026-11-26.md).
 * 처음 열고 8초 뒤 · 앞으로 다시 올 때(30분에 1번) Apple 공개 조회로 최신 버전을 확인하고, 설치 버전이 낮으면
 * Android 업데이트 화면과 같은 모양의 안내를 띄운다. 「업데이트」 = App Store DIBAY 화면 열기 · 「나중에」 = 같은 버전 24시간 멈춤.
 * 인트로·채팅·통화·결제·글쓰기·다른 팝업·글자 입력 중에는 띄우지 않고 기다린다(Android 안전 규칙 그대로).
 * iOS 네이티브가 아니면 아무것도 하지 않는다.
 */
export function IosAppStoreUpdateHost() {
  const { safeT } = useI18n();
  const { titleId } = useOverlayTitleIds("ios-app-store-update");
  const pathname = usePathname();
  const [open, setOpen] = useState<Prompt | null>(null);
  const [pending, setPending] = useState<Prompt | null>(null);

  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const openRef = useRef<Prompt | null>(null);
  openRef.current = open;
  const pendingRef = useRef<Prompt | null>(null);
  pendingRef.current = pending;
  const promptsThisRunRef = useRef(0);
  const lastCheckAtRef = useRef<number | null>(null);
  const checkingRef = useRef(false);

  const isIos = isCapacitorNativePlatform() && resolveCapacitorShellPlatform() === "ios";

  const safetyInput = useCallback(
    (ownDialogsOpen: number) =>
      readUpdatePromptSafetyInput({
        pathname: pathnameRef.current,
        callActive: getActiveCallSessionCallId() != null,
        ownDialogsOpen,
      }),
    []
  );

  const tryPresent = useCallback(() => {
    const held = pendingRef.current;
    if (!held || openRef.current) return;
    if (!resolveUpdatePromptSafety(safetyInput(0)).safe) return;
    promptsThisRunRef.current += 1;
    setPending(null);
    setOpen(held);
  }, [safetyInput]);

  const runCheck = useCallback(async () => {
    if (checkingRef.current || openRef.current || pendingRef.current) return;
    const now = Date.now();
    if (!isIosUpdateCheckDue(lastCheckAtRef.current, now)) return;
    checkingRef.current = true;
    lastCheckAtRef.current = now;
    try {
      const [installedInfo, latest] = await Promise.all([
        getCapacitorAppInstalledVersion(),
        fetchLatestAppStoreVersion(),
      ]);
      const installed = installedInfo?.versionName ?? null;
      const decision = decideIosUpdatePrompt({
        installedVersion: installed,
        latestVersion: latest,
        deferral: readDeferral(),
        now: Date.now(),
        promptsThisRun: promptsThisRunRef.current,
      });
      if (!decision.show || !installed) return;
      setPending({ installed, latest: decision.latestVersion });
    } finally {
      checkingRef.current = false;
    }
  }, []);

  // 처음 열 때 8초 뒤 · 앞으로 다시 올 때 확인.
  useEffect(() => {
    if (!isIos) return;
    let cancelled = false;
    let removeAppState: (() => void) | undefined;
    const coldStartTimer = window.setTimeout(() => {
      if (!cancelled) void runCheck();
    }, IOS_UPDATE_COLD_START_DELAY_MS);
    void (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const handle = await App.addListener("appStateChange", ({ isActive }) => {
          if (!isActive || cancelled) return;
          void runCheck();
        });
        if (cancelled) {
          void handle.remove();
          return;
        }
        removeAppState = () => void handle.remove();
      } catch {
        /* 앱 상태 구독 실패 — 처음 열 때 확인만 한다 */
      }
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(coldStartTimer);
      removeAppState?.();
    };
  }, [isIos, runCheck]);

  // 대기 중인 안내: 화면 이동 시 · 3초마다 안전해졌는지 본다.
  useEffect(() => {
    if (!pending) return;
    tryPresent();
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      tryPresent();
    }, PENDING_RECHECK_MS);
    return () => window.clearInterval(id);
  }, [pending, pathname, tryPresent]);

  // 열린 안내: 통화·다른 팝업·민감 화면이 오면 닫고 다시 대기(미룸 아님).
  useEffect(() => {
    if (!open) return;
    const check = () => {
      const current = openRef.current;
      if (!current) return;
      if (shouldYieldOpenUpdatePrompt(safetyInput(1))) {
        promptsThisRunRef.current = Math.max(0, promptsThisRunRef.current - 1);
        setOpen(null);
        setPending(current);
      }
    };
    check();
    const id = window.setInterval(check, PENDING_RECHECK_MS);
    return () => window.clearInterval(id);
  }, [open, pathname, safetyInput]);

  const onLater = useCallback(() => {
    const current = openRef.current;
    if (current) writeDeferral({ version: current.latest, at: Date.now() });
    setOpen(null);
  }, []);

  const onUpdate = useCallback(() => {
    setOpen(null);
    window.open(DIBAY_IOS_APP_STORE_REDIRECT_URL, "_system");
  }, []);

  if (!isIos) return null;

  return (
    <DibayOverlayRoot
      open={Boolean(open)}
      onClose={onLater}
      dismissible
      placement="full"
      zRole="sheet"
      labelledBy={titleId}
      stageClassName="!p-0"
      stageStyle={{ top: 0, bottom: 0, height: "auto" }}
    >
      <div
        className="flex h-full min-h-0 w-full flex-col bg-sam-surface px-5 text-sam-fg"
        style={{
          paddingTop: "var(--safe-top, 0px)",
          paddingBottom: "max(1rem, var(--safe-bottom, 0px))",
        }}
        data-testid="ios-app-store-update-screen"
      >
        <div className="flex h-12 shrink-0 items-center justify-end">
          <button
            type="button"
            className="min-h-[44px] px-1 text-[15px] text-sam-muted"
            onClick={onLater}
            data-testid="ios-app-store-update-later"
          >
            {safeT("settings_version_install_later")}
          </button>
        </div>

        <Image
          src={dibayBrandAssetUrl(DIBAY_APP_ICON_512_PATH)}
          alt=""
          width={88}
          height={88}
          unoptimized
          priority
          className="mx-auto mt-[6vh] block shrink-0 rounded-[20px]"
        />

        <h1 id={titleId} className="mt-5 text-center text-[22px] font-extrabold tracking-[-0.3px]">
          {safeT("settings_update_screen_title")}
        </h1>
        <p className="mx-auto mt-2 max-w-[22rem] text-center text-[15px] leading-relaxed text-sam-fg">
          {safeT("settings_update_screen_desc")}
        </p>
        {open ? (
          <p
            className="mt-3 text-center text-[13px] tabular-nums text-sam-muted"
            data-testid="ios-app-store-update-versions"
          >
            {safeT("settings_version_current_label")}{" "}
            <span className="font-semibold text-sam-fg">{open.installed}</span>
            {" · "}
            {safeT("settings_version_new_version_label")}{" "}
            <span className="font-semibold text-sam-fg">{open.latest}</span>
          </p>
        ) : null}

        <div className="min-h-0 flex-1" />

        <button
          type="button"
          className={`${Sam.btn.primaryCombo} h-12 w-full shrink-0 rounded-ui-rect text-[17px] font-bold`}
          onClick={onUpdate}
          data-testid="ios-app-store-update-cta"
        >
          {safeT("settings_version_update_button")}
        </button>
      </div>
    </DibayOverlayRoot>
  );
}
