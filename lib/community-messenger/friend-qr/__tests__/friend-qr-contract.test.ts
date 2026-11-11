import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildFriendQrAndroidIntentUrl,
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

  it("screens: QR 코드 시트 진입(친구 탭 검색 줄·마이페이지), result sheet in messenger home, scanner shared with PC login", () => {
    /** 시안 3판: 친구 탭 QR 진입 = 검색 줄 아이콘 하나, 내 프로필 줄에는 두지 않는다 */
    const actions = read("components/community-messenger/friend-cta/MessengerFriendsHeaderActions.tsx");
    expect(actions).toContain("<MyFriendQrSheet");
    expect(actions).toContain('data-testid="cm-friend-qr-entry"');
    expect(read("components/community-messenger/MessengerFriendsMyProfileStrip.tsx")).not.toContain("MyFriendQrSheet");
    expect(read("components/mypage/profile/MypageSelfProfileView.tsx")).toContain("<MyFriendQrSheet");
    const sheet = read("components/community-messenger/friend-qr/MyFriendQrSheet.tsx");
    expect(sheet).toContain("<FriendQrTabPanel onToken={onToken} />");
    expect(sheet).toContain("useFriendQrResultStore.getState().open(token)");
    expect(sheet).toContain("buildFriendQrHomePath(token)");
    expect(existsSync(join(process.cwd(), "components/community-messenger/MessengerFriendAddSheet.tsx"))).toBe(false);
    const home = read("components/community-messenger/CommunityMessengerHome.tsx");
    expect(home).toContain("<FriendQrResultHost");
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
    /** 실패는 QR 칸 안 문구 — 카드·버튼 배치는 그대로 (근본 재감사 G1) */
    expect(src).toContain("const failed = loadFailed && !qrImage;");
    expect(src).toContain('{t("friend_qr_load_failed")}');
    /** 공유·다시 만들기는 QR 그림이 있어야(ready), 저장은 미리 만든 카드가 있어야, 셋 다 QR 허용이 켜져 있어야 누를 수 있다 */
    expect(src).toContain('disabled={!ready || !allowed || native === null || (native === false && card.status === "pending") || busy !== null}');
    expect(src).toContain("disabled={!cardBlob || !allowed || busy !== null}");
    expect(src).toContain("disabled={!ready || !allowed || busy !== null}");
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
    /** 검색 결과에서 연 프로필 시트는 id_search, 그 밖은 profile (재감사 §2 ①-b) */
    expect(home).toContain('addFriendSaved(friendProfileForSheet.id, friendSheet.friendAddSource ?? "profile")');
    expect(home).toContain('friendAddSource: "id_search",');
    expect(read("components/community-messenger/contacts/use-contacts-friend-cta.ts")).toContain('home.onSend(m.user_id, "contacts")');
  });
});

describe("QR 친구 재감사 수정 (2026-11-12)", () => {
  it("Q1·Q2: 앱에서는 이미지 저장을 숨기고(허위 성공 금지), 공유·저장 취소는 문구 없이 끝낸다", () => {
    const panel = read("components/community-messenger/friend-qr/MyFriendQrPanel.tsx");
    expect(panel).not.toContain("shareOrSaveReceiptImage");
    expect(panel).toContain("{canSave ? (");
    const client = read("lib/community-messenger/friend-qr/friend-qr-client.ts");
    expect(client).toContain('if (isCancelMessage(err)) return "cancelled";');
    /** PR #154 리뷰: 공유는 누른 동작 안에서 바로 — 카드 PNG 는 미리 만들어 두고 공유 직전에 기다리지 않는다 */
    expect(panel).toContain("const canSave = native === false;");
    expect(panel).toContain("image: cardBlob });");
    /** PR #154 리뷰 2: 카드 만드는 중에는 브라우저 공유를 막는다 · 앱 판별은 공용 bridge 판별 */
    expect(panel).toContain('(native === false && card.status === "pending")');
    expect(client).toContain("return isCapacitorNativePlatform();");
    expect(client).not.toContain('import("@capacitor/core")');
    expect(panel).not.toContain("await renderCard");
    const shareFn = client.slice(client.indexOf("export async function shareFriendQr"), client.indexOf("/** 브라우저 내려받기"));
    const webPart = shareFn.slice(shareFn.indexOf("const nav ="));
    expect(webPart.indexOf("await nav.share(data)")).toBeGreaterThan(-1);
    expect(webPart.slice(0, webPart.indexOf("await nav.share(data)"))).not.toContain("await ");
  });

  it("Q3: 미완료·429 는 이유별 처리, 그 밖만 쓸 수 없는 QR", () => {
    const host = read("components/community-messenger/friend-qr/FriendQrResultHost.tsx");
    expect(host).toContain("handleProfileIncompleteApiResponse(j, { returnTo }).handled ||");
    expect(host).toContain("redirectForBlockedAction(router, j.error ?? j.code, returnTo)");
    /** PR #154 리뷰: 안내를 마치면 같은 QR 결과 시트로 돌아온다 */
    expect(host).toContain("const returnTo = buildFriendQrHomePath(failedToken);");
    expect(host).toContain('status === 429 ? "common_try_again_later" : friendQrErrorMessageKey(j.error)');
  });

  it("Q6: 웹 /f — 앱 안이면 랜딩 생략, Android 는 intent 주소(앱이 없으면 Chrome 이 Play 스토어로, 타이머 없음)", () => {
    const landing = read("components/community-messenger/friend-qr/FriendQrWebLanding.tsx");
    expect(landing).toContain("router.replace(continueHref)");
    expect(landing).not.toContain("setTimeout");
    expect(landing).toContain("if (!isCapacitorNativePlatform()) return;");
    expect(buildFriendQrAndroidIntentUrl("AbCdEfGhIjKlMnOpQrStUv")).toBe(
      "intent://friend/AbCdEfGhIjKlMnOpQrStUv#Intent;scheme=dibay;package=com.dibay.app;S.browser_fallback_url=" +
        encodeURIComponent("https://play.google.com/store/apps/details?id=com.dibay.app") +
        ";end",
    );
    expect(read("app/(main)/f/[token]/page.tsx")).toContain("androidAppLink={");
  });

  it("Q7·Q8: 스캐너는 화면이 숨으면 카메라를 끄고, 가운데 정사각형을 640 이하로 해독", () => {
    const scanner = read("lib/qr/use-qr-camera-scanner.ts");
    expect(scanner).toContain('document.addEventListener("visibilitychange", onChange)');
    expect(scanner).toContain("const active = opts.active && visible && !accepted;");
    expect(scanner).toContain("const DECODE_MAX_SIDE = 640;");
  });

  it("Q9: QR 다시 만들기는 공용 함수 하나", () => {
    expect(read("components/community-messenger/friend-qr/MyFriendQrPanel.tsx")).toContain("requestFriendQrRegenerate()");
    expect(read("components/my/settings/MemberDiscoverySettingsSection.tsx")).toContain("requestFriendQrRegenerate()");
  });

  it("Q11: 저장 카드 이름은 말줄임 없이 고르게 두 줄", async () => {
    const { splitFriendQrCardName } = await import("@/lib/community-messenger/friend-qr/friend-qr-image");
    const measure = (t: string) => Array.from(t).length * 40;
    expect(splitFriendQrCardName("짧은이름", measure, 640)).toEqual(["짧은이름"]);
    const lines = splitFriendQrCardName("필리핀마닐라에서일하는김디바이선생님", measure, 640);
    expect(lines).toHaveLength(2);
    expect(lines.join("")).toBe("필리핀마닐라에서일하는김디바이선생님");
    expect(Math.abs(Array.from(lines[0]).length - Array.from(lines[1]).length)).toBeLessThanOrEqual(1);
  });

  it("D-A2: 친구 요청은 경로를 반드시 넘긴다 (기본값 없음)", () => {
    const client = read("lib/community-messenger/community-messenger-friend-request-client.ts");
    expect(client).toContain('source: "id_search" | "contacts" | "profile"');
    expect(client).not.toContain('source?: "id_search"');
  });
});

describe("Owner 실기 2026-11-12 — 카메라 켜기 전 화면·시트 움직임·작은 화면 하단 잘림", () => {
  it("카메라 첫 화면 전: 투명 포스터(WebView 회색 ▶ 제거) + 영상 숨김 + 「카메라를 켜는 중이에요」", () => {
    const hook = read("lib/qr/use-qr-camera-scanner.ts");
    expect(hook).toContain('export const QR_SCANNER_BLANK_POSTER = "data:image/gif;base64,');
    expect(hook).toContain("return { videoRef, canvasRef, stop, videoReady };");
    for (const f of ["components/community-messenger/friend-qr/FriendQrScanPanel.tsx", "components/my/settings/PcLoginScanContent.tsx"]) {
      const src = read(f);
      expect(src).toContain("poster={QR_SCANNER_BLANK_POSTER}");
      expect(src).toContain('${videoReady ? "opacity-100" : "opacity-0"}');
    }
    expect(read("components/community-messenger/friend-qr/FriendQrScanPanel.tsx")).toContain('t("friend_qr_camera_starting")');
  });

  it("메신저 하단 시트는 아래→위로 올라온다 (공용 오버레이와 같은 값, rAF 두 번)", () => {
    const shell = read("components/community-messenger/MessengerSheetUi.tsx");
    expect(shell).toContain("raf2 = requestAnimationFrame(() => setEntered(true));");
    expect(shell).toContain('entered ? "messenger-home-bottom-sheet-panel--entered" : "messenger-home-bottom-sheet-panel--entering"');
    const css = read("app/messenger-home-bottom-sheet.css");
    expect(css).toContain(".messenger-home-bottom-sheet-panel.messenger-home-bottom-sheet-panel--entering {\n  transform: translate3d(0, 100%, 0);");
    expect(css).toContain("transition: transform 300ms cubic-bezier(0.22, 0.9, 0.32, 1);");
    expect(read("app/dibay-overlay.css")).toContain("transition: transform 300ms cubic-bezier(0.22, 0.9, 0.32, 1);");
  });

  it("근본 재감사 G1: 고정 높이 시트 + QR·카메라 칸만 남은 공간 — 숫자 계산 없음", () => {
    const sheet = read("components/community-messenger/friend-qr/MyFriendQrSheet.tsx");
    expect(sheet).toContain('const FRIEND_QR_SHEET_HEIGHT = "min(88dvh, 40rem)";');
    expect(sheet).toContain('anchor="device-bottom"');
    expect(sheet).toContain("deviceHeight={FRIEND_QR_SHEET_HEIGHT}");
    const panel = read("components/community-messenger/friend-qr/MyFriendQrPanel.tsx");
    expect(panel).toContain('className="flex min-h-[120px] w-full flex-1 items-center justify-center"');
    expect(panel).toContain('className="relative aspect-square h-full max-h-[200px]"');
    expect(panel).not.toContain("88dvh");
    const scan = read("components/community-messenger/friend-qr/FriendQrScanPanel.tsx");
    expect(scan).toContain('className="flex min-h-[200px] flex-1 items-center justify-center"');
    expect(scan).toContain("aspect-square h-full max-h-[300px]");
    expect(scan).not.toContain("88dvh");
    /** 알림은 안내 줄 자리에 바꿔 보인다 — 줄이 늘어 시트가 넘치지 않게 */
    expect(scan).toContain(") : !cameraDenied ? (");
  });
});

describe("근본 재감사 G2~G6 (2026-11-12)", () => {
  it("G2: 내 QR 카드 내용은 /friend-qr/me 한 번 — 따로 프로필을 불러오지 않는다, 불러오는 동안 같은 크기 자리표시", () => {
    const panel = read("components/community-messenger/friend-qr/MyFriendQrPanel.tsx");
    expect(panel).not.toContain("getMyProfile");
    expect(panel).toContain('lineSkeleton("w-28")');
    const route = read("app/api/community-messenger/friend-qr/me/route.ts");
    expect(route).toContain("owner: res.card.owner, qrAddAllowed: res.card.qrAddAllowed");
    const server = read("lib/community-messenger/friend-qr/friend-qr.server.ts");
    expect(server).toContain("displayName: text(row.nickname) || text(row.display_name),");
    expect(server).toContain("qrAddAllowed: settings?.allow_qr_add !== false,");
  });

  it("G3: QR 친구 추가를 끄면 QR 대신 안내 + 설정 링크", () => {
    const panel = read("components/community-messenger/friend-qr/MyFriendQrPanel.tsx");
    expect(panel).toContain('{t("friend_qr_add_off")}');
    expect(panel).toContain("href={FRIEND_QR_SETTINGS_HREF}");
  });

  it("G4: 결과 시트는 프로필 칸·버튼 칸 높이 고정 + 같은 모양 자리표시", () => {
    const host = read("components/community-messenger/friend-qr/FriendQrResultHost.tsx");
    expect(host).toContain('data-testid="friend-qr-result-profile"');
    expect(host).toContain('className="min-h-12" data-testid="friend-qr-result-actions"');
    expect(host).not.toContain('{t("common_loading")}\n');
  });

  it("G5: 셸 하단 시트 열림 속도 하나(300ms)", () => {
    const css = read("app/messenger-home-bottom-sheet.css");
    expect(css).not.toContain("transition: transform 360ms");
  });

  it("G6: 카메라 첫 화면 = requestVideoFrameCallback (없으면 이벤트)", () => {
    expect(read("lib/qr/use-qr-camera-scanner.ts")).toContain("requestVideoFrameCallback");
  });
});

