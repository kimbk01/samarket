import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { CommunityMyHubClient } from "@/components/community/CommunityMyHubClient";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { AppTopHeader } from "@/components/app-shell";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";
import { resolveServerInitialLanguage } from "@/lib/i18n/language-preference";
import { translate } from "@/lib/i18n/messages";

export default function PhilifeMyPage() {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={5} />}>
      <PhilifeMyPageBody />
    </Suspense>
  );
}

async function PhilifeMyPageBody() {
  const uid = await getOptionalAuthenticatedUserId();
  if (!uid) notFound();
  const lang = resolveServerInitialLanguage({});

  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-sam-app">
      <AppTopHeader
        title={translate(lang, "philife_my_title")}
        backButtonProps={{ backHref: "/philife" }}
        shellVariant="flat"
      />
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
