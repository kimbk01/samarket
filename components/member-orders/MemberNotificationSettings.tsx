"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

type DomainSettings = {
  order_enabled: boolean;
  store_enabled: boolean;
  sound_enabled: boolean;
  vibration_enabled: boolean;
};

function Row({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="border-b border-sam-border-soft px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] font-medium text-sam-fg">{label}</p>
          {description ? <p className="mt-0.5 text-[12px] text-sam-muted">{description}</p> : null}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          disabled={disabled}
          onClick={() => onChange(!checked)}
          className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
            checked ? "bg-signature" : "bg-sam-border-soft"
          }`}
        >
          <span
            className={`inline-block h-6 w-6 rounded-full bg-sam-surface shadow transition-transform ${
              checked ? "translate-x-6" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>
    </div>
  );
}

export function MemberNotificationSettings() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [tableMissing, setTableMissing] = useState(false);
  const [s, setS] = useState<DomainSettings | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/me/notification-settings", { credentials: "include" });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        table_missing?: boolean;
        settings?: DomainSettings;
      };
      if (res.status === 401) {
        setUnauthorized(true);
        setS(null);
        return;
      }
      if (!j?.ok || !j.settings) {
        setS(null);
        return;
      }
      setUnauthorized(false);
      setTableMissing(j.table_missing === true);
      const x = j.settings;
      setS({
        order_enabled: x.order_enabled !== false,
        store_enabled: x.store_enabled !== false,
        sound_enabled: x.sound_enabled !== false,
        vibration_enabled: x.vibration_enabled !== false,
      });
    } catch {
      setS(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = useCallback(
    async (partial: Partial<DomainSettings>) => {
      if (!s) return;
      const res = await fetch("/api/me/notification-settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partial),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (res.ok && j?.ok && typeof window !== "undefined") {
        window.dispatchEvent(new Event("kasama:user-notification-settings-changed"));
        setS((prev) => (prev ? { ...prev, ...partial } : prev));
      } else {
        await load();
      }
    },
    [s, load]
  );

  if (loading) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-4 text-sm text-sam-muted shadow-sm">
        불러오는 중…
      </div>
    );
  }

  if (unauthorized) {
    return (
      <p className="rounded-ui-rect border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
        {t("order_notifications_guest_only")}
      </p>
    );
  }

  if (!s || tableMissing) {
    return (
      <div className="rounded-ui-rect border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
        {tableMissing
          ? "알림 설정 테이블이 아직 없습니다. 마이그레이션 적용 후 다시 시도해 주세요."
          : "설정을 불러오지 못했습니다."}
      </div>
    );
  }

  return (
    <div className="divide-y divide-sam-border-soft rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm">
      <div className="px-4 py-3">
        <h2 className="text-sm font-bold text-sam-fg">{t("order_notifications_header")}</h2>
        <p className="mt-1 text-[12px] text-sam-muted">
          주문·매장 인앱 알림은 Supabase `user_notification_settings` 에 저장됩니다.{" "}
          <Link href="/my/settings/notifications" className="font-medium text-signature underline">
            전체 알림 설정
          </Link>
          에서 채팅·이메일 등을 함께 조정할 수 있어요.
        </p>
      </div>
      <Row
        label="주문 알림 (상태·취소·환불 등)"
        description="매장 주문 진행·취소·환불 관련 인앱 알림"
        checked={s.order_enabled}
        onChange={(v) => void patch({ order_enabled: v })}
      />
      <Row
        label="매장·판매 알림"
        description="입점 매장·주문 접수 등 매장 도메인 알림"
        checked={s.store_enabled}
        onChange={(v) => void patch({ store_enabled: v })}
      />
      <Row
        label="인앱 알림음"
        checked={s.sound_enabled}
        onChange={(v) => void patch({ sound_enabled: v })}
      />
      <Row
        label="진동"
        checked={s.vibration_enabled}
        onChange={(v) => void patch({ vibration_enabled: v })}
      />
    </div>
  );
}
