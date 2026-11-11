import { FriendQrWebLanding } from "@/components/community-messenger/friend-qr/FriendQrWebLanding";
import { resolveFriendQrOwner } from "@/lib/community-messenger/friend-qr/friend-qr.server";
import {
  buildFriendQrAndroidIntentUrl,
  buildFriendQrDeepLink,
  buildFriendQrHomePath,
  isFriendQrToken,
} from "@/lib/community-messenger/friend-qr/friend-qr-contract";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { buildLoginPath } from "@/lib/auth/safe-next-path";

export const dynamic = "force-dynamic";

/**
 * 휴대폰 카메라로 친구 QR 을 찍었을 때 열리는 웹 페이지 (설계안 v3 §3.6 · 시안 I).
 * 사진·이름만 보여 주고 [앱에서 열기](dibay://friend/…) · [웹에서 계속](로그인 → 메신저 결과 시트).
 * 앱 링크(https 로 바로 앱 열기)는 4단계 네이티브. Android 「앱에서 열기」는 intent 주소(앱이 없으면 Play 스토어).
 */
export default async function FriendQrWebPage({ params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params;
  const token = String(raw ?? "").trim();
  const res = isFriendQrToken(token) ? await resolveFriendQrOwner(token) : null;
  const viewerId = await getRouteUserId().catch(() => null);
  const homePath = isFriendQrToken(token) ? buildFriendQrHomePath(token) : "/community-messenger";
  return (
    <FriendQrWebLanding
      owner={res && res.ok ? { displayName: res.owner.displayName, avatarUrl: res.owner.avatarUrl } : null}
      appLink={isFriendQrToken(token) ? buildFriendQrDeepLink(token) : null}
      androidAppLink={isFriendQrToken(token) ? buildFriendQrAndroidIntentUrl(token) : null}
      continueHref={viewerId ? homePath : buildLoginPath(homePath)}
    />
  );
}
