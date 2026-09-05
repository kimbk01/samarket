"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { ownerUiCopy } from "@/lib/business/owner-ui-copy";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import { OwnerManageHubLinks } from "@/components/business/owner/OwnerManageHubLinks";
import { BusinessAdminOpenToggle } from "@/components/business/admin/BusinessAdminOpenToggle";
import { BusinessAdminVisibleToggle } from "@/components/business/admin/BusinessAdminVisibleToggle";

type Props = {
  row: StoreRow;
  onToggleVisible: () => void;
  onToggleMessengerFeature: (
    key:
      | "messenger_voice_messages_enabled"
      | "messenger_voice_calls_enabled"
      | "messenger_video_calls_enabled",
    next: boolean
  ) => void;
  onStoreUpdated?: () => void | Promise<void>;
  orderAlertsBadge?: number;
};

export function OwnerStoreSettingsContent({
  row,
  onToggleVisible,
  onToggleMessengerFeature,
  onStoreUpdated,
  orderAlertsBadge = 0,
}: Props) {
  const { t, language } = useI18n();
  const q = `storeId=${encodeURIComponent(row.id)}`;
  const isApproved = row.approval_status === "approved";
  const visible = row.is_visible === true;
  const voiceMessagesEnabled = row.messenger_voice_messages_enabled !== false;
  const voiceCallsEnabled = row.messenger_voice_calls_enabled !== false;
  const videoCallsEnabled = row.messenger_video_calls_enabled !== false;
  const refresh = onStoreUpdated ?? (async () => undefined);

  return (
    <div className={OWNER_STORE_STACK_Y_CLASS} data-owner-manage-settings="1">
      <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
        <h2 className="sam-text-body font-semibold text-sam-fg">
          {ownerUiCopy(language, "노출 · 영업", "Visibility · Open")}
        </h2>
        <p className="mt-2 sam-text-body-secondary leading-relaxed text-sam-muted">
          {ownerUiCopy(
            language,
            "노출은 고객 목록 표시, 영업은 지금 주문 접수 가능 여부입니다. 홈과 동일한 상태를 사용합니다.",
            "Visibility controls discovery listing; Open controls whether orders are accepted now. Same state as Home."
          )}
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-ui-rect border border-sam-border-soft bg-sam-app px-3 py-2">
            <BusinessAdminVisibleToggle row={row} onUpdated={refresh} />
          </div>
          <div className="rounded-ui-rect border border-sam-border-soft bg-sam-app px-3 py-2">
            <BusinessAdminOpenToggle row={row} onUpdated={refresh} />
          </div>
        </div>
        {!isApproved ? (
          <p className="mt-2 sam-text-helper text-sam-muted">
            {t("owner_store_visibility_after_approval")}
          </p>
        ) : null}
        {/* Keep legacy one-tap visibility for callers that still wire onToggleVisible */}
        <button
          type="button"
          disabled={!isApproved}
          onClick={onToggleVisible}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
        >
          {visible ? t("owner_store_toggle_hide") : t("owner_store_toggle_show")}
        </button>
      </section>

      <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
        <h2 className="sam-text-body font-semibold text-sam-fg">
          {ownerUiCopy(language, "매장 정보 편집 위치", "Where store fields are edited")}
        </h2>
        <p className="mt-2 sam-text-body-secondary leading-relaxed text-sam-muted">
          {ownerUiCopy(
            language,
            "상호·이미지·소개·연락은 기본 정보, 영업시간·배달·서비스는 매장 설정, 심사·판매 권한은 운영·심사에서 확인합니다.",
            "Name/image/intro/contact → Basic info. Hours/delivery/service → Store settings. Approval/sales rights → Ops status."
          )}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={`/stores/owner/basic-info?${q}`}
            className="rounded-ui-rect border border-sam-primary-border bg-sam-primary-soft px-3 py-2 text-xs font-semibold text-sam-primary"
            data-owner-settings-goto-basic="1"
          >
            {ownerUiCopy(language, "기본 정보", "Basic info")}
          </Link>
          <Link
            href={`/stores/owner/profile?${q}`}
            className="rounded-ui-rect border border-sam-primary-border bg-sam-primary-soft px-3 py-2 text-xs font-semibold text-sam-primary"
            data-owner-settings-goto-profile="1"
          >
            {ownerUiCopy(language, "매장 설정", "Store settings")}
          </Link>
          <Link
            href={`/stores/owner/ops-status?${q}`}
            className="rounded-ui-rect border border-sam-primary-border bg-sam-primary-soft px-3 py-2 text-xs font-semibold text-sam-primary"
            data-owner-settings-goto-ops="1"
          >
            {ownerUiCopy(language, "운영·심사", "Ops & status")}
          </Link>
        </div>
      </section>

      <OwnerManageHubLinks row={row} orderAlertsBadge={orderAlertsBadge} />

      <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
        <h2 className="sam-text-body font-semibold text-sam-fg">{t("owner_store_messenger_features_title")}</h2>
        <p className="mt-2 sam-text-body-secondary leading-relaxed text-sam-muted">
          {t("owner_store_messenger_features_body")}
        </p>
        <div className="mt-3 space-y-2">
          {[
            {
              key: "messenger_voice_messages_enabled" as const,
              enabled: voiceMessagesEnabled,
              label: t("owner_store_messenger_voice_messages"),
            },
            {
              key: "messenger_voice_calls_enabled" as const,
              enabled: voiceCallsEnabled,
              label: t("owner_store_messenger_voice_calls"),
            },
            {
              key: "messenger_video_calls_enabled" as const,
              enabled: videoCallsEnabled,
              label: t("owner_store_messenger_video_calls"),
            },
          ].map((item) => (
            <div
              key={item.key}
              className="flex items-center justify-between gap-3 rounded-ui-rect border border-sam-border-soft bg-sam-app px-3 py-2"
            >
              <p className="min-w-0 sam-text-body font-medium text-sam-fg">{item.label}</p>
              <button
                type="button"
                disabled={!isApproved}
                onClick={() => onToggleMessengerFeature(item.key, !item.enabled)}
                className={[
                  "shrink-0 rounded-ui-rect px-3 py-2 sam-text-body font-medium",
                  isApproved
                    ? item.enabled
                      ? "bg-signature text-white"
                      : "border border-sam-border bg-sam-surface text-sam-fg"
                    : "cursor-not-allowed border border-sam-border bg-sam-surface-muted text-sam-muted",
                ].join(" ")}
              >
                {item.enabled ? t("owner_store_messenger_feature_on") : t("owner_store_messenger_feature_off")}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
        <h2 className="sam-text-body font-semibold text-sam-fg">{t("owner_store_delivery_sound_title")}</h2>
        <p className="mt-2 sam-text-body-secondary leading-relaxed text-sam-muted">
          {t("owner_store_delivery_sound_intro_before")}{" "}
          <strong className="font-semibold text-sam-fg">{t("owner_store_delivery_sound_shared")}</strong>
          {t("owner_store_delivery_sound_body")}
        </p>
        <p className="mt-2 sam-text-helper text-sam-muted">{t("owner_store_delivery_sound_beep_note")}</p>
        <p className="mt-3 sam-text-body-secondary text-sam-muted">
          {t("owner_store_delivery_sound_ops_prompt")}{" "}
          <Link href={`/stores/owner/ops-status?${q}`} className="font-medium text-signature underline">
            {t("owner_store_delivery_sound_ops_link")}
          </Link>{" "}
          {t("owner_store_delivery_sound_ops_suffix")}
        </p>
      </section>

      <section className="rounded-ui-rect border border-dashed border-sam-border bg-sam-surface p-4 sam-text-body-secondary text-sam-muted">
        {t("owner_store_settings_footer_before")}{" "}
        <Link href={`/stores/owner/profile?${q}`} className="font-medium text-signature underline">
          {t("owner_store_settings_profile_link")}
        </Link>{" "}
        {t("owner_store_settings_footer_after")}
      </section>
    </div>
  );
}
