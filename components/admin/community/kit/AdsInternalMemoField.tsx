"use client";

/**
 * D-10 (2026-11-07) — 도메인 상위노출 조치 시트의 「내부 메모」 칸 (공개 사유와 분리).
 * 공개 사유는 시트의 사유 칸(회원에게 전달) · 이 칸은 운영자만 보는 메모로, API 의 `internalReason` 으로 보낸다.
 * 칸을 켤지는 공통 확인창과 같은 함수 `adsWorkspaceActionSplitsReason` 으로 정한다.
 */
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { ADMIN_REASON_MAX_LENGTH } from "@/lib/admin/operator-ux/admin-reason";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

export function AdsInternalMemoField({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const { t } = useI18n();
  return (
    <label className="block" data-admin-ads-internal-memo="1">
      <span className="sam-text-helper font-medium text-sam-fg">{t("admin_ads_w3_internal_memo_label")}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        maxLength={ADMIN_REASON_MAX_LENGTH}
        placeholder={t("admin_ads_w3_internal_memo_placeholder")}
        className={`mt-1 w-full ${OverlayUi.input}`}
      />
      <span className="mt-1 block sam-text-xxs text-sam-muted">{t("admin_ads_w3_internal_memo_hint")}</span>
    </label>
  );
}
