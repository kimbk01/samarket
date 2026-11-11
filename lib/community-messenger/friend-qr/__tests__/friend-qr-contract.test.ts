import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildFriendQrDeepLink,
  buildFriendQrHomePath,
  buildFriendQrUrl,
  friendQrErrorMessageKey,
  parseFriendQrPayload,
} from "@/lib/community-messenger/friend-qr/friend-qr-contract";
import { DIBAY_PRODUCTION_SITE_ORIGIN } from "@/lib/platform/capacitor-server-url";
import { resolveDibayDeepLinkToAppPath } from "@/lib/platform/deep-link-routes";
import { isGuestPublicBrowsePath } from "@/lib/auth/guest-browse-access-policy";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const TOKEN = "Q7mK2pX9vT4rN8wB5hLd3s";

/** 설계안 v3 §3.6 — QR 친구 추가 계약 */
describe("friend QR contract", () => {
  it("QR holds a token address on the production origin, not the member id", () => {
    expect(buildFriendQrUrl(TOKEN)).toBe(`${DIBAY_PRODUCTION_SITE_ORIGIN}/f/${TOKEN}`);
    expect(buildFriendQrDeepLink(TOKEN)).toBe(`dibay://friend/${TOKEN}`);
    expect(buildFriendQrHomePath(TOKEN)).toBe(`/community-messenger?friendQr=${TOKEN}`);
  });

  it("reads production / current-origin addresses and the app link only", () => {
    expect(parseFriendQrPayload(buildFriendQrUrl(TOKEN))).toBe(TOKEN);
    expect(parseFriendQrPayload(`https://preview.example.dev/f/${TOKEN}`, "https://preview.example.dev")).toBe(TOKEN);
    expect(parseFriendQrPayload(`dibay://friend/${TOKEN}`)).toBe(TOKEN);
    expect(parseFriendQrPayload(`https://evil.example.com/f/${TOKEN}`)).toBeNull();
    expect(parseFriendQrPayload(`${DIBAY_PRODUCTION_SITE_ORIGIN}/f/short`)).toBeNull();
    expect(parseFriendQrPayload(`${DIBAY_PRODUCTION_SITE_ORIGIN}/u/${TOKEN}`)).toBeNull();
    expect(parseFriendQrPayload("dibay-pc-login:v1:x:y")).toBeNull();
    expect(parseFriendQrPayload("48213sun")).toBeNull();
  });

  it("failure text is one message, except scanning your own QR", () => {
    expect(friendQrErrorMessageKey("qr_self")).toBe("friend_qr_err_self");
    for (const code of ["qr_invalid", "qr_disabled", "blocked_target", "qr_add_failed", undefined]) {
      expect(friendQrErrorMessageKey(code)).toBe("friend_qr_err_unusable");
    }
  });

  it("dibay://friend/<token> opens the messenger result sheet; other hosts unchanged", () => {
    expect(resolveDibayDeepLinkToAppPath(`dibay://friend/${TOKEN}`)).toBe(`/community-messenger?friendQr=${TOKEN}`);
    expect(resolveDibayDeepLinkToAppPath("dibay://friend/bad")).toBeNull();
    expect(resolveDibayDeepLinkToAppPath("dibay://call/abc")).toBe("/community-messenger/calls/abc");
  });

  it("/f/<token> web page is open before login", () => {
    expect(isGuestPublicBrowsePath(`/f/${TOKEN}`)).toBe(true);
  });

  it("screens: friend add QR tab, result sheet in messenger home, scanner shared with PC login", () => {
    const sheet = read("components/community-messenger/MessengerFriendAddSheet.tsx");
    expect(sheet).toContain("<FriendQrTabPanel onToken={onFriendQrToken} />");
    expect(sheet).not.toContain("inviteUrl");
    const home = read("components/community-messenger/CommunityMessengerHome.tsx");
    expect(home).toContain("<FriendQrResultHost");
    expect(home).toContain("useFriendQrResultStore.getState().open(token)");
    expect(read("components/my/settings/PcLoginScanContent.tsx")).toContain("useQrCameraScanner(");
    expect(read("components/community-messenger/friend-qr/FriendQrScanPanel.tsx")).toContain("useQrCameraScanner(");
    expect(read("components/community-messenger/friend-qr/FriendQrScanPanel.tsx")).toContain("decodeQrFromImageFile");
  });

  it("server uses the DB functions only and notifies with the existing friend_accepted kind", () => {
    const server = read("lib/community-messenger/friend-qr/friend-qr.server.ts");
    for (const fn of ["member_friend_qr_ensure", "member_friend_qr_regenerate", "member_friend_qr_resolve", "cm_add_friend_via_qr"]) {
      expect(server).toContain(`"${fn}"`);
    }
    const notify = read("lib/notifications/community-messenger-friend-inapp-notify.ts");
    const fn = notify.slice(notify.indexOf("export async function notifyCommunityMessengerFriendAddedViaQr"));
    expect(fn).toContain('meta: { kind: "friend_accepted", via: "qr"');
  });
});

describe("my QR panel — failed QR image (PR #145 review)", () => {
  it("shows the error view when the QR image fails even after the token loaded, and buttons need the image", () => {
    const src = read("components/community-messenger/friend-qr/MyFriendQrPanel.tsx");
    expect(src).toContain("if (loadFailed && !qrImage) {");
    expect(src).not.toContain("if (loadFailed && !qr) {");
    expect(src.match(/disabled=\{!qr \|\| !qrImage \|\| busy !== null\}/g)).toHaveLength(3);
  });
});

describe("PR #149 review — friend source", () => {
  it("picks the latest accepted row, qr on a tie (QR add accepts both rows at once)", async () => {
    const { pickFriendSource } = await import("@/lib/community-messenger/friend-qr/friend-qr-contract");
    const t = "2026-11-11T14:00:00Z";
    expect(pickFriendSource([{ source: "id_search", responded_at: t }, { source: "qr", responded_at: t }])).toBe("qr");
    expect(pickFriendSource([{ source: "qr", responded_at: t }, { source: "id_search", responded_at: "2026-11-12T00:00:00Z" }])).toBe("id_search");
    expect(pickFriendSource([{ source: null, responded_at: null }])).toBeNull();
    expect(pickFriendSource([])).toBeNull();
  });

  it("shared home add action carries the caller's source (contacts · profile sheet)", () => {
    const home = read("components/community-messenger/CommunityMessengerHome.tsx");
    expect(home).toContain("onSend: (userId, source) => addFriendSaved(userId, source),");
    expect(home).toContain('addFriendSaved(friendProfileForSheet.id, "profile")');
    expect(read("components/community-messenger/contacts/use-contacts-friend-cta.ts")).toContain('home.onSend(m.user_id, "contacts")');
  });
});
