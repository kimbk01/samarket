"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

/** 비로그인 — 내정보 하위 URL 직접 진입 시 허브(`/mypage`)로 통일 */
export function MypageGuestSubrouteRedirect() {
  const router = useRouter();
  const { t } = useI18n();
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (redirectedRef.current) return;
    redirectedRef.current = true;
    router.replace("/mypage");
  }, [router]);

  return (
    <div className="py-10 text-center sam-text-body text-sam-muted">{t("mypage_comp_loading_ellipsis")}</div>
  );
}
