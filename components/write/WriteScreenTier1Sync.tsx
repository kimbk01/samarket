"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { runFixedDestinationBack } from "@/lib/navigation/fixed-destination-back";

import { useCallback, useLayoutEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DibayConfirmDialog } from "@/components/ui/dibay-overlay";
import { useSetMainTier1ExtrasOptional } from "@/contexts/MainTier1ExtrasContext";
import { DetailHeader, SectorHeaderBackButton } from "@/components/layout/sector-header";

/**
 * 글쓰기 화면 1단
 * - `global`: 전역 `RegionBar` 슬롯(`MainTier1Extras`)에 동기화
 * - `embedded`: `/write` 시트 등 — DOM 안에 1단을 직접 렌더(닫기 시 본문과 함께 transform 가능)
 */
export function WriteScreenTier1Sync({
  title,
  backHref,
  subtitle,
  onRequestClose,
  tier1Mode = "global",
  hasUnsavedChanges,
}: {
  title: string;
  backHref: string;
  subtitle?: string;
  onRequestClose?: () => void;
  tier1Mode?: "global" | "embedded";
  /**
   * 작성 내용 변경 여부. `false` 면 확인 없이 바로 이탈 (거래 글쓰기와 같은 dirty 판정, 지정 #12).
   * 미지정이면 기존처럼 항상 확인.
   */
  hasUnsavedChanges?: boolean;
}) {
  const { t } = useI18n();
  const setExtras = useSetMainTier1ExtrasOptional();
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleConfirmLeave = useCallback(() => {
    setConfirmOpen(false);
    if (onRequestClose) {
      onRequestClose();
      return;
    }
    /** 확인 후 이탈 — 직전 기록이 목적지면 back, 아니면 replace (버린 작성 화면이 기록에 남지 않음, Q7) */
    runFixedDestinationBack(router, backHref);
  }, [router, backHref, onRequestClose]);

  const openConfirm = useCallback(() => {
    if (hasUnsavedChanges === false) {
      handleConfirmLeave();
      return;
    }
    setConfirmOpen(true);
  }, [hasUnsavedChanges, handleConfirmLeave]);

  useLayoutEffect(() => {
    if (tier1Mode === "embedded") return;
    if (!setExtras) return;
    setExtras({
      tier1: {
        titleText: title,
        subtitle: subtitle?.trim() ? subtitle.trim() : undefined,
        leftSlot: (
          <SectorHeaderBackButton
            onBack={onRequestClose ?? openConfirm}
            variant="close"
            ariaLabelKey="common_close"
          />
        ),
        /** 글쓰기 1단은 닫기·제목만 — 알림 종 없음 (P-03) */
        showHubQuickActions: false,
      },
    });
    return () => setExtras(null);
  }, [setExtras, title, subtitle, backHref, openConfirm, onRequestClose, tier1Mode]);

  const subtitleText = subtitle?.trim() ?? "";

  const embeddedHeader = (
    <DetailHeader
      title={title}
      subtitle={subtitleText || undefined}
      backVariant="close"
      onBack={onRequestClose ?? openConfirm}
      backAriaLabelKey="common_close"
    />
  );

  return (
    <>
      {tier1Mode === "embedded" ? embeddedHeader : null}
      {!onRequestClose ? (
        <DibayConfirmDialog
          open={confirmOpen}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={handleConfirmLeave}
          title={t("popup_unsaved_leave_title")}
          description={t("popup_note_write_not_saved")}
          cancelLabel={t("popup_keep_editing")}
          confirmLabel={t("popup_cta_leave")}
          confirmTone="destructive"
        />
      ) : null}
    </>
  );
}
