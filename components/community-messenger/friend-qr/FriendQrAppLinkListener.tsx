"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import { buildFriendQrHomePath, parseFriendQrPayload } from "@/lib/community-messenger/friend-qr/friend-qr-contract";

/**
 * 앱 링크 `https://{운영 주소}/f/{토큰}` 으로 앱이 열렸을 때 → 메신저 결과 시트 (설계안 v3 §3.6 · 4단계).
 * `dibay://` 링크는 `PushRouteListener` 가 맡는다 — 이 부품은 https 친구 QR 주소만 보며 다른 경로(통화·채팅·푸시)는 건드리지 않는다.
 * 앱이 꺼져 있다가 열린 경우는 `getLaunchUrl` 로 한 번 확인한다.
 */
/**
 * 앱이 꺼져 있다가 열린 주소(`getLaunchUrl`)는 프로세스가 살아 있는 동안 계속 같은 값을 돌려준다 —
 * 다시 마운트(로그인 변경 등)될 때마다 결과 시트가 다시 열리지 않게 프로세스당 1회만 처리한다 (PR #145 리뷰).
 */
let launchUrlConsumed = false;

export function FriendQrAppLinkListener() {
  const router = useRouter();
  useEffect(() => {
    if (typeof window === "undefined" || !isCapacitorNativePlatform()) return;
    let remove: (() => void) | undefined;
    let cancelled = false;
    const handle = (url: string | undefined | null) => {
      const raw = (url ?? "").trim();
      if (!raw.startsWith("https://")) return;
      const token = parseFriendQrPayload(raw, window.location.origin);
      if (token) router.push(buildFriendQrHomePath(token));
    };
    void (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const sub = await App.addListener("appUrlOpen", (event) => handle(event.url));
        if (cancelled) {
          void sub.remove();
          return;
        }
        remove = () => void sub.remove();
        if (!launchUrlConsumed) {
          launchUrlConsumed = true;
          const launch = await App.getLaunchUrl().catch(() => undefined);
          if (!cancelled) handle(launch?.url);
        }
      } catch {
        /* Capacitor App plugin unavailable */
      }
    })();
    return () => {
      cancelled = true;
      remove?.();
    };
  }, [router]);
  return null;
}
