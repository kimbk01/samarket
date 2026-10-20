import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { CommunityMyHubClient } from "@/components/community/CommunityMyHubClient";
import { PhilifeMyHubBodySkeleton } from "@/components/community/PhilifeRouteSkeletons";
import { AppTopHeader } from "@/components/app-shell";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";
import { resolveServerInitialLanguage } from "@/lib/i18n/language-preference";
import { translate } from "@/lib/i18n/messages";

/** 스켈레톤 소유자 = 이 Suspense 하나. 로컬 헤더(1단 숨김 화면)는 대체 화면에서도 같은 자리에 그린다. */
export default function PhilifeMyPage() {
  return (
    <Suspense fallback={<PhilifeMyPageFallback />}>
      <PhilifeMyPageBody />
    </Suspense>
  );
}

function PhilifeMyHeader({ lang }: { lang: ReturnType<typeof resolveServerInitialLanguage> }) {
  return (
    <AppTopHeader
      title={translate(lang, "philife_my_title")}
      backButtonProps={{ backHref: "/philife" }}
      shellVariant="flat"
      className="box-border bg-[color:var(--sector-header-bg)] pt-[var(--safe-top)]"
    />
  );
}

function PhilifeMyPageFallback() {
  const lang = resolveServerInitialLanguage({});
  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-sam-app">
      <PhilifeMyHeader lang={lang} />
      <div className={APP_MAIN_TAB_SCROLL_BODY_CLASS}>
        <PhilifeMyHubBodySkeleton />
      </div>
    </div>
  );
}

async function PhilifeMyPageBody() {
  const uid = await getOptionalAuthenticatedUserId();
  if (!uid) notFound();
  const lang = resolveServerInitialLanguage({});

  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-sam-app">
      {/**
       * GV-008: Tier1/`AppStickyHeader` suppressed on `/philife/my`.
       * Safe-top owns on this local AppTopHeader outer sticky (className), not on
       * shared `TradePrimaryAppBarShell` (OwnerLite SAFE_A must stay duplicate-free).
       * Bleed width on the sticky wrapper stays default.
       */}
      <PhilifeMyHeader lang={lang} />
      <div className={APP_MAIN_TAB_SCROLL_BODY_CLASS}>
        <div className="flex min-w-0 flex-col gap-3 pt-2">
          <p className="sam-text-body-secondary">{translate(lang, "philife_my_intro")}</p>
          <CommunityMyHubClient userId={uid} />
          <Link
            href="/philife"
            className="sam-text-body-secondary mt-2 inline-block font-medium text-signature underline underline-offset-2"
          >
            {translate(lang, "philife_my_to_feed")}
          </Link>
        </div>
      </div>
    </div>
  );
}
