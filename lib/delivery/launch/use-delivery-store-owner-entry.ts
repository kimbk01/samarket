"use client";

import { useEffect, useState } from "react";
import { resolveMypageHomeStoreOwnerEntry, type MypageHomeStoreOwnerEntry } from "@/lib/mypage/mypage-home-menu-config";
import { getOwnerStoreGateState, type OwnerStoreGateState } from "@/lib/stores/store-admin-access";
import { fetchMeStoresListDeduped, parseStoreRowsFromMeStoresJson } from "@/lib/me/fetch-me-stores-deduped";
import { resolveOwnerActiveStoreIdFromOwnedList } from "@/lib/delivery/owner/resolve-owner-active-store";
import { useHubDataRevisitGate } from "@/lib/http/hub-data-freshness";

/**
 * 배달 모집 배너 주 버튼·고객센터 FAB 유형용 — 보는 사람의 매장 상태 (설계 v3.2 §3-3).
 * 판정·문구·경로는 마이페이지 「매장」 진입과 같은 단일 함수 `resolveMypageHomeStoreOwnerEntry` 를 쓴다
 * (같은 사람이 어느 화면에서 보든 같은 안내: 매장 신청 / 매장 승인 진행 사항 + 상태 / 매장 진입).
 * `GET /api/me/stores` 응답으로만 판정 — 401(비로그인) = 매장 없음, 실패·대기 = `null`(버튼 자리만 잡음).
 */
export type DeliveryStoreOwnerEntry = {
  entry: MypageHomeStoreOwnerEntry;
  gate: OwnerStoreGateState;
  /** 매장이 있으면 그 매장 id (고객센터 「매장 승인」 문의에 붙임) */
  storeId: string | null;
};

export function useDeliveryStoreOwnerEntry(enabled: boolean): DeliveryStoreOwnerEntry | null {
  const [value, setValue] = useState<DeliveryStoreOwnerEntry | null>(null);
  /**
   * D1 R3 (Owner 승인 2026-11-12 · `docs/audit/d1-remaining-items-design-2026-11-12.md` §2): 배달 탭 보관 화면이 다시 보일 때
   * 60초 안·같은 세대면 다시 받지 않는다(성공해서 값이 있을 때만 기록). 앱 복귀·계정 전환은 세대·보관대 비우기로 다시 받음.
   */
  const revisitGate = useHubDataRevisitGate();
  useEffect(() => {
    if (!enabled) return;
    if (revisitGate.isFresh("owner-entry")) return;
    let cancelled = false;
    fetchMeStoresListDeduped().then(
      ({ status, json }) => {
        if (cancelled) return;
        let rows = status === 401 ? [] : status >= 200 && status < 300 ? parseStoreRowsFromMeStoresJson(json) : null;
        if (!rows) {
          setValue(null);
          return;
        }
        rows = rows ?? [];
        const gate = getOwnerStoreGateState(
          rows.map((s) => ({
            id: s.id,
            approval_status: String(s.approval_status ?? ""),
            rejected_reason: s.rejected_reason ?? null,
            revision_note: s.revision_note ?? null,
          }))
        );
        const firstId = rows.length ? resolveOwnerActiveStoreIdFromOwnedList(rows, null) : null;
        setValue({ entry: resolveMypageHomeStoreOwnerEntry(gate, firstId), gate, storeId: firstId ?? null });
        revisitGate.markLoaded("owner-entry");
      },
      () => {
        if (!cancelled) setValue(null);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [enabled, revisitGate]);
  return value;
}
