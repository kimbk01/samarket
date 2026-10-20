/** v2.1 §6 — 닫은 내정보 배너는 id 단위로만 숨김(새 배너는 다시 보임) */
import { beforeEach, describe, expect, it } from "vitest";
import { isMypageBannerDismissed, rememberMypageBannerDismissed } from "@/lib/mypage/mypage-banner-dismissed";

describe("mypage banner dismissed (device)", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem: (k: string) => store.get(k) ?? null,
          setItem: (k: string, v: string) => void store.set(k, v),
        },
      },
    });
  });

  it("닫은 배너만 숨기고 다른 배너는 보인다", () => {
    rememberMypageBannerDismissed("b1");
    expect(isMypageBannerDismissed("b1")).toBe(true);
    expect(isMypageBannerDismissed("b2")).toBe(false);
  });

  it("저장소 오류여도 예외 없이 동작", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem: () => {
            throw new Error("blocked");
          },
          setItem: () => {
            throw new Error("blocked");
          },
        },
      },
    });
    expect(() => rememberMypageBannerDismissed("b1")).not.toThrow();
    expect(isMypageBannerDismissed("b1")).toBe(false);
  });
});
