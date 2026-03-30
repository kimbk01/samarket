"use client";

import { createElement, useCallback, useEffect, useState } from "react";
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
 */
export function useStoreBusinessHubEntryModal(primaryCloseLabel = "확인") {
  const router = useRouter();
  const [gate, setGate] = useState<OwnerStoreGateState | null>(null);
  const [firstId, setFirstId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { status, json: raw } = await fetchMeStoresListDeduped();
      const j = raw as { ok?: boolean; stores?: MeStoreApi[] };
      if (status === 401 || !j?.ok || !Array.isArray(j.stores)) {
        setGate(null);
        setFirstId(null);
        return;
      }
      const list = j.stores;
      const forGate = list.map((s) => ({
        id: s.id,
        approval_status: String(s.approval_status ?? ""),
        rejected_reason: s.rejected_reason ?? null,
        revision_note: s.revision_note ?? null,
      }));
      setGate(getOwnerStoreGateState(forGate));
      setFirstId(list[0]?.id?.trim() ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
    refresh: load,
    openBlockedModalIfNeeded,
    goBusinessHubOrModal,
    hubBlockedModal,
  };
}
