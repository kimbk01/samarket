"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  MYPAGE_PROFILE_HREF,
  isMypageProfileEditSheetRequest,
} from "@/lib/mypage/mypage-profile-routes";
import { useMypageProfileSheets } from "./mypage-profile-sheets-context";

/**
 * `/mypage?edit=profile` — 홈 위 프로필 수정 시트를 1회 연다 (X1·S01).
 * 열린 뒤 `router.replace("/mypage")` 로 쿼리를 지워 새로고침·뒤로가기에서 시트가 다시 열리지 않게 한다.
 * 쿼리만 바뀌므로 화면 전환 애니메이션은 재생되지 않는다(pathname 동일 → kind none).
 */
export function MypageProfileEditQueryOpener({ enabled = true }: { enabled?: boolean }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { openSheet } = useMypageProfileSheets();
  const requested = isMypageProfileEditSheetRequest(searchParams);
  const handledRef = useRef(false);

  useEffect(() => {
    if (!requested) {
      handledRef.current = false;
      return;
    }
    if (!enabled || handledRef.current) return;
    handledRef.current = true;
    openSheet("profile-edit");
    router.replace(MYPAGE_PROFILE_HREF, { scroll: false });
  }, [enabled, openSheet, requested, router]);

  return null;
}
