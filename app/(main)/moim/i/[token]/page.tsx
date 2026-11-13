import type { Metadata } from "next";
import { Suspense } from "react";
import { MoimInviteLanding } from "@/components/moim/MoimInviteLanding";
import { InviteLandingGuestCard } from "@/components/share/InviteLandingGuestCard";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { buildLoginPath } from "@/lib/auth/safe-next-path";
import { buildInviteLandingMetadata } from "@/lib/share/invite-landing-metadata.server";
import { loadMoimInviteGuestPreview } from "@/lib/share/invite-landing-preview.server";
import { buildShareUrl } from "@/lib/share/share-url";

type Props = { params: Promise<{ token: string }> };

/** 초대 링크 미리보기 — 최소 정보·검색 제외 (Owner G-7 2026-11-14) */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const preview = await loadMoimInviteGuestPreview(token);
  return buildInviteLandingMetadata(preview, buildShareUrl({ kind: "moim_invite", token }));
}

/**
 * /moim/i/[token] — 로그인 사용자는 기존 화면(MoimInviteLanding → 가입 검사 그대로),
 * 비회원은 최소 정보 카드 + 「로그인하고 참여하기」(로그인 후 이 주소로 복귀). 링크가 가입 권한을 주지 않는다.
 */
export default async function MoimInviteLandingPage({ params }: Props) {
  const { token } = await params;
  const viewerId = await getOptionalAuthenticatedUserId();
  if (!viewerId) {
    const preview = await loadMoimInviteGuestPreview(token);
    return (
      <InviteLandingGuestCard
        kind="moim"
        preview={preview}
        loginHref={buildLoginPath(`/moim/i/${encodeURIComponent(token)}`)}
      />
    );
  }
  return (
    <Suspense fallback={null}>
      <MoimInviteLanding token={token} />
    </Suspense>
  );
}
