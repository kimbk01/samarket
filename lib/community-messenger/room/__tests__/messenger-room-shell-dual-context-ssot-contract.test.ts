import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

/**
 * Messenger room shell dual-context SSOT — source contracts (T1–T12 product rules).
 * Runtime dual-context READY is proven separately on Production after deploy.
 */
describe("messenger room shell dual-context SSOT contract", () => {
  it("LOADING OWNER is AuthSessionBoundary (mypage_comp_loading_ellipsis), not room entry empty", () => {
    const boundary = read("components/auth/AuthSessionBoundary.tsx");
    const entry = read("components/community-messenger/room/CommunityMessengerRoomEntryEmpty.tsx");
    expect(boundary).toContain('t("mypage_comp_loading_ellipsis")');
    expect(boundary).toContain('data-auth-session-boundary="blocked"');
    expect(entry).not.toContain("mypage_comp_loading_ellipsis");
  });

  it("AuthSessionBoundary fail-opens on session-authenticated membership race + messenger room path", () => {
    const boundary = read("components/auth/AuthSessionBoundary.tsx");
    expect(boundary).toContain("shouldBlockPrivateTreeForAuthSession");
    expect(boundary).toContain("isMessengerRoomOrCallPath");
    expect(boundary).toContain("sessionApiAuthenticated");
    const gate = read("lib/auth/auth-session-boundary-gate.ts");
    expect(gate).toContain("shouldFailOpenPrivateTreeWhileMembershipResolves");
    expect(gate).toContain('args.membershipStatus !== "member"');
  });

  it("membership recovery terminal settles checking → guest (no infinite checking)", () => {
    const membership = read("hooks/use-client-membership-state.ts");
    expect(membership).toContain("auth_membership_recovery_terminal");
    expect(membership).toMatch(
      /recoveryTerminal = true[\s\S]*status === "checking"[\s\S]*publish\(\{ status: "guest" \}\)/,
    );
    expect(membership).toMatch(
      /if \(recoveryTerminal\) \{[\s\S]*status === "checking"[\s\S]*publish\(\{ status: "guest" \}\)/,
    );
  });

  it("BootstrapGate fail-closes fetch/incomplete errors (clears bootstrapPending)", () => {
    const gate = read("components/community-messenger/room/CommunityMessengerRoomBootstrapGate.tsx");
    expect(gate).toContain('setEntryError(result.error)');
    expect(gate).toContain("setBootstrapPending(false)");
    expect(gate).toContain("incomplete_timeline_seed");
    expect(gate).toContain("room_identity_mismatch");
  });

  it("room snapshot cache keys by roomId + viewerUserId", () => {
    const cache = read("lib/community-messenger/room-snapshot-cache.ts");
    expect(cache).toMatch(/function cacheKey\(roomId: string, viewerUserId/);
    expect(cache).toContain('|| "_"');
  });

  it("required shell mount does not wait on realtime/presence (BootstrapGate → RoomClient only)", () => {
    const gate = read("components/community-messenger/room/CommunityMessengerRoomBootstrapGate.tsx");
    expect(gate).toContain("canMountCommunityMessengerRoomClient");
    expect(gate).not.toMatch(/presence.*bootstrapPending|bootstrapPending.*presence/i);
    expect(gate).not.toMatch(/realtimeReady|presenceReady/);
  });
});
