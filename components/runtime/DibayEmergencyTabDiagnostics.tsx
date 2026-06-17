"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { getAppBootSnapshot } from "@/lib/app-boot/app-boot-store";
import { isGuestAuthEstablished } from "@/lib/auth/guest-auth-state";
import { useClientMembershipState } from "@/hooks/use-client-membership-state";

const TAB_PATHS = {
  market: "/market",
  stores: "/stores",
  messenger: "/community-messenger",
  mypage: "/mypage",
} as const;

const WATCHED_API_PREFIXES = [
  "/api/market",
  "/api/philife/posts",
  "/api/stores",
  "/api/community-messenger/home",
  "/api/community-messenger/rooms",
  "/api/community-messenger/presence",
  "/api/me/notifications",
  "/api/me/profile",
  "/api/auth/session",
] as const;

type PageKey = keyof typeof TAB_PATHS;

function resolvePageKey(pathname: string): PageKey | null {
  if (pathname.startsWith(TAB_PATHS.market)) return "market";
  if (pathname.startsWith(TAB_PATHS.stores)) return "stores";
  if (pathname.startsWith(TAB_PATHS.messenger)) return "messenger";
  if (pathname.startsWith(TAB_PATHS.mypage)) return "mypage";
  return null;
}

function summarizeBodyShape(json: unknown): Record<string, unknown> {
  if (!json || typeof json !== "object") return { type: typeof json };
  const obj = json as Record<string, unknown>;
  const summary: Record<string, unknown> = { ok: obj.ok };
  for (const key of ["posts", "items", "rooms", "stores", "profile", "notifications"]) {
    const val = obj[key];
    if (Array.isArray(val)) summary[`${key}Count`] = val.length;
    else if (val && typeof val === "object") summary[`has_${key}`] = true;
  }
  if (typeof obj.authenticated === "boolean") summary.authenticated = obj.authenticated;
  return summary;
}

function classifyState(input: {
  membershipStatus: string;
  membershipCheckingMs: number;
  guestEstablished: boolean;
  bootStatus: string;
  lastApi?: { status: number; url: string; shape: Record<string, unknown> };
}): string {
  const { membershipStatus, membershipCheckingMs, guestEstablished, bootStatus, lastApi } = input;
  if (membershipStatus === "checking" && membershipCheckingMs >= 3_000) return "A_loading_checking_3s+";
  if (lastApi?.status === 401 || lastApi?.status === 403) return "C_api_401_403";
  if (lastApi?.status === 500 || lastApi?.status === 504) return "D_api_500_504";
  if (lastApi?.status === 200) {
    const empty =
      lastApi.shape.postsCount === 0 ||
      lastApi.shape.itemsCount === 0 ||
      lastApi.shape.roomsCount === 0 ||
      lastApi.shape.storesCount === 0;
    if (empty) return "B_api_200_empty_array";
  }
  if (guestEstablished && bootStatus === "anonymous") return "E_guest_gate_blocks_fetch";
  return "unknown";
}

let fetchPatched = false;

function patchFetchForEmergencyDiagnostics(): void {
  if (fetchPatched || typeof window === "undefined") return;
  fetchPatched = true;
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const path = (() => {
      try {
        return new URL(url, window.location.origin).pathname;
      } catch {
        return url;
      }
    })();

    const watched = WATCHED_API_PREFIXES.some((prefix) => path.startsWith(prefix));
    const t0 = performance.now();
    const res = await nativeFetch(input, init);
    if (!watched) return res;

    let shape: Record<string, unknown> = {};
    try {
      const clone = res.clone();
      const json: unknown = await clone.json();
      shape = summarizeBodyShape(json);
    } catch {
      shape = { parseError: true };
    }

    const durationMs = Math.round(performance.now() - t0);
    const boot = getAppBootSnapshot();
    console.info(
      "[dibay_emergency_api]",
      JSON.stringify({
        at: Date.now(),
        path,
        status: res.status,
        durationMs,
        shape,
        guestEstablished: isGuestAuthEstablished(),
        bootStatus: boot.status,
      }),
    );

    (
      window as Window & {
        __dibayLastEmergencyApi?: { status: number; url: string; shape: Record<string, unknown> };
      }
    ).__dibayLastEmergencyApi = { status: res.status, url: path, shape };

    return res;
  };
}

/**
 * 긴급 점검 — 메인 탭 API·membership·guest gate 상태를 콘솔에 구조화 로그.
 */
export function DibayEmergencyTabDiagnostics() {
  const pathname = usePathname() ?? "";
  const page = resolvePageKey(pathname);
  const membership = useClientMembershipState("dibay-emergency-tab-diagnostics");
  const checkingSinceRef = useRef<number | null>(null);

  useEffect(() => {
    patchFetchForEmergencyDiagnostics();
  }, []);

  useEffect(() => {
    if (!page) return;

    if (membership.status === "checking") {
      if (checkingSinceRef.current == null) checkingSinceRef.current = Date.now();
    } else {
      checkingSinceRef.current = null;
    }

    const checkingMs =
      checkingSinceRef.current != null ? Date.now() - checkingSinceRef.current : 0;

    const lastApi = (
      window as Window & {
        __dibayLastEmergencyApi?: { status: number; url: string; shape: Record<string, unknown> };
      }
    ).__dibayLastEmergencyApi;

    const boot = getAppBootSnapshot();
    const classification = classifyState({
      membershipStatus: membership.status,
      membershipCheckingMs: checkingMs,
      guestEstablished: isGuestAuthEstablished(),
      bootStatus: boot.status,
      lastApi,
    });

    console.info(
      "[dibay_emergency_page]",
      JSON.stringify({
        at: Date.now(),
        page,
        pathname,
        classification,
        membershipStatus: membership.status,
        membershipCheckingMs: checkingMs,
        guestEstablished: isGuestAuthEstablished(),
        bootStatus: boot.status,
        isCapacitor: !!(window as Window & { Capacitor?: unknown }).Capacitor,
        vercelGitSha: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? null,
      }),
    );
  }, [page, pathname, membership.status]);

  useEffect(() => {
    if (!page) return;
    const timer = window.setInterval(() => {
      if (membership.status !== "checking") return;
      const since = checkingSinceRef.current;
      if (since == null || Date.now() - since < 3_000) return;
      console.info(
        "[dibay_emergency_page_slow]",
        JSON.stringify({
          at: Date.now(),
          page,
          membershipCheckingMs: Date.now() - since,
          guestEstablished: isGuestAuthEstablished(),
          bootStatus: getAppBootSnapshot().status,
        }),
      );
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [page, membership.status]);

  return null;
}
