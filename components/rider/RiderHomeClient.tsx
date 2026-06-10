"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Sam } from "@/lib/ui/sam-component-classes";

type RiderRow = {
  id: string;
  is_online: boolean | null;
  rider_status: string | null;
  last_active_at?: string | null;
};

export function RiderHomeClient() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [rider, setRider] = useState<RiderRow | null>(null);
  const [counts, setCounts] = useState<{ queue: number; active: number; delivered_today: number } | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    const r = await fetch("/api/me/rider/bootstrap", { cache: "no-store" });
    const j = (await r.json()) as {
      ok?: boolean;
      error?: string;
      rider?: RiderRow;
      counts?: { queue: number; active: number; delivered_today: number };
    };
    if (r.status === 401) {
      setErr("unauthorized");
      setRider(null);
      setCounts(null);
      return;
    }
    if (!r.ok || !j.ok) {
      setErr(j.error ?? t("ui_rider_load_failed"));
      setRider(null);
      setCounts(null);
      return;
    }
    setRider(j.rider ?? null);
    setCounts(j.counts ?? null);
  }, [t]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      setLoading(true);
      await load();
      if (alive) setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  const patchStatus = async (patch: { is_online?: boolean; rider_status?: string | null }) => {
    setErr(null);
    const r = await fetch("/api/me/rider/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const j = (await r.json()) as { ok?: boolean; error?: string; rider?: RiderRow };
    if (!r.ok || !j.ok) {
      setErr(j.error ?? t("ui_rider_status_change_failed"));
      return;
    }
    if (j.rider) setRider(j.rider);
  };

  if (loading) {
    return (
      <div className={`${Sam.page} bg-sam-app min-h-[70vh] flex items-center justify-center text-sam-muted`}>
        {t("common_loading")}
      </div>
    );
  }

  if (err === "rider_profile_not_found" || err === "unauthorized") {
    return (
      <div className={`${Sam.page} bg-sam-app min-h-[70vh] px-4 py-8 max-w-md mx-auto`}>
        <h1 className={Sam.text.pageTitle}>{t("ui_rider_center_title")}</h1>
        <p className={`mt-3 ${Sam.text.bodySecondary}`}>
          {err === "unauthorized" ? t("auth_resource_access_denied") : t("ui_rider_not_registered")}
        </p>
      </div>
    );
  }

  return (
    <div className={`${Sam.page} bg-sam-app min-h-[70vh] px-4 py-6 max-w-lg mx-auto space-y-6`}>
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className={Sam.text.pageTitle}>{t("ui_rider_title")}</h1>
          <p className={`mt-1 ${Sam.text.bodySecondary}`}>{t("ui_rider_subtitle")}</p>
        </div>
        <Link href="/rider/orders" className={`${Sam.btn.secondary} shrink-0 text-sm`}>
          {t("ui_rider_orders_link")}
        </Link>
      </header>

      {err ? <p className="text-sm text-red-600">{err}</p> : null}

      {rider ? (
        <section className={`${Sam.card.base} ${Sam.card.pad}`}>
          <h2 className={Sam.text.sectionTitle}>{t("ui_rider_my_status")}</h2>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <dt className="text-sam-muted">{t("ui_rider_online_label")}</dt>
            <dd className="text-sam-fg">{rider.is_online ? t("ui_rider_yes") : t("ui_rider_no")}</dd>
            <dt className="text-sam-muted">{t("ui_rider_mode_label")}</dt>
            <dd className="text-sam-fg">{rider.rider_status ?? "—"}</dd>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className={Sam.btn.primary}
              disabled={rider.is_online === true}
              onClick={() => void patchStatus({ is_online: true, rider_status: "active" })}
            >
              {t("ui_rider_go_online")}
            </button>
            <button
              type="button"
              className={Sam.btn.secondary}
              disabled={rider.is_online === false}
              onClick={() => void patchStatus({ is_online: false })}
            >
              {t("ui_rider_go_offline")}
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={Sam.btn.secondary} onClick={() => void patchStatus({ rider_status: "active" })}>
              {t("ui_rider_mode_active")}
            </button>
            <button type="button" className={Sam.btn.secondary} onClick={() => void patchStatus({ rider_status: "delivering" })}>
              {t("ui_rider_mode_delivering")}
            </button>
            <button type="button" className={Sam.btn.secondary} onClick={() => void patchStatus({ rider_status: "on_break" })}>
              {t("ui_rider_mode_break")}
            </button>
          </div>
        </section>
      ) : null}

      {counts ? (
        <section className={`${Sam.card.base} ${Sam.card.pad}`}>
          <h2 className={Sam.text.sectionTitle}>{t("ui_rider_today_summary")}</h2>
          <ul className={`mt-3 space-y-2 ${Sam.text.body}`}>
            <li>{t("ui_rider_queue_count", { count: counts.queue })}</li>
            <li>{t("ui_rider_active_count", { count: counts.active })}</li>
            <li>{t("ui_rider_delivered_today_count", { count: counts.delivered_today })}</li>
          </ul>
        </section>
      ) : null}

      <button type="button" className={`${Sam.btn.secondary} w-full`} onClick={() => void load()}>
        {t("ui_rider_refresh")}
      </button>
    </div>
  );
}
