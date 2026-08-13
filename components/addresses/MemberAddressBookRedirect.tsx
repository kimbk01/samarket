"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { navigateToMemberAddressBook } from "@/lib/addresses/mypage-addresses-return-to";

/**
 * 탭·임베드 화면에서 주소 관리를 열 때 — 목록/입력 SSOT 페이지로만 보낸다.
 */
export function MemberAddressBookRedirect({
  returnTo,
}: {
  /** 명시 returnTo. 없으면 현재 path */
  returnTo?: string | null;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  useEffect(() => {
    navigateToMemberAddressBook(router, {
      returnTo: returnTo ?? undefined,
      pathname,
      search: sp?.toString() ? `?${sp.toString()}` : "",
      replace: true,
    });
  }, [router, returnTo, pathname, sp]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center sam-text-body-secondary text-sam-muted">
      {t("common_loading")}
    </div>
  );
}
