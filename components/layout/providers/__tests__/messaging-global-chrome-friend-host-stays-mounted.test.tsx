// @vitest-environment jsdom
/**
 * 2026-11-27 — 친구 요청 전역 호스트는 처음 붙일 때만 idle 로 미루고, 붙은 뒤에는 화면을 옮겨도 내리지 않는다.
 * 이전: `/mypage`·`/philife` 안에서 화면을 옮길 때마다 내렸다 다시 붙여 친구 요청 전체 조회·실시간 채널 가입이 반복됐다
 * (운영 한 기기 45분 화면 이동 153번 → 조회 140번). 설계: docs/audit/supabase-request-surge-2026-11-18/messenger-refetch-amplification-2026-11-27.md §1
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({ pathname: "/mypage", life: { mounts: 0, unmounts: 0 }, dynamicIndex: 0 }));
vi.mock("next/navigation", () => ({ usePathname: () => h.pathname }));
/** `next/dynamic` 호출 순서: 소리 프라임 · 배지 브리지 · 배너 · 친구 요청 호스트(4번째) */
vi.mock("next/dynamic", async () => {
  const React = await import("react");
  return {
    default: () => {
      const index = h.dynamicIndex++;
      return function Stub() {
        React.useEffect(() => {
          if (index !== 3) return;
          h.life.mounts += 1;
          return () => {
            h.life.unmounts += 1;
          };
        }, []);
        return null;
      };
    },
  };
});
vi.mock("@/lib/layout/messaging-global-chrome-policy", () => ({
  resolveMessagingGlobalChromeFromPath: () => ({
    stableKey: "k",
    policy: {
      mountNotificationsBadgeRealtimeBridge: false,
      mountGlobalOrderChatUnreadSound: false,
      communityMessengerParticipantPlayback: "hub_sync_only",
      mountNotificationSoundPrime: false,
      mountMessengerInAppBannerHost: false,
    },
  }),
}));

import { MessagingGlobalChrome } from "@/components/layout/providers/MessagingGlobalChrome";
import { GLOBAL_INCOMING_FRIEND_REQUEST_HOST_IDLE_DEFER_MS } from "@/lib/layout/global-incoming-friend-request-host-mount-policy";

let root: Root;
let host: HTMLDivElement;

async function render() {
  await act(async () => {
    root.render(<MessagingGlobalChrome regionBarInLayout={false} />);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  h.life.mounts = 0;
  h.life.unmounts = 0;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  /** jsdom 에는 requestIdleCallback 이 없어 setTimeout 경로를 탄다 */
  delete (window as unknown as { requestIdleCallback?: unknown }).requestIdleCallback;
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
});

describe("친구 요청 전역 호스트", () => {
  it("/mypage 첫 진입은 idle 뒤에 붙고, 이후 /mypage·/philife 안 이동에서는 내리지 않는다", async () => {
    h.pathname = "/mypage";
    await render();
    expect(h.life.mounts).toBe(0);
    await act(async () => {
      vi.advanceTimersByTime(GLOBAL_INCOMING_FRIEND_REQUEST_HOST_IDLE_DEFER_MS + 1);
    });
    expect(h.life.mounts).toBe(1);

    for (const p of ["/mypage/section/a", "/mypage/section/a/b", "/philife", "/philife/post-1", "/market", "/mypage"]) {
      h.pathname = p;
      await render();
      await act(async () => {
        vi.advanceTimersByTime(GLOBAL_INCOMING_FRIEND_REQUEST_HOST_IDLE_DEFER_MS + 1);
      });
    }
    expect(h.life.mounts).toBe(1);
    expect(h.life.unmounts).toBe(0);
  });

  it("미루지 않는 화면(/market)은 바로 붙는다", async () => {
    h.pathname = "/market";
    await render();
    expect(h.life.mounts).toBe(1);
  });
});
