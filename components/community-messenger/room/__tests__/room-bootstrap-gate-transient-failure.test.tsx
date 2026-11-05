// @vitest-environment jsdom
/**
 * M1 — 메신저 방 cold 진입 게이트: 준비 Promise reject(네트워크·마감·서버 일시 오류)는
 * 스피너 고착이 아니라 실패·다시 시도 상태로 전환하고, 접근 거부는 기존 리다이렉트를 유지한다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const prepare = vi.fn();
const redirect = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, push: () => {}, prefetch: () => {} }),
}));
vi.mock("@/components/community-messenger/CommunityMessengerRoomClient", () => ({
  CommunityMessengerRoomClient: () => createElement("div", { "data-probe": "room-client" }),
}));
vi.mock("@/components/community-messenger/room/CommunityMessengerRoomEntryEmpty", () => ({
  CommunityMessengerRoomEntryEmpty: ({ onRetryAfterFailure }: { onRetryAfterFailure?: () => void }) =>
    onRetryAfterFailure ?
      createElement("button", { "data-probe": "entry-retry", onClick: onRetryAfterFailure })
    : createElement("div", { "data-probe": "entry-spinner" }),
}));
vi.mock("@/components/community-messenger/room/MessengerRoomSwipeBackShell", () => ({
  MessengerRoomSwipeBackShell: ({ children }: { children: unknown }) => children,
}));
vi.mock("@/lib/auth/resource-access-denied-flow", () => ({
  redirectResourceAccessDenied: (...a: unknown[]) => redirect(...a),
}));
vi.mock("@/lib/community-messenger/room/use-messenger-room-url-search-params", () => ({
  useMessengerRoomUrlSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/lib/community-messenger/room/peek-messenger-room-viewer-user-id-client", () => ({
  peekMessengerRoomViewerUserIdClient: () => undefined,
}));
vi.mock("@/lib/community-messenger/room/messenger-room-initial-snapshot-authority", () => ({
  canMountCommunityMessengerRoomClient: () => true,
  pickAuthoritativeMessengerRoomSnapshot: () => null,
}));
vi.mock("@/lib/store-order-chat/store-order-messenger-room-entry-client", () => ({
  prepareStoreOrderMessengerRoomEntryByRoomId: (...a: unknown[]) => prepare(...a),
}));

import { CommunityMessengerRoomBootstrapGate } from "@/components/community-messenger/room/CommunityMessengerRoomBootstrapGate";
import { MessengerRoomBootstrapTransientError } from "@/lib/community-messenger/room/fetch-community-messenger-room-bootstrap-client";

const okResult = {
  ok: true as const,
  roomId: "room-1",
  snapshot: { room: { id: "room-1", roomType: "direct" }, viewerUserId: "u1", messages: [] },
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  prepare.mockReset();
  redirect.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function flush() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

async function mountGate() {
  await act(async () => {
    root.render(createElement(CommunityMessengerRoomBootstrapGate, { roomId: "room-1" }));
  });
  await flush();
}

const q = (probe: string) => container.querySelector(`[data-probe="${probe}"]`);

describe("M1 — 방 진입 게이트 일시 오류", () => {
  it("네트워크 오류 reject → 스피너 고착 없이 다시 시도 상태, 리다이렉트 없음", async () => {
    prepare.mockRejectedValue(new TypeError("Failed to fetch"));
    await mountGate();
    expect(q("entry-spinner")).toBeNull();
    expect(q("entry-retry")).not.toBeNull();
    expect(redirect).not.toHaveBeenCalled();
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  it("서버 일시 오류(503)도 접근 거부로 리다이렉트하지 않고 다시 시도 상태", async () => {
    prepare.mockRejectedValue(new MessengerRoomBootstrapTransientError(503));
    await mountGate();
    expect(q("entry-retry")).not.toBeNull();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("다시 시도 → 새 준비 요청 1회 → 성공 시 방 마운트", async () => {
    prepare.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce(okResult);
    await mountGate();
    await act(async () => {
      (q("entry-retry") as HTMLButtonElement).click();
    });
    await flush();
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(q("room-client")).not.toBeNull();
    expect(q("entry-retry")).toBeNull();
  });

  it("네트워크 복구(online) 시 자동 재시도 1회", async () => {
    prepare.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce(okResult);
    await mountGate();
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await flush();
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(q("room-client")).not.toBeNull();
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await flush();
    expect(prepare).toHaveBeenCalledTimes(2);
  });

  it("실제 접근 거부(ok:false)는 기존대로 리다이렉트하고 다시 시도 상태가 아니다", async () => {
    prepare.mockResolvedValue({ ok: false, error: "bootstrap_failed" });
    await mountGate();
    expect(redirect).toHaveBeenCalledTimes(1);
    expect(q("entry-retry")).toBeNull();
    expect(q("entry-spinner")).toBeNull();
  });

  it("화면 이탈 후 늦게 실패해도 상태 갱신·리다이렉트가 없다", async () => {
    let rejectLate: (e: unknown) => void = () => {};
    prepare.mockReturnValue(new Promise((_, reject) => (rejectLate = reject)));
    await mountGate();
    expect(q("entry-spinner")).not.toBeNull();
    act(() => root.unmount());
    await act(async () => {
      rejectLate(new TypeError("Failed to fetch"));
    });
    await flush();
    expect(redirect).not.toHaveBeenCalled();
    root = createRoot(container);
  });
});

describe("M1 — bootstrap 상태 코드 분류", () => {
  beforeEach(() => {
    vi.resetModules();
    sessionStorage.clear();
    localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function fetchWithStatus(status: number) {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: status >= 200 && status < 300,
          status,
          headers: new Headers(),
          json: () => Promise.resolve({ ok: false }),
        } as unknown as Response),
      ),
    );
    const mod = await vi.importActual<
      typeof import("@/lib/community-messenger/room/fetch-community-messenger-room-bootstrap-client")
    >("@/lib/community-messenger/room/fetch-community-messenger-room-bootstrap-client");
    return mod.fetchCommunityMessengerRoomBootstrapClient(`room-${status}`, { viewerUserId: "" }).then(
      (value) => ({ value, error: null as unknown }),
      (error: unknown) => ({ value: undefined, error }),
    );
  }

  it.each([500, 503, 408, 429])("%i → 일시 오류(throw)", async (status) => {
    const r = await fetchWithStatus(status);
    expect((r.error as Error)?.name).toBe("MessengerRoomBootstrapTransientError");
  });

  it.each([401, 403, 404, 410])("%i → 접근 거부(null, 기존 계약)", async (status) => {
    const r = await fetchWithStatus(status);
    expect(r.error).toBeNull();
    expect(r.value).toBeNull();
  });
});
