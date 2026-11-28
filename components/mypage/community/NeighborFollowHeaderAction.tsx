"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { NEIGHBOR_FOLLOW_MYPAGE_HREF } from "@/lib/community/neighbor-follow-contract";

/**
 * 내정보 › 관심이웃 머리줄 오른쪽 [관리] ↔ [완료] (시안 ②③). 관리 모드 = `?manage=1`, 주소를 바꾸지 않고 교체(replace).
 * 화면 본문(`NeighborFollowScreen`)과 파일을 나눠 머리줄이 글 카드 묶음을 불러오지 않게 한다.
 */
/** 본문이 알려 주는 관심이웃 수 — 0명·불러오는 중에는 [관리]를 숨긴다(시안 ④ 빈 화면에 없음) */
let peopleCount: number | null = null;
const listeners = new Set<() => void>();

export function setNeighborFollowHeaderCount(n: number | null): void {
  if (peopleCount === n) return;
  peopleCount = n;
  for (const fn of listeners) fn();
}

export function NeighborFollowHeaderAction() {
  const { t } = useI18n();
  const manage = useSearchParams().get("manage") === "1";
  const count = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => peopleCount,
    () => null,
  );
  if (!count) return null;
  return (
    <Link
      href={manage ? NEIGHBOR_FOLLOW_MYPAGE_HREF : `${NEIGHBOR_FOLLOW_MYPAGE_HREF}?manage=1`}
      replace
      data-testid="neighbor-follow-manage-toggle"
      className="px-2 py-1 sam-text-body font-semibold text-sam-primary"
    >
      {manage ? t("common_done") : t("mypage_neighbor_manage")}
    </Link>
  );
}
