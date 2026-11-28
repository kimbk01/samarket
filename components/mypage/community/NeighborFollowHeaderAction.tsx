"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { NEIGHBOR_FOLLOW_MANAGE_HREF, NEIGHBOR_FOLLOW_MYPAGE_HREF } from "@/lib/community/neighbor-follow-contract";
import { runFixedDestinationBack } from "@/lib/navigation/fixed-destination-back";

/** 본문이 알려 주는 관심이웃 수 — 0명·불러오는 중에는 [관리]를 숨긴다(시안 ④ 빈 화면에 없음) */
let peopleCount: number | null = null;
const listeners = new Set<() => void>();

export function setNeighborFollowHeaderCount(n: number | null): void {
  if (peopleCount === n) return;
  peopleCount = n;
  for (const fn of listeners) fn();
}

/**
 * 내정보 › 관심이웃 머리줄 오른쪽 (시안 ②③).
 * - 보기 화면: [관리] → 관리 화면(자기 경로 `NEIGHBOR_FOLLOW_MANAGE_HREF`)으로 이동(기록 추가).
 * - 관리 화면: [완료] → 관심이웃 화면. 직전 기록이 관심이웃이면 뒤로, 아니면(직접 진입) 교체 — 기록이 겹치지 않게.
 * 화면 본문(`NeighborFollowScreen`)과 파일을 나눠 머리줄이 글 카드 묶음을 불러오지 않게 한다.
 */
export function NeighborFollowHeaderAction({ mode }: { mode: "view" | "manage" }) {
  const { t } = useI18n();
  const router = useRouter();
  const count = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => peopleCount,
    () => null,
  );
  if (mode === "manage") {
    return (
      <button
        type="button"
        data-testid="neighbor-follow-manage-done"
        className="px-2 py-1 sam-text-body font-semibold text-sam-primary"
        onClick={() => runFixedDestinationBack(router, NEIGHBOR_FOLLOW_MYPAGE_HREF)}
      >
        {t("common_done")}
      </button>
    );
  }
  if (!count) return null;
  return (
    <Link
      href={NEIGHBOR_FOLLOW_MANAGE_HREF}
      data-testid="neighbor-follow-manage-toggle"
      className="px-2 py-1 sam-text-body font-semibold text-sam-primary"
    >
      {t("mypage_neighbor_manage")}
    </Link>
  );
}
