// @vitest-environment jsdom
/**
 * Phase 3 room-entry waterfall fix — DomainRoomReadCanaryGate must:
 *  1. Mount `children` immediately, without waiting for the domain-read fetch to resolve.
 *  2. Never remount `children` when the fetch later resolves to "domain" or falls back to
 *     "legacy" — only the context value / data-attributes may change in place.
 *  3. Never expose a `DomainRoomPresentation` (verified identity) through context until the
 *     fetch has actually verified it — before that, context is `null` (same as legacy).
 */
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DomainRoomReadCanaryGate } from "@/components/community-messenger/domain-shell-canary/DomainRoomReadCanaryGate";
import { useDomainRoomPresentation } from "@/components/community-messenger/domain-shell-canary/DomainRoomReadCanaryContext";
import { clearRoomEntryIntent } from "@/lib/community-messenger/room/messenger-room-entry-intent";
import { clearClientBundleKilled } from "@/components/community-messenger/domain-shell-canary/canary-allowlist";

const VIEWER_ID = "11111111-1111-1111-1111-111111111111";
const ROOM_ID = "3932dd99-2a06-402a-8041-e3f27af2fa81";

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: VIEWER_ID } } }) },
  }),
}));

function domainRoomDtoBody() {
  return {
    authority: "domain_room_presentation_canary",
    viewerUserId: VIEWER_ID,
    roomId: ROOM_ID,
    chatDomain: "general_direct",
    domainIdentityKey: `general_direct:${VIEWER_ID}:peer`,
    bundle: "inbox",
    header: { kind: "general_peer", title: "Peer", avatarUrl: null },
  };
}

describe("DomainRoomReadCanaryGate — Phase 3 waterfall fix", () => {
  let container: HTMLDivElement;
  let root: Root;
  let mountCount: number;
  let unmountCount: number;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    root = createRoot(container);
    mountCount = 0;
    unmountCount = 0;
    clearRoomEntryIntent(ROOM_ID);
    clearClientBundleKilled(); // sessionStorage-backed — leaks across tests otherwise
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  /** Stand-in for BootstrapGate/RoomClient — records mount/unmount, reads context each render. */
  function ChildProbe({ onRender }: { onRender: (ctx: ReturnType<typeof useDomainRoomPresentation>) => void }) {
    const presentation = useDomainRoomPresentation();
    // Mount/unmount tracked via effect identity — a remount produces a fresh effect run.
    useEffect(() => {
      mountCount += 1;
      return () => {
        unmountCount += 1;
      };
    }, []);
    onRender(presentation);
    return null;
  }

  function renderGate(roomId: string, onRender: (ctx: ReturnType<typeof useDomainRoomPresentation>) => void) {
    act(() => {
      root.render(
        <DomainRoomReadCanaryGate roomId={roomId}>
          <ChildProbe onRender={onRender} />
        </DomainRoomReadCanaryGate>
      );
    });
  }

  async function flush() {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it("mounts children immediately — before the domain-read fetch resolves (no waterfall block)", () => {
    // fetch never resolves in this test — if children were gated on it, mountCount would stay 0.
    fetchMock.mockReturnValue(new Promise(() => {}));
    let lastCtx: unknown = "unset";
    renderGate(ROOM_ID, (ctx) => {
      lastCtx = ctx;
    });
    expect(mountCount).toBe(1);
    // Context must be null (unverified) at this point, not a guessed/partial identity.
    expect(lastCtx).toBeNull();
  });

  it("does not remount children when the fetch resolves to domain", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => domainRoomDtoBody(),
    });
    let lastCtx: unknown = "unset";
    renderGate(ROOM_ID, (ctx) => {
      lastCtx = ctx;
    });
    expect(mountCount).toBe(1);

    await flush();

    expect(mountCount).toBe(1); // same mount — not remounted
    expect(unmountCount).toBe(0);
    expect(lastCtx).not.toBeNull();
    expect((lastCtx as { chatDomain?: string })?.chatDomain).toBe("general_direct");
  });

  it("does not remount children when the fetch fails and falls back to legacy", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    let lastCtx: unknown = "unset";
    renderGate(ROOM_ID, (ctx) => {
      lastCtx = ctx;
    });
    expect(mountCount).toBe(1);

    await flush();

    expect(mountCount).toBe(1);
    expect(unmountCount).toBe(0);
    expect(lastCtx).toBeNull(); // legacy — no domain presentation exposed
  });

  it("does not remount children when a thrown exception falls back to legacy", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    renderGate(ROOM_ID, () => {});
    expect(mountCount).toBe(1);

    await flush();

    expect(mountCount).toBe(1);
    expect(unmountCount).toBe(0);
  });

  it("viewer mismatch falls back to legacy without remounting or exposing the wrong identity", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ...domainRoomDtoBody(), viewerUserId: "someone-else" }),
    });
    let lastCtx: unknown = "unset";
    renderGate(ROOM_ID, (ctx) => {
      lastCtx = ctx;
    });

    await flush();

    expect(mountCount).toBe(1);
    expect(unmountCount).toBe(0);
    expect(lastCtx).toBeNull();
  });

  it("switching rooms clears the previous room's presentation before the new room resolves (no stale header)", async () => {
    const ROOM_B = "b19e2672-f26f-4a2e-8125-52575da4a62a";
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => domainRoomDtoBody(),
    });
    let lastCtx: unknown = "unset";
    renderGate(ROOM_ID, (ctx) => {
      lastCtx = ctx;
    });
    await flush();
    expect((lastCtx as { roomId?: string })?.roomId).toBe(ROOM_ID);

    // Switch to a different room while the old presentation is still the current context value.
    // The synchronous useLayoutEffect must clear it to null before repainting with stale data.
    fetchMock.mockReturnValue(new Promise(() => {})); // new room's fetch never resolves in this test
    renderGate(ROOM_B, (ctx) => {
      lastCtx = ctx;
    });
    expect(lastCtx).toBeNull(); // old room's header must not linger during the new room's fetch
  });
});
