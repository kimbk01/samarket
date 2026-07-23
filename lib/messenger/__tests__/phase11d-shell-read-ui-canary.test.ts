/**
 * Step 2 — Shell Read UI Canary unit tests.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  PHASE11D_SHELL_READ_UI_ATOMIC_READ,
  PHASE11D_SHELL_READ_UI_BADGE_WIRING,
  PHASE11D_SHELL_READ_UI_CACHE_WRITE,
  PHASE11D_SHELL_READ_UI_LEGACY_DELETE,
  PHASE11D_SHELL_READ_UI_NOTIFICATION,
  PHASE11D_SHELL_READ_UI_REALTIME,
  assertPhase11dShellReadUiWritersOff,
  killPhase11dShellReadUiCanary,
  resetPhase11dShellReadUiCanaryKillForTests,
  resolvePhase11dShellReadUiAccess,
  validatePhase11dShellHomeDto,
  type Phase11dShellHomeDto,
} from "@/lib/messenger/contracts/phase11d-shell-read-ui-canary";

const VIEWER = "35dd245c-d398-4ea3-93a0-c0eda37cc777";

function baseDto(over: Partial<Phase11dShellHomeDto> = {}): Phase11dShellHomeDto {
  return {
    authority: "domain_shell_read_ui_canary",
    viewerUserId: VIEWER,
    producedAt: new Date().toISOString(),
    inbox: [
      {
        domain: "general_direct",
        roomId: "r1",
        domainIdentityKey: "general_direct:a:b",
        title: "A",
        avatarUrl: null,
        previewText: "hi",
        lastMessageAt: "2026-07-14T00:00:00.000Z",
        unreadCount: 0,
        href: "/x",
      },
    ],
    tradeHub: {
      domain: "trade",
      roomCount: 1,
      unreadRoomCount: 0,
      latestRoomId: "t1",
      latestActivityAt: "2026-07-14T00:00:00.000Z",
      previewText: "p",
      href: "/community-messenger/trade-chats",
    },
    storeOrderHub: {
      domain: "store_order",
      roomCount: 1,
      unreadRoomCount: 0,
      latestRoomId: "s1",
      latestActivityAt: "2026-07-14T00:00:00.000Z",
      previewText: "p",
      href: "/community-messenger/delivery-chats",
      exposesMemberIdentity: false,
    },
    counts: { generalDirect: 1, group: 0 },
    writers: {
      cache: true,
      realtime: true,
      badge: true,
      notification: true,
      atomic: true,
    },
    badge: {
      messenger: 0,
      trade: 0,
      storeOrder: 0,
      authority: "domain_badge",
    },
    ...over,
  };
}

afterEach(() => {
  resetPhase11dShellReadUiCanaryKillForTests();
});

describe("Step 2 Shell Read UI Canary gate", () => {
  it("Domain Authority writers CONNECTED; legacy delete OFF", () => {
    expect(PHASE11D_SHELL_READ_UI_CACHE_WRITE).toBe(true);
    expect(PHASE11D_SHELL_READ_UI_REALTIME).toBe(true);
    expect(PHASE11D_SHELL_READ_UI_BADGE_WIRING).toBe(true);
    expect(PHASE11D_SHELL_READ_UI_NOTIFICATION).toBe(true);
    expect(PHASE11D_SHELL_READ_UI_ATOMIC_READ).toBe(true);
    expect(PHASE11D_SHELL_READ_UI_LEGACY_DELETE).toBe(false);
    assertPhase11dShellReadUiWritersOff();
  });

  it("allowlist / anonymous / kill", () => {
    expect(resolvePhase11dShellReadUiAccess({ authenticatedUserId: null }).ok).toBe(false);
    // ALL_USER Domain Authority → any authenticated viewer is eligible for Domain Shell Home
    expect(
      resolvePhase11dShellReadUiAccess({
        authenticatedUserId: "00000000-0000-4000-8000-000000000099",
      }).ok
    ).toBe(true);
    expect(resolvePhase11dShellReadUiAccess({ authenticatedUserId: VIEWER }).ok).toBe(true);
    killPhase11dShellReadUiCanary("test");
    expect(resolvePhase11dShellReadUiAccess({ authenticatedUserId: VIEWER }).ok).toBe(false);
  });

  it("rollback on contamination / disappear", () => {
    const ok = validatePhase11dShellHomeDto(baseDto(), null);
    expect(ok.ok).toBe(true);

    const contaminated = baseDto({
      inbox: [
        {
          domain: "trade" as unknown as "general_direct",
          roomId: "bad",
          domainIdentityKey: "x",
          title: "t",
          avatarUrl: null,
          previewText: "p",
          lastMessageAt: "2026-07-14T00:00:00.000Z",
          unreadCount: 0,
          href: "/x",
        },
      ],
      counts: { generalDirect: 1, group: 0 },
    });
    const c = validatePhase11dShellHomeDto(contaminated, null);
    expect(c.ok).toBe(false);

    const prev = baseDto();
    const emptyGd = baseDto({
      inbox: [],
      counts: { generalDirect: 0, group: 0 },
    });
    const d = validatePhase11dShellHomeDto(emptyGd, prev);
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.trigger).toBe("general_rows_disappeared");
  });
});
