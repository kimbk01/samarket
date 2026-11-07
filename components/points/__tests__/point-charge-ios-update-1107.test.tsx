// @vitest-environment jsdom
/**
 * D-07 (광고 3차 재감사 · 2026-11-07) — iOS 앱 구 빌드(StoreKit 없음)는 서버가 계좌 충전을 403 으로 막는다.
 * 옛 화면은 StoreKit 이 없으면 계좌 폼을 보여 「요청 실패」만 떴다.
 * - iOS 앱 + StoreKit 없음 → 계좌 폼 대신 「앱을 최신 버전으로 업데이트하면 충전할 수 있어요」 + 업데이트 화면 이동
 * - Android·웹 → 계좌 폼 그대로
 * - 계좌 폼에서 403 ios_digital_purchase_unavailable → 같은 안내 (공통 「요청 실패」 아님)
 * - 판별 = 서버와 같은 detectIosAppRequestSignals (셸·쿠키·UA)
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const modeRef: { mode: "apple" | "ios_update_required" | "bank" } = { mode: "bank" };
vi.mock("@/components/points/use-point-charge-mode", () => ({ usePointChargeMode: () => modeRef.mode }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  usePathname: () => "/mypage/points/charge",
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: ReactNode; href: string; "data-testid"?: string }) => (
    <a href={href} data-testid={rest["data-testid"]}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/ui/use-form-keyboard-viewport", () => ({
  useFormKeyboardViewport: () => ({ effectiveBottomInset: 0, keyboardOpen: false }),
}));
vi.mock("@/components/i18n/AppLanguageProvider", async () => {
  const { translate } = await import("@/lib/i18n/messages");
  const value = {
    language: "ko",
    t: (k: string, vars?: Record<string, string | number>) => translate("ko", k as never, vars),
    safeT: (k: string, o?: { fallbackKo?: string }) => translate("ko", k as never) || o?.fallbackKo || k,
  };
  return { useI18n: () => value };
});
vi.mock("@/lib/mypage/mypage-toast", () => ({ showMypageToast: () => {} }));

import { PointChargeForm } from "@/components/points/PointChargeForm";
import {
  isIosAppPointChargeClient,
  isIosPointChargeBlockedResponse,
  readDibayAppMarkerCookie,
  resolvePointChargeMode,
} from "@/lib/points/ios-point-charge-gate";
import { detectIosAppRequestSignals } from "@/lib/apple-iap/ios-digital-purchase-contract";
import { translate } from "@/lib/i18n/messages";
import type { PointPlan } from "@/lib/types/point";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const IOS_APP_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const IOS_SAFARI_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const ANDROID_APP_UA =
  "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36";

const UPDATE_KO = "앱을 최신 버전으로 업데이트하면 충전할 수 있어요";

const plan: PointPlan = {
  id: "plan1",
  name: "1,000P",
  paymentAmount: 100,
  pointAmount: 1000,
  bonusPointAmount: 0,
  isActive: true,
  description: "",
  rateVersion: 1,
} as PointPlan;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const q = (id: string) => host!.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

beforeEach(() => {
  modeRef.mode = "bank";
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.unstubAllGlobals();
});

describe("D-07 판별 = 서버와 같은 신호", () => {
  it.each([
    [{ userAgent: IOS_APP_UA }, true],
    [{ markerCookie: "ios", userAgent: IOS_SAFARI_UA }, true],
    [{ shell: "ios", userAgent: "" }, true],
    [{ userAgent: IOS_SAFARI_UA }, false],
    [{ shell: "android", userAgent: ANDROID_APP_UA }, false],
    [{ shell: "web", userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/129.0 Safari/537.36" }, false],
  ] as const)("%o → iOS 앱 %s (서버 detectIosAppRequestSignals 와 같은 결과)", (input, expected) => {
    expect(isIosAppPointChargeClient(input)).toBe(expected);
    const server = detectIosAppRequestSignals({
      shellHeader: "shell" in input ? input.shell : null,
      markerCookie: "markerCookie" in input ? input.markerCookie : null,
      userAgent: input.userAgent,
    });
    expect(server.length > 0).toBe(expected);
  });

  it("StoreKit 있으면 apple · iOS 앱 + 없음이면 ios_update_required · 그 밖은 bank", () => {
    expect(resolvePointChargeMode({ iosApp: true, storeKitAvailable: true })).toBe("apple");
    expect(resolvePointChargeMode({ iosApp: true, storeKitAvailable: false })).toBe("ios_update_required");
    expect(resolvePointChargeMode({ iosApp: false, storeKitAvailable: false })).toBe("bank");
  });

  it("쿠키 읽기 · 403 코드 판정", () => {
    expect(readDibayAppMarkerCookie("a=1; dibay_app=ios; b=2")).toBe("ios");
    expect(readDibayAppMarkerCookie("a=1")).toBeNull();
    expect(isIosPointChargeBlockedResponse(403, "ios_digital_purchase_unavailable")).toBe(true);
    expect(isIosPointChargeBlockedResponse(403, "forbidden")).toBe(false);
    expect(isIosPointChargeBlockedResponse(500, "ios_digital_purchase_unavailable")).toBe(false);
  });

  it("문구 ko·en 둘 다 있다", () => {
    expect(translate("ko", "points_charge_ios_update_required")).toBe(UPDATE_KO);
    expect(translate("en", "points_charge_ios_update_required")).toMatch(/update the app/i);
    expect(translate("ko", "points_charge_ios_update_cta")).toBe("앱 업데이트하기");
  });
});

describe("D-07 충전 화면", () => {
  it("iOS 앱 구 빌드(StoreKit 없음) → 계좌 폼 없이 업데이트 안내 + 업데이트 화면 이동", () => {
    modeRef.mode = "ios_update_required";
    act(() => root!.render(<PointChargeForm layout="page" plans={[plan]} onSuccess={() => {}} />));
    expect(q("point-charge-ios-update-required")?.textContent).toContain(UPDATE_KO);
    expect(q("point-charge-ios-update-cta")?.getAttribute("href")).toBe("/mypage/app-updates");
    expect(host!.querySelector('input[type="text"]')).toBeNull();
    expect(q("my-sticky-cta-primary")).toBeNull();
  });

  it("Android·웹 → 계좌 폼 그대로", () => {
    modeRef.mode = "bank";
    act(() => root!.render(<PointChargeForm layout="page" plans={[plan]} onSuccess={() => {}} />));
    expect(q("point-charge-ios-update-required")).toBeNull();
    expect(host!.querySelector('input[type="text"]')).not.toBeNull();
  });

  it("계좌 폼에서 403 ios_digital_purchase_unavailable → 같은 업데이트 안내", async () => {
    modeRef.mode = "bank";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: false, error: "ios_digital_purchase_unavailable" }), { status: 403 }))
    );
    act(() => root!.render(<PointChargeForm layout="page" plans={[plan]} onSuccess={() => {}} />));
    const depositor = host!.querySelector<HTMLInputElement>('input[type="text"]')!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(depositor, "홍길동");
      depositor.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      q("my-sticky-cta-primary")!.click();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(q("point-charge-ios-update-required")?.textContent).toContain(UPDATE_KO);
    expect(host!.querySelector('input[type="text"]')).toBeNull();
  });
});
