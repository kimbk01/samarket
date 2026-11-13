import "server-only";

/**
 * 초대 랜딩 링크 미리보기(OG) — 최소 정보만, 검색 제외 (Owner G-7 2026-11-14 · 설계 §D-6).
 * 초대 주소는 검색 엔진에 올리지 않는다(noindex). 무효 초대는 앱 기본값만.
 */
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { APP_LANGUAGE_COOKIE } from "@/lib/i18n/config";
import { resolveServerInitialLanguage } from "@/lib/i18n/language-preference";
import { safeTranslate } from "@/lib/i18n/safe-translate";
import type { InviteLandingPreview } from "@/lib/share/invite-landing-preview.server";
import { inviteMembersKey } from "@/lib/share/invite-members-key";

const NOINDEX = { index: false, follow: false } as const;

export async function buildInviteLandingMetadata(
  preview: InviteLandingPreview | null,
  canonicalUrl: string | null
): Promise<Metadata> {
  if (!preview || !canonicalUrl) return { robots: NOINDEX };
  const [h, cookieStore] = await Promise.all([headers(), cookies()]);
  const lang = resolveServerInitialLanguage({
    cookieValue: cookieStore.get(APP_LANGUAGE_COOKIE)?.value,
    acceptLanguage: h.get("accept-language"),
  });
  const description = safeTranslate(lang, inviteMembersKey(preview.memberCount), {
    vars: { count: preview.memberCount },
  });
  const images = preview.imageUrl ? [preview.imageUrl] : undefined;
  return {
    title: preview.title,
    description,
    robots: NOINDEX,
    openGraph: {
      type: "website",
      title: preview.title,
      description,
      url: canonicalUrl,
      ...(images ? { images } : {}),
    },
    twitter: {
      card: images ? "summary_large_image" : "summary",
      title: preview.title,
      description,
      ...(images ? { images } : {}),
    },
  };
}
