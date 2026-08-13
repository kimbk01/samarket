"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { navigateToMemberAddressBook } from "@/lib/addresses/mypage-addresses-return-to";

/**
 * 마이페이지 시트에서 주소 요청 시 — 바텀시트 대신 `/mypage/addresses` 페이지 스택.
 */
export function MypageAddressSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    navigateToMemberAddressBook(router, {
      pathname: pathname && !pathname.startsWith("/mypage/addresses") ? pathname : "/mypage",
      replace: false,
    });
    onClose();
  }, [open, onClose, router, pathname]);

  return null;
}
