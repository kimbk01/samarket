import type { Metadata } from "next";
import { InviteLandingGuestCard } from "@/components/share/InviteLandingGuestCard";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { buildLoginPath } from "@/lib/auth/safe-next-path";
import { buildInviteLandingMetadata } from "@/lib/share/invite-landing-metadata.server";
import { loadGroupInviteGuestPreview } from "@/lib/share/invite-landing-preview.server";
import { resolveShareSiteOrigin } from "@/lib/share/share-url";
import { GroupInviteJoinClient } from "./GroupInviteJoinClient";

type Props = { params: Promise<{ token: string }> };

function groupInvitePath(rawToken: string): string {
  return `/group/${encodeURIComponent(safeDecode(rawToken))}`;
}

function safeDecode(v: string): string {
  try {
    return decodeURIComponent(v ?? "").trim();
  } catch {
    return "";
  }
}

/** 그룹 초대 링크 미리보기 — 최소 정보·검색 제외 (Owner G-7 2026-11-14) */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const preview = await loadGroupInviteGuestPreview(token);
  return buildInviteLandingMetadata(preview, `${resolveShareSiteOrigin()}${groupInvitePath(token)}`);
}

/**
 * /group/[token] — 로그인 사용자는 기존 화면(가입·승인 요청 흐름 그대로),
 * 비회원은 최소 정보 카드 + 「로그인하고 참여하기」(로그인 후 이 주소로 복귀). 링크가 가입 권한을 주지 않는다.
 */
export default async function GroupInviteJoinPage({ params }: Props) {
  const viewerId = await getOptionalAuthenticatedUserId();
  if (!viewerId) {
    const { token } = await params;
    const preview = await loadGroupInviteGuestPreview(token);
    return (
      <InviteLandingGuestCard kind="group" preview={preview} loginHref={buildLoginPath(groupInvitePath(token))} />
    );
  }
  return <GroupInviteJoinClient params={params} />;
}
