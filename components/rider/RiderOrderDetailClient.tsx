"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { dibayPrompt } from "@/components/ui/dibay-overlay";
import { formatStoreOrderDeliveryAddressPlain } from "@/lib/addresses/store-order-delivery-address-display";
import { Sam } from "@/lib/ui/sam-component-classes";

type DetailPayload = {
  ok?: boolean;
  error?: string;
  delivery?: Record<string, unknown>;
  order?: Record<string, unknown>;
  store?: Record<string, unknown> | null;
};

export function RiderOrderDetailClient(props: { orderId: string }) {
  const { t } = useI18n();
  const oid = props.orderId.trim();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<DetailPayload | null>(null);
  const locTimer = useRef<number | null>(null);

  const [podNote, setPodNote] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [podImgPath, setPodImgPath] = useState<string | null>(null);
  const [podBusy, setPodBusy] = useState(false);
  const [failReason, setFailReason] = useState("");
  const [failNote, setFailNote] = useState("");
  const [failImgPath, setFailImgPath] = useState<string | null>(null);
  const [failBusy, setFailBusy] = useState(false);

  const load = useCallback(async () => {
    if (!oid) return;
    setErr(null);
    const r = await fetch(`/api/me/rider/orders/${encodeURIComponent(oid)}`, { cache: "no-store" });
    const j = (await r.json()) as DetailPayload;
    if (!r.ok || !j.ok) {
      setErr(j.error ?? t("ui_rider_load_failed"));
      setData(null);
      return;
    }
    setData(j);
  }, [oid, t]);

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

  const patchOrder = async (body: Record<string, unknown>) => {
    setErr(null);
    const r = await fetch(`/api/me/rider/orders/${encodeURIComponent(oid)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = (await r.json()) as { ok?: boolean; error?: string };
    if (!r.ok || !j.ok) {
      setErr(j.error ?? t("ui_rider_request_failed"));
      return;
    }
    await load();
  };

  const uploadPodKind = async (kind: "delivery_proof" | "failure_report", file: File) => {
    const fd = new FormData();
    fd.set("file", file);
    fd.set("kind", kind);
    const r = await fetch(`/api/me/rider/orders/${encodeURIComponent(oid)}/pod-upload`, {
      method: "POST",
      body: fd,
    });
    const j = (await r.json()) as { ok?: boolean; path?: string; error?: string };
    if (!r.ok || !j.ok) throw new Error(j.error ?? "upload_failed");
    const p = safeTrim(j.path);
    if (!p) throw new Error("missing_path");
    return p;
  };

  const onPickDeliveryPhoto = async (fileList: FileList | null) => {
    const f = fileList?.[0];
    if (!f) return;
    setPodBusy(true);
    setErr(null);
    try {
      const path = await uploadPodKind("delivery_proof", f);
      setPodImgPath(path || null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "upload_failed");
    } finally {
      setPodBusy(false);
    }
  };

  const onPickFailurePhoto = async (fileList: FileList | null) => {
    const f = fileList?.[0];
    if (!f) return;
    setFailBusy(true);
    setErr(null);
    try {
      const path = await uploadPodKind("failure_report", f);
      setFailImgPath(path || null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "upload_failed");
    } finally {
      setFailBusy(false);
    }
  };

  function safeTrim(s: unknown): string {
    return typeof s === "string" ? s.trim() : "";
  }

  const activeForTracking = (st: string) => st === "pickup_in_progress" || st === "delivering";

  useEffect(() => {
    const st = String(data?.delivery?.delivery_status ?? "");
    if (!activeForTracking(st)) {
      if (locTimer.current) {
        window.clearInterval(locTimer.current);
        locTimer.current = null;
      }
      return;
    }
    const push = () => {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          void fetch("/api/me/rider/location", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          });
        },
        () => {},
        { enableHighAccuracy: false, maximumAge: 20_000, timeout: 15_000 }
      );
    };
    push();
    locTimer.current = window.setInterval(push, 32_000);
    return () => {
      if (locTimer.current) window.clearInterval(locTimer.current);
      locTimer.current = null;
    };
  }, [data?.delivery?.delivery_status]);

  if (loading) {
    return (
      <div className={`${Sam.page} bg-sam-app min-h-[50vh] flex items-center justify-center text-sam-muted`}>
        {t("common_loading")}
      </div>
    );
  }

  if (!data?.delivery) {
    return (
      <div className={`${Sam.page} bg-sam-app px-4 py-8`}>
        <p className="text-red-600 text-sm">{err ?? t("ui_rider_no_data")}</p>
        <Link href="/rider/orders" className={`mt-4 inline-flex ${Sam.btn.secondary}`}>
          {t("ui_rider_list_label")}
        </Link>
      </div>
    );
  }

  const del = data.delivery;
  const ord = data.order ?? {};
  const st = String(del.delivery_status ?? "");
  const failureReported = Boolean(del.rider_failure_reported_at);

  return (
    <div className={`${Sam.page} bg-sam-app min-h-[70vh] px-4 py-6 max-w-lg mx-auto space-y-6`}>
      <header className="flex items-center justify-between gap-2">
        <h1 className={Sam.text.pageTitle}>{String(ord.order_no ?? oid.slice(0, 8))}</h1>
        <Link href="/rider/orders" className={`${Sam.btn.secondary} text-sm`}>
          {t("ui_rider_list_label")}
        </Link>
      </header>

      <section className={`${Sam.card.base} ${Sam.card.pad} space-y-2 text-sm`}>
        <div className="flex justify-between">
          <span className="text-sam-muted">{t("ui_rider_delivery_status")}</span>
          <span className="text-sam-fg font-medium">{st}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sam-muted">{t("ui_rider_order_status")}</span>
          <span className="text-sam-fg">{String(ord.order_status ?? "—")}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-sam-muted shrink-0">{t("ui_rider_store")}</span>
          <span className="text-right text-sam-fg">{String(data.store?.store_name ?? "—")}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-sam-muted shrink-0">{t("ui_rider_delivery_address")}</span>
          <span className="text-right text-sam-fg text-xs">
            {formatStoreOrderDeliveryAddressPlain({
              summary:
                typeof ord.delivery_address_summary === "string" ? ord.delivery_address_summary : null,
              detail:
                typeof ord.delivery_address_detail === "string" ? ord.delivery_address_detail : null,
            }) || "—"}
          </span>
        </div>
        <dl className="pt-2 border-t border-sam-border space-y-1 text-xs text-sam-muted">
          <div className="flex justify-between">
            <dt>assigned_at</dt>
            <dd>{String(del.assigned_at ?? "—")}</dd>
          </div>
          <div className="flex justify-between">
            <dt>picked_up_at</dt>
            <dd>{String(del.picked_up_at ?? "—")}</dd>
          </div>
          <div className="flex justify-between">
            <dt>customer_arrived_at</dt>
            <dd>{String(del.customer_arrived_at ?? "—")}</dd>
          </div>
          <div className="flex justify-between">
            <dt>delivered_at</dt>
            <dd>{String(del.delivered_at ?? "—")}</dd>
          </div>
          <div className="flex justify-between">
            <dt>{t("ui_rider_pod_location")}</dt>
            <dd className="text-right">
              {del.delivered_proof_lat != null && del.delivered_proof_lng != null
                ? `${String(del.delivered_proof_lat)}, ${String(del.delivered_proof_lng)}`
                : "—"}
            </dd>
          </div>
        </dl>
      </section>

      {failureReported ? (
        <div className="rounded-ui-rect border border-amber-600/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900">
          {t("ui_rider_failure_reported_notice")}
        </div>
      ) : null}

      {err ? <p className="text-sm text-red-600">{err}</p> : null}

      <section className="space-y-4">
        {st === "rider_assigned" && !del.rider_accepted_at ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={Sam.btn.primary} onClick={() => void patchOrder({ action: "accept" })}>
              {t("common_accept")}
            </button>
            <button
              type="button"
              className={Sam.btn.secondary}
              onClick={async () => {
                const reason = (await dibayPrompt({ title: t("ui_rider_decline_reason_prompt") })) ?? "";
                void patchOrder({ action: "decline", reason: reason.trim() || undefined });
              }}
            >
              {t("common_reject")}
            </button>
          </div>
        ) : null}

        {st === "rider_assigned" && del.rider_accepted_at ? (
          <button
            type="button"
            className={`${Sam.btn.primary} w-full`}
            onClick={() => void patchOrder({ action: "set_delivery_status", delivery_status: "pickup_in_progress" })}
          >
            {t("ui_rider_depart_to_store")}
          </button>
        ) : null}

        {st === "pickup_in_progress" ? (
          <button
            type="button"
            className={`${Sam.btn.primary} w-full`}
            onClick={() => void patchOrder({ action: "set_delivery_status", delivery_status: "delivering" })}
          >
            {t("ui_rider_pickup_start_delivery")}
          </button>
        ) : null}

        {(st === "pickup_in_progress" || st === "delivering") && !failureReported ? (
          <div className={`${Sam.card.base} ${Sam.card.pad} space-y-2`}>
            <p className={`${Sam.text.sectionTitle} text-sm`}>{t("ui_rider_failure_report_section")}</p>
            <input
              type="text"
              value={failReason}
              onChange={(e) => setFailReason(e.target.value)}
              placeholder={t("ui_rider_failure_reason_required")}
              className={`${Sam.input.base} w-full text-sm`}
            />
            <textarea
              value={failNote}
              onChange={(e) => setFailNote(e.target.value)}
              placeholder={t("ui_rider_extra_memo")}
              rows={2}
              className={`${Sam.input.base} w-full text-sm`}
            />
            <label className={`block text-xs ${Sam.text.bodySecondary}`}>
              {t("ui_rider_proof_photo_optional")}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="mt-1 block w-full text-xs"
                disabled={failBusy}
                onChange={(e) => void onPickFailurePhoto(e.target.files)}
              />
            </label>
            {failImgPath ? <p className="text-xs text-sam-muted">{t("ui_rider_proof_uploaded")}</p> : null}
            <button
              type="button"
              className={`${Sam.btn.secondary} w-full`}
              disabled={failBusy || !failReason.trim()}
              onClick={() =>
                void patchOrder({
                  action: "report_delivery_failure",
                  reason: failReason.trim(),
                  note: failNote.trim() || undefined,
                  failure_proof_image_path: failImgPath ?? undefined,
                })
              }
            >
              {t("ui_rider_submit_failure_report")}
            </button>
          </div>
        ) : null}

        {st === "delivering" ? (
          <div className="flex flex-col gap-3">
            <button type="button" className={Sam.btn.secondary} onClick={() => void patchOrder({ action: "customer_arrived" })}>
              {t("ui_rider_customer_arrived")}
            </button>
            <div className={`${Sam.card.base} ${Sam.card.pad} space-y-2`}>
              <p className={`${Sam.text.sectionTitle} text-sm`}>{t("ui_rider_pod_proof_section")}</p>
              <label className={`block text-xs ${Sam.text.bodySecondary}`}>
                {t("ui_rider_completion_photo_optional")}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="mt-1 block w-full text-xs"
                  disabled={podBusy}
                  onChange={(e) => void onPickDeliveryPhoto(e.target.files)}
                />
              </label>
              {podImgPath ? <p className="text-xs text-sam-muted">{t("ui_rider_proof_uploaded")}</p> : null}
              <input
                type="text"
                value={receiverName}
                onChange={(e) => setReceiverName(e.target.value)}
                placeholder={t("ui_rider_receiver_name_optional")}
                className={`${Sam.input.base} w-full text-sm`}
              />
              <textarea
                value={podNote}
                onChange={(e) => setPodNote(e.target.value)}
                placeholder={t("ui_rider_memo_optional")}
                rows={2}
                className={`${Sam.input.base} w-full text-sm`}
              />
              <button
                type="button"
                className={`${Sam.btn.primary} w-full`}
                disabled={podBusy}
                onClick={() =>
                  void patchOrder({
                    action: "set_delivery_status",
                    delivery_status: "delivered",
                    pod: {
                      delivered_proof_image_path: podImgPath ?? undefined,
                      delivered_proof_note: podNote.trim() || undefined,
                      delivered_receiver_name: receiverName.trim() || undefined,
                    },
                  })
                }
              >
                {t("ui_rider_delivery_complete")}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <p className={`${Sam.text.helper} text-xs`}>
        {t("ui_rider_location_tracking_hint")}
      </p>
    </div>
  );
}
