"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { ownerUiCopy } from "@/lib/business/owner-ui-copy";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import { OwnerManageHubLinks } from "@/components/business/owner/OwnerManageHubLinks";
import { BusinessAdminOpenToggle } from "@/components/business/admin/BusinessAdminOpenToggle";
import { BusinessAdminVisibleToggle } from "@/components/business/admin/BusinessAdminVisibleToggle";

type Props = {
  row: StoreRow;
  /**
   * @deprecated IA-12 — 죽은 sr-only 버튼 제거. 노출·영업 변경은 이 화면의 토글(SSOT)만 사용한다.
   * 호출부 호환을 위해 prop 만 남긴다(미사용).
   */
  onToggleVisible?: () => void;
  onToggleMessengerFeature: (
    key:
      | "messenger_voice_messages_enabled"
      | "messenger_voice_calls_enabled"
      | "messenger_video_calls_enabled",
    next: boolean
  ) => void;
  onStoreUpdated?: () => void | Promise<void>;
  orderAlertsBadge?: number;
  /** IA-17 — 처리 중인 메신저 기능 키 (처리 중엔 3개 토글 모두 비활성) */
  messengerBusyKey?: string | null;
};

export function OwnerStoreSettingsContent({
  row,
  onToggleMessengerFeature,
  onStoreUpdated,
  orderAlertsBadge = 0,
  messengerBusyKey = null,
}: Props) {
  const { t, language } = useI18n();
  const isApproved = row.approval_status === "approved";
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
      </section>

      {/* 관리 탭 메뉴 — 드로어와 같은 레지스트리 (설명 줄 없음). 편집 위치 안내 섹션·알림음 안내·하단 안내 문단 삭제 (UN-14 · D-8 · 2026-11-03) */}
      <OwnerManageHubLinks row={row} orderAlertsBadge={orderAlertsBadge} />

      <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
        <h2 className="sam-text-body font-semibold text-sam-fg">{t("owner_store_messenger_features_title")}</h2>
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
                role="switch"
                aria-checked={item.enabled}
                aria-busy={messengerBusyKey === item.key}
                disabled={!isApproved || messengerBusyKey != null}
                onClick={() => onToggleMessengerFeature(item.key, !item.enabled)}
                className={[
                  "shrink-0 rounded-ui-rect px-3 py-2 sam-text-body font-medium",
                  /* 처리 중 — 불투명도로 글자를 흐리지 않고(2.9:1) 대기 커서·aria-busy 로 표시 */
                  messengerBusyKey != null ? "cursor-wait" : "",
                  isApproved
                    ? item.enabled
                      ? "bg-signature text-sam-on-primary"
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

    </div>
  );
}
