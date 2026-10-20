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
  const { activeSheet, openSheet } = useMypageProfileSheets();
  const requested = isMypageProfileEditSheetRequest(searchParams);
  const handledRef = useRef(false);

  /** 쿼리가 남아 있는 동안 시트가 열려 있지 않으면 연다 (홈 셸 재마운트로 시트 상태가 사라진 경우 포함). */
  useEffect(() => {
    if (!requested) {
      handledRef.current = false;
      return;
    }
    if (!enabled || handledRef.current) return;
    if (activeSheet !== "profile-edit") openSheet("profile-edit");
  }, [activeSheet, enabled, openSheet, requested]);

  /** 시트가 실제로 열린 뒤에만 쿼리를 지운다 — 지운 다음에 시트가 사라지는 경합 방지. */
  useEffect(() => {
    if (!requested || !enabled || handledRef.current) return;
    if (activeSheet !== "profile-edit") return;
    handledRef.current = true;
    router.replace(MYPAGE_PROFILE_HREF, { scroll: false });
  }, [activeSheet, enabled, requested, router]);

  return null;
}
