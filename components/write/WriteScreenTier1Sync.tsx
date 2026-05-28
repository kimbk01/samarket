"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { useCallback, useLayoutEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppModal } from "@/components/app-shell/AppModal";
import { useSetMainTier1ExtrasOptional } from "@/contexts/MainTier1ExtrasContext";
import { DetailHeader, SectorHeaderBackButton } from "@/components/layout/sector-header";
import { MyHubHeaderActions } from "@/components/my/MyHubHeaderActions";

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
}: {
  title: string;
  backHref: string;
  subtitle?: string;
  onRequestClose?: () => void;
  tier1Mode?: "global" | "embedded";
}) {
  const { t } = useI18n();
  const setExtras = useSetMainTier1ExtrasOptional();
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const openConfirm = useCallback(() => setConfirmOpen(true), []);

  const handleConfirmLeave = useCallback(() => {
    setConfirmOpen(false);
    if (onRequestClose) {
      onRequestClose();
      return;
    }
    router.push(backHref);
  }, [router, backHref, onRequestClose]);

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
        showHubQuickActions: true,
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
      rightSlot={<MyHubHeaderActions />}
    />
  );

  return (
    <>
      {tier1Mode === "embedded" ? embeddedHeader : null}
      {!onRequestClose ? (
        <AppModal
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          title={t("ui_write_cancel_title")}
          className="sm:max-w-[24rem] sm:rounded-sam-md sm:border-b"
          footer={
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirmOpen(false)} className="sam-btn sam-btn--outline flex-1">
                {t("ui_write_continue_writing")}
              </button>
              <button type="button" onClick={handleConfirmLeave} className="sam-btn sam-btn--primary flex-1">
                {t("ui_write_cancel_confirm")}
              </button>
            </div>
          }
        >
          <p className="sam-text-body text-sam-fg">{t("ui_write_discard_body")}</p>
        </AppModal>
      ) : null}
    </>
  );
}
