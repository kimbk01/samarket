// @vitest-environment jsdom
import { act } from "react";
import type React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WalletGiftFriendPicker } from "@/components/gift-certificate/WalletGiftFriendPicker";

const INSTANCE_ID = "gift-instance-1";
const FRIEND_C = "friend-c";
const ROOM_ID = "room-c";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/components/i18n/AppLanguageProvider", () => ({
  useI18n: () => ({
    safeT: (_key: string, opts?: { fallbackKo?: string; fallbackEn?: string }) =>
      opts?.fallbackEn ?? opts?.fallbackKo ?? _key,
  }),
}));

vi.mock("@/components/ui/dibay-overlay", () => ({
  DibayBottomSheet: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="sheet">{children}</div> : null,
}));

vi.mock("@/components/gift-certificate/GiftVisualCard", () => ({
  GiftVisualCard: () => <div data-testid="gift-preview" />,
}));

vi.mock("@/lib/ui/sam-component-classes", () => ({
  Sam: { btn: { secondary: "secondary", primary: "primary" } },
}));

function mockFetchRoutes(
  fetchMock: ReturnType<typeof vi.fn>,
  opts?: { roomId?: string | null }
) {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.includes("/api/me/gift-certificates/friends/eligible")) {
      return {
        ok: true,
        json: async () => ({ ok: true, friends: [{ id: FRIEND_C, label: "Friend C" }] }),
      };
    }
    if (url.includes(`/api/me/gift-certificates/instances/${INSTANCE_ID}`)) {
      return {
        ok: true,
        json: async () => ({
          ok: true,
          instance: {
            id: INSTANCE_ID,
            giftScope: "STORE",
            storeName: "Test Store",
            title: "Test Gift",
            faceValue: 1000,
            remainingBalance: 1000,
          },
        }),
      };
    }
    if (url === "/api/community-messenger/rooms" && init?.method === "POST") {
      if (opts?.roomId === null) {
        return { ok: false, json: async () => ({ ok: false }) };
      }
      return {
        ok: true,
        json: async () => ({ ok: true, roomId: opts?.roomId ?? ROOM_ID }),
      };
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

describe("WalletGiftFriendPicker", () => {
  let container: HTMLDivElement;
  let root: Root;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    pushMock.mockReset();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  async function flush() {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it("T1 shows canonical friend C from the picker API", async () => {
    mockFetchRoutes(fetchMock);

    act(() => {
      root.render(<WalletGiftFriendPicker open onClose={() => {}} instanceId={INSTANCE_ID} />);
    });
    await flush();

    expect(fetchMock).toHaveBeenCalledWith("/api/me/gift-certificates/friends/eligible", {
      credentials: "include",
      cache: "no-store",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/me/gift-certificates/instances/${INSTANCE_ID}`,
      expect.objectContaining({ credentials: "include", cache: "no-store" })
    );
    expect(container.querySelector(`[data-wallet-gift-friend="${FRIEND_C}"]`)).not.toBeNull();
    expect(container.querySelector("[data-testid='gift-preview']")).not.toBeNull();
  });

  it("T5 routes selected friend into the same Gift Offer Flow", async () => {
    mockFetchRoutes(fetchMock);

    act(() => {
      root.render(<WalletGiftFriendPicker open onClose={() => {}} instanceId={INSTANCE_ID} />);
    });
    await flush();

    await act(async () => {
      container.querySelector<HTMLButtonElement>(`[data-wallet-gift-friend="${FRIEND_C}"]`)?.click();
      await Promise.resolve();
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>("[data-wallet-gift-friend-continue='1']")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/community-messenger/rooms", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomType: "direct", peerUserId: FRIEND_C }),
    });
    expect(pushMock).toHaveBeenCalledWith(
      `/community-messenger/rooms/${ROOM_ID}?giftInstanceId=${INSTANCE_ID}&openGift=1`
    );
  });
});
