"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DELIVERY_AD_OPS_HUMAN_MESSAGE_MAX_CHARS } from "@/lib/stores/advertising/delivery-ad-operations-message";

export function DeliveryAdOperationsComposer({
  value,
  onChange,
  onSend,
  disabled,
  sending,
  error,
}: {
  value: string;
  onChange: (next: string) => void;
  onSend: () => void;
  disabled?: boolean;
  sending?: boolean;
  error?: string | null;
}) {
  const { t, safeT } = useI18n();
  const trimmed = value.trim();
  const canSend = !disabled && !sending && trimmed.length > 0;

  return (
    <div className="space-y-2">
      <label className="block text-[12px] font-medium text-sam-fg" htmlFor="delivery-ad-ops-composer">
        {safeT("delivery_ad_ops_ui_composer_label", {
          fallbackKo: "메시지 작성",
          fallbackEn: "Write a message",
        })}
      </label>
      <textarea
        id="delivery-ad-ops-composer"
        className="min-h-[88px] w-full rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 text-[14px] text-sam-fg"
        value={value}
        maxLength={DELIVERY_AD_OPS_HUMAN_MESSAGE_MAX_CHARS}
        disabled={disabled || sending}
        onChange={(e) => onChange(e.target.value)}
        placeholder={safeT("delivery_ad_ops_ui_composer_placeholder", {
          fallbackKo: "운영 메시지를 입력하세요",
          fallbackEn: "Enter an operations message",
        })}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-sam-muted tabular-nums">
          {trimmed.length}/{DELIVERY_AD_OPS_HUMAN_MESSAGE_MAX_CHARS}
        </span>
        <button
          type="button"
          className="min-h-[44px] rounded-ui-rect bg-sam-brand px-4 text-[13px] font-semibold text-white disabled:opacity-50"
          disabled={!canSend}
          aria-busy={sending || undefined}
          onClick={() => {
            if (!canSend) return;
            onSend();
          }}
        >
          {sending
            ? safeT("delivery_ad_ops_ui_sending", {
                fallbackKo: "전송 중…",
                fallbackEn: "Sending…",
              })
            : t("delivery_ad_ops_ui_send")}
        </button>
      </div>
      {error ? (
        <p className="text-[12px] text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
