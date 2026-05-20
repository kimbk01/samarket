"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import type { MessageKey } from "@/lib/i18n/messages";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";

type Props = {
  titleKey: MessageKey;
  subtitleKey: MessageKey;
  backHref?: string;
  hideCtaStrip?: boolean;
  stickyBelow?: ReactNode;
  section?: "account" | "store" | "trade";
  children: ReactNode;
  bodyClassName?: string;
};

/** 마이페이지 서브 라우트 — 헤더 i18n + 본문 슬롯 */
export function MypageSubpageShell({
  titleKey,
  subtitleKey,
  backHref = "/mypage",
  hideCtaStrip = true,
  stickyBelow,
  section,
  children,
  bodyClassName = APP_MAIN_TAB_SCROLL_BODY_CLASS,
}: Props) {
  const { t, safeT } = useI18n();
  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-sam-app">
      <MySubpageHeader
        title={safeT(titleKey)}
        subtitle={safeT(subtitleKey)}
        backHref={backHref}
        hideCtaStrip={hideCtaStrip}
        stickyBelow={stickyBelow}
        section={section}
      />
      <div className={bodyClassName}>{children}</div>
    </div>
  );
}
