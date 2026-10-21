"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useOwnerToast } from "@/components/business/owner/OwnerToastHost";
import { ownerFetchJson } from "@/lib/business/owner-fetch-json";

type DomainSettings = {
  optional_push_enabled: boolean;
  optional_sound_enabled: boolean;
};

function Row({
  label,
  description,
  checked,
  busy,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  busy: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-sam-border-soft px-4 py-3">
      <div className="min-w-0">
        <span className="sam-text-body text-sam-fg">{label}</span>
        {description ? <p className="mt-0.5 sam-text-helper text-sam-muted">{description}</p> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        aria-busy={busy}
        disabled={busy}
        onClick={() => onChange(!checked)}
        className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
          checked ? "bg-sam-primary" : "bg-sam-border-soft"
        }`}
      >
        <span
          className={`inline-block h-6 w-6 rounded-full bg-sam-surface shadow transition-transform ${
            checked ? "translate-x-6" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}

/**
 * IA-14 — 알림 설정은 **사용자(계정) 단위** (`owner-notification-settings` onConflict user_id).
 * 매장 URL 에서 열려도 매장별 설정이 아니므로 매장 ID 를 표시하지 않는다. `storeId` 는 호출 호환용.
 */
export function OwnerNotificationSettings(_props: { storeId?: string }) {
  const { t } = useI18n();
  const toast = useOwnerToast();
  const [busyKey, setBusyKey] = useState<keyof DomainSettings | null>(null);
  /** 같은 틱 이중 클릭 차단 (state 반영 전) */
  const busyRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [tableMissing, setTableMissing] = useState(false);
  const [s, setS] = useState<DomainSettings | null>(null);

  const load = useCallback(async () => {
    setLoading((prev) => (prev ? prev : true));
    try {
      const res = await fetch("/api/me/owner-notification-settings", { credentials: "include" });
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
        setS((prev) => (prev === null ? prev : null));
        return;
      }
      setUnauthorized(false);
      setTableMissing(j.table_missing === true);
      const x = j.settings;
      const nextSettings: DomainSettings = {
        optional_push_enabled: x.optional_push_enabled !== false,
        optional_sound_enabled: x.optional_sound_enabled !== false,
      };
      setS((prev) =>
        prev &&
        prev.optional_push_enabled === nextSettings.optional_push_enabled &&
        prev.optional_sound_enabled === nextSettings.optional_sound_enabled
          ? prev
          : nextSettings
      );
    } catch {
      setS((prev) => (prev === null ? prev : null));
    } finally {
      setLoading((prev) => (prev ? false : prev));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** IA-14 — busy + 낙관 반영, 실패 시 원복 + 토스트 (API 불변) */
  const patch = useCallback(
    async (key: keyof DomainSettings, value: boolean) => {
      if (!s || busyRef.current) return;
      busyRef.current = true;
      const prev = s;
      setBusyKey(key);
      setS({ ...prev, [key]: value });
      try {
        const res = await ownerFetchJson("/api/me/owner-notification-settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [key]: value }),
        });
        if (!res.ok) {
          setS(prev);
          toast.error(t("owner_s4_setting_failed_reverted"));
          return;
        }
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("kasama:user-notification-settings-changed"));
        }
      } finally {
        busyRef.current = false;
        setBusyKey(null);
      }
    },
    [s, toast, t]
  );

  if (loading) {
    return <p className="text-sm text-sam-muted">{t("common_loading")}</p>;
  }

  if (unauthorized) {
    return (
      <p className="rounded-ui-rect border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
        {t("store_owner_notif_login_only")}
      </p>
    );
  }

  if (!s || tableMissing) {
    return (
      <p className="rounded-ui-rect border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
        {tableMissing ? t("store_owner_notif_table_missing") : t("store_owner_notif_load_failed")}
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm">
      <div className="border-b border-sam-border-soft px-4 py-3">
        <h2 className="text-sm font-bold text-sam-fg">{t("owner_s4_notif_title")}</h2>
        <p className="mt-1 sam-text-helper text-sam-muted">{t("owner_s4_notif_scope_desc")}</p>
        <p className="mt-2 sam-text-helper text-sam-muted">
          <Link href="/my/settings/notifications" className="font-medium text-sam-primary underline">
            {t("order_notifications_all_settings_link")}
          </Link>
          {t("store_owner_notif_settings_link_suffix")}
        </p>
      </div>
      <Row
        label={t("store_owner_notif_push_label")}
        description={t("store_owner_notif_push_desc")}
        checked={s.optional_push_enabled}
        busy={busyKey === "optional_push_enabled"}
        onChange={(v) => void patch("optional_push_enabled", v)}
      />
      <Row
        label={t("store_owner_notif_sound")}
        checked={s.optional_sound_enabled}
        busy={busyKey === "optional_sound_enabled"}
        onChange={(v) => void patch("optional_sound_enabled", v)}
      />
    </div>
  );
}
