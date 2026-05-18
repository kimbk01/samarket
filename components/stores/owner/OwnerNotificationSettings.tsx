"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fetchMeNotificationSettingsGet } from "@/lib/me/fetch-me-notification-settings-client";
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
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
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
        onClick={() => onChange(!checked)}
        className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
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
  );
}

export function OwnerNotificationSettings({ storeId }: { storeId: string }) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [tableMissing, setTableMissing] = useState(false);
  const [s, setS] = useState<DomainSettings | null>(null);

  const load = useCallback(async () => {
    setLoading((prev) => (prev ? prev : true));
    try {
      const res = await fetchMeNotificationSettingsGet();
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
        order_enabled: x.order_enabled !== false,
        store_enabled: x.store_enabled !== false,
        sound_enabled: x.sound_enabled !== false,
        vibration_enabled: x.vibration_enabled !== false,
      };
      setS((prev) =>
        prev &&
        prev.order_enabled === nextSettings.order_enabled &&
        prev.store_enabled === nextSettings.store_enabled &&
        prev.sound_enabled === nextSettings.sound_enabled &&
        prev.vibration_enabled === nextSettings.vibration_enabled
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
        <h2 className="text-sm font-bold text-sam-fg">{t("business_phase7_075")}</h2>
        <p className="mt-1 sam-text-helper text-sam-muted font-mono" title="store id">
          {storeId}
        </p>
        <p className="mt-2 sam-text-helper text-sam-muted">
          <Link href="/my/settings/notifications" className="font-medium text-signature underline">
            {t("order_notifications_all_settings_link")}
          </Link>
          {t("store_owner_notif_settings_link_suffix")}
        </p>
      </div>
      <Row
        label={t("store_owner_notif_order_label")}
        description={t("store_owner_notif_order_desc")}
        checked={s.order_enabled}
        onChange={(v) => void patch({ order_enabled: v })}
      />
      <Row
        label={t("store_owner_notif_store_label")}
        description={t("store_owner_notif_store_desc")}
        checked={s.store_enabled}
        onChange={(v) => void patch({ store_enabled: v })}
      />
      <Row
        label={t("store_owner_notif_sound")}
        checked={s.sound_enabled}
        onChange={(v) => void patch({ sound_enabled: v })}
      />
      <Row
        label={t("store_owner_notif_vibration")}
        checked={s.vibration_enabled}
        onChange={(v) => void patch({ vibration_enabled: v })}
      />
    </div>
  );
}
