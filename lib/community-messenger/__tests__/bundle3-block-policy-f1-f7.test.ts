import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { shouldApplyCommunityDirectSocialBlockGate } from "@/lib/community-messenger/server/community-direct-social-block-gate";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("F-2 shouldApplyCommunityDirectSocialBlockGate", () => {
  it("applies for general_direct and for null domain without commerce evidence", () => {
    expect(
      shouldApplyCommunityDirectSocialBlockGate({
        roomType: "direct",
        chatDomain: "general_direct",
        directKey: "a:b",
        hasProductChatLink: false,
        hasStoreOrderLink: false,
      })
    ).toBe(true);
    expect(
      shouldApplyCommunityDirectSocialBlockGate({
        roomType: "direct",
        chatDomain: null,
        directKey: "a:b",
        hasProductChatLink: false,
        hasStoreOrderLink: false,
      })
    ).toBe(true);
  });

  it("does not treat chat_domain null alone as skip — only skips with commerce evidence", () => {
    expect(
      shouldApplyCommunityDirectSocialBlockGate({
        roomType: "direct",
        chatDomain: null,
        directKey: "a:b",
        hasProductChatLink: true,
        hasStoreOrderLink: false,
      })
    ).toBe(false);
    expect(
      shouldApplyCommunityDirectSocialBlockGate({
        roomType: "direct",
        chatDomain: null,
        directKey: "a:b",
        hasProductChatLink: false,
        hasStoreOrderLink: true,
      })
    ).toBe(false);
  });

  it("skips for trade/store_order chat_domain and commerce direct_key", () => {
    expect(
      shouldApplyCommunityDirectSocialBlockGate({
        roomType: "direct",
        chatDomain: "trade",
        directKey: "a:b",
        hasProductChatLink: false,
        hasStoreOrderLink: false,
      })
    ).toBe(false);
    expect(
      shouldApplyCommunityDirectSocialBlockGate({
        roomType: "direct",
        chatDomain: "store_order",
        directKey: "a:b",
        hasProductChatLink: false,
        hasStoreOrderLink: false,
      })
    ).toBe(false);
    expect(
      shouldApplyCommunityDirectSocialBlockGate({
        roomType: "direct",
        chatDomain: null,
        directKey: "trade_pc:abc",
        hasProductChatLink: false,
        hasStoreOrderLink: false,
      })
    ).toBe(false);
    expect(
      shouldApplyCommunityDirectSocialBlockGate({
        roomType: "direct",
        chatDomain: null,
        directKey: "store_order:oid",
        hasProductChatLink: false,
        hasStoreOrderLink: false,
      })
    ).toBe(false);
  });

  it("does not apply to groups; unclear non-commerce still applies (fail closed)", () => {
    expect(
      shouldApplyCommunityDirectSocialBlockGate({
        roomType: "private_group",
        chatDomain: null,
        directKey: null,
        hasProductChatLink: false,
        hasStoreOrderLink: false,
      })
    ).toBe(false);
    expect(
      shouldApplyCommunityDirectSocialBlockGate({
        roomType: "direct",
        chatDomain: "unknown_legacy",
        directKey: "weird",
        hasProductChatLink: false,
        hasStoreOrderLink: false,
      })
    ).toBe(true);
  });

  it("assertMessengerRoomSendAllowed wires F-2 domainEvidence into block gate", () => {
    const src = read("lib/community-messenger/server/assert-messenger-room-send-allowed.ts");
    expect(src).toContain("shouldApplyCommunityDirectSocialBlockGate");
    expect(src).toContain("chat_domain, direct_key");
    expect(src).toContain("domainEvidence");
    expect(src).toContain("hasProductChatLink");
    expect(src).toContain("hasStoreOrderLink");
  });
});

describe("F-4 hideDirectRoomsOnBlockForViewer — viewer only (source)", () => {
  it("hides and restores viewer participant only", () => {
    const src = read("lib/community-messenger/participant-block-hide.ts");
    const hideStart = src.indexOf("export async function hideDirectRoomsOnBlockForViewer");
    const hideBody = src.slice(hideStart, src.indexOf("export async function restoreDirectRoomsOnUnblockForViewer", hideStart));
    expect(hideBody).toContain("participantUserId: viewer");
    expect(hideBody).not.toContain("[viewer, peer]");
    const restoreStart = src.indexOf("export async function restoreDirectRoomsOnUnblockForViewer");
    const restoreBody = src.slice(restoreStart, src.indexOf("export function participantViewerBlockedHidden", restoreStart));
    expect(restoreBody).toContain("participantUserId: viewer");
    expect(restoreBody).not.toContain("[viewer, peer]");
  });
});

describe("F-1 unblock restore wiring", () => {
  it("me/relations blocked DELETE calls restore after successful unblock", () => {
    const src = read("app/api/me/relations/[type]/route.ts");
    expect(src).toContain("restoreDirectRoomsOnUnblockForViewer");
    const unblockIdx = src.indexOf("unblockUserSocial(auth.userId, target)");
    const restoreIdx = src.indexOf("restoreDirectRoomsOnUnblockForViewer(auth.userId, target)");
    expect(unblockIdx).toBeGreaterThan(-1);
    expect(restoreIdx).toBeGreaterThan(unblockIdx);
  });

  it("chat rooms unblock calls restore after successful unblock", () => {
    const src = read("app/api/chat/rooms/[roomId]/unblock/route.ts");
    expect(src).toContain("restoreDirectRoomsOnUnblockForViewer");
    const unblockIdx = src.indexOf("unblockUserSocial(userId, blockedUserId)");
    const restoreIdx = src.indexOf("restoreDirectRoomsOnUnblockForViewer(userId, blockedUserId)");
    expect(unblockIdx).toBeGreaterThan(-1);
    expect(restoreIdx).toBeGreaterThan(unblockIdx);
  });

  it("existing CM and community unblock paths keep restore", () => {
    expect(read("app/api/community-messenger/relations/block/route.ts")).toContain(
      "restoreDirectRoomsOnUnblockForViewer"
    );
    expect(read("app/api/community/block-relations/route.ts")).toContain(
      "restoreDirectRoomsOnUnblockForViewer"
    );
  });
});

describe("F-3 blockUserSocial favorites owner→target only", () => {
  it("does not bilateral-delete favorites", () => {
    const src = read("lib/community-messenger/social-relations.ts");
    const start = src.indexOf("export async function blockUserSocial");
    const body = src.slice(start, src.indexOf("export async function unblockUserSocial", start));
    expect(body).toContain('.eq("user_id", owner)');
    expect(body).toContain('.eq("target_user_id", target)');
    expect(body).not.toMatch(/\.or\(`and\(user_id\.eq\.\$\{owner\}/);
    expect(body).not.toContain("target_user_id.eq.${owner}");
  });
});

describe("F-7 home block confirm", () => {
  it("CommunityMessengerHome uses MessengerBlockPeerConfirmModal and requestBlockWithConfirm", () => {
    const src = read("components/community-messenger/CommunityMessengerHome.tsx");
    expect(src).toContain("MessengerBlockPeerConfirmModal");
    expect(src).toContain("requestBlockWithConfirm");
    expect(src).toContain('requestBlockWithConfirm(friendProfileForSheet.id, { blockSource: "profile" })');
    expect(src).toContain('requestBlockWithConfirm(pid, { blockSource: "chat_room" })');
    expect(src).not.toMatch(/onBlock=\{friendProfileForSheet\.id !== data\?\.me\?\.id \? \(\) => void toggleBlock\(/);
  });
});
