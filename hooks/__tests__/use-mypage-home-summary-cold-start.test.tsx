// @vitest-environment jsdom
/**
 * 4차 실기 F1 (docs/audit/trade-final-defects-root-cause-design-2026-11-04.md · Owner 「설계안 승인」 2026-11-04)
 * 앱을 막 켜서 세션 복원 전에 내정보가 먼저 그려지면, 옛 훅은 사용자 id 를 처음 한 번만 읽어
 * 요약을 영원히 부르지 않았다(화면 「—」 고정 · 운영 로그 42초 동안 요청 0건).
 * - 처음 사용자 없음 → 회원 확인되는 순간 요청 정확히 1회 · 값 표시
 * - 같은 회원으로 다시 그려도 추가 요청 0
 * - 처음부터 회원 → 1회
 */
import { act, createElement, useEffect, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Membership = { status: "checking" } | { status: "guest" } | { status: "member"; profile: { id: string } };

let membership: Membership = { status: "checking" };
const membershipListeners = new Set<() => void>();
function setMembership(next: Membership) {
  membership = next;
  membershipListeners.forEach((l) => l());
}

vi.mock("@/hooks/use-client-membership-state", () => ({
  useClientMembershipState: () =>
    useSyncExternalStore(
      (cb) => {
        membershipListeners.add(cb);
        return () => membershipListeners.delete(cb);
      },
      () => membership,
      () => membership,
    ),
}));
vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: () => (membership.status === "member" ? membership.profile : null),
}));
vi.mock("@/lib/auth/dibay-session-manager", () => ({ subscribeDibayAuthStateChange: () => () => {} }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const okFields = { favoritesCount: { status: "ok", value: 1 } };
let fetchMock: ReturnType<typeof vi.fn>;
let root: Root | null = null;
const seen: { current: unknown } = { current: undefined };

async function mountHook() {
  const { useMypageHomeSummary } = await import("@/hooks/use-mypage-home-summary");
  function Probe() {
    const value = useMypageHomeSummary(true);
    useEffect(() => {
      seen.current = value;
    });
    return null;
  }
  const el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
  await act(async () => {
    root!.render(createElement(Probe));
    await wait(20);
  });
}

beforeEach(() => {
  vi.resetModules();
  membershipListeners.clear();
  seen.current = undefined;
  fetchMock = vi.fn(async () => {
    const viewerId = membership.status === "member" ? membership.profile.id : "";
    return new Response(JSON.stringify({ ok: true, viewerId, fields: okFields }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
});

describe("내정보 요약 — 세션 복원 전에 그려져도 조회한다", () => {
  it("처음 사용자 없음 → 회원 확인되면 요청 1회 · 값 표시 · 같은 회원 재렌더는 0회 추가", async () => {
    membership = { status: "checking" };
    await mountHook();
    expect(fetchMock).toHaveBeenCalledTimes(0);

    await act(async () => {
      setMembership({ status: "member", profile: { id: "u1" } });
      await wait(30);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((seen.current as { fields?: unknown } | null)?.fields).toEqual(okFields);

    await act(async () => {
      setMembership({ status: "member", profile: { id: "u1" } });
      await wait(30);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("처음부터 회원 → 요청 1회", async () => {
    membership = { status: "member", profile: { id: "u2" } };
    await mountHook();
    await act(async () => {
      await wait(20);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
