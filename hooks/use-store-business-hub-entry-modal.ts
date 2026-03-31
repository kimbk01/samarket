"use client";

import { createElement, useCallback, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { fetchMeStoresListDeduped } from "@/lib/me/fetch-me-stores-deduped";
import type { OwnerStoreGateState } from "@/lib/stores/store-admin-access";
import { getOwnerStoreGateState } from "@/lib/stores/store-admin-access";
import { StoreBusinessBlockedModal } from "@/components/business/StoreBusinessBlockedModal";

type MeStoreApi = {
  id: string;
  approval_status?: string | null;
  rejected_reason?: string | null;
  revision_note?: string | null;
};

/**
 * `/my/business` 허브 진입 시 심사 중·반려·무신청 등이면 모달로 안내.
 * `fetchMeStoresListDeduped` 캐시를 쓰므로 Mypage 등과 중복 호출 비용이 작음.
 *
 * @param opts.eager `false` — 마운트 시 `/api/me/stores`를 부르지 않음. `refresh()` 후에만 게이트 판별(하단 네비 등 전역 셸용).
 */
export function useStoreBusinessHubEntryModal(
  primaryCloseLabel = "확인",
  opts?: { eager?: boolean }
) {
  const eager = opts?.eager !== false;
  const router = useRouter();
  const [gate, setGate] = useState<OwnerStoreGateState | null>(null);
  const [firstId, setFirstId] = useState<string | null>(null);
  const [loading, setLoading] = useState(eager);
  const [modalOpen, setModalOpen] = useState(false);

  /** @returns true면 심사 중·반려 등으로 `/my/business` 운영 진입을 막고 모달을 띄워야 함 */
  const load = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    try {
      const { status, json: raw } = await fetchMeStoresListDeduped();
      const j = raw as { ok?: boolean; stores?: MeStoreApi[] };
      if (status === 401 || !j?.ok || !Array.isArray(j.stores)) {
        setGate(null);
        setFirstId(null);
        return false;
      }
      const list = j.stores;
      const forGate = list.map((s) => ({
        id: s.id,
        approval_status: String(s.approval_status ?? ""),
        rejected_reason: s.rejected_reason ?? null,
        revision_note: s.revision_note ?? null,
      }));
      const nextGate = getOwnerStoreGateState(forGate);
      const first = list[0]?.id?.trim() ?? null;
      flushSync(() => {
        setGate(nextGate);
        setFirstId(first);
      });
      return nextGate.kind !== "approved";
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!eager) return;
    void load();
  }, [eager, load]);

  /** true = 모달을 띄웠으므로 라우팅하면 안 됨 */
  const openBlockedModalIfNeeded = useCallback(() => {
    if (loading || gate == null) return false;
    if (gate.kind === "approved") return false;
    setModalOpen(true);
    return true;
  }, [loading, gate]);

  /** 승인됐을 때만 이동. 막혔으면 모달. 로딩/알 수 없음이면 일단 이동(가드가 후처리). */
  const goBusinessHubOrModal = useCallback(
    (href: string) => {
      if (openBlockedModalIfNeeded()) return;
      router.push(href);
    },
    [openBlockedModalIfNeeded, router]
  );

  const hubBlockedModal =
    gate && gate.kind !== "approved"
      ? createElement(StoreBusinessBlockedModal, {
          open: modalOpen,
          onClose: () => setModalOpen(false),
          state: gate,
          firstStoreId: firstId ?? undefined,
          primaryCloseLabel,
        })
      : null;

  return {
    loading,
    gate,
    firstStoreId: firstId,
    modalOpen,
    setModalOpen,
    /** 게이트 갱신. 반환값: true면 운영 허브 진입 차단(모달 필요) */
    refresh: load,
    openBlockedModalIfNeeded,
    goBusinessHubOrModal,
    hubBlockedModal,
  };
}
