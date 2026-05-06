"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Sam } from "@/lib/ui/sam-component-classes";

type DetailPayload = {
  ok?: boolean;
  error?: string;
  delivery?: Record<string, unknown>;
  order?: Record<string, unknown>;
  store?: Record<string, unknown> | null;
};

export function RiderOrderDetailClient(props: { orderId: string }) {
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
      setErr(j.error ?? "불러오기 실패");
      setData(null);
      return;
    }
    setData(j);
  }, [oid]);

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
      setErr(j.error ?? "요청 실패");
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
        불러오는 중…
      </div>
    );
  }

  if (!data?.delivery) {
    return (
      <div className={`${Sam.page} bg-sam-app px-4 py-8`}>
        <p className="text-red-600 text-sm">{err ?? "데이터 없음"}</p>
        <Link href="/rider/orders" className={`mt-4 inline-flex ${Sam.btn.secondary}`}>
          목록
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
          목록
        </Link>
      </header>

      <section className={`${Sam.card.base} ${Sam.card.pad} space-y-2 text-sm`}>
        <div className="flex justify-between">
          <span className="text-sam-muted">배달 상태</span>
          <span className="text-sam-fg font-medium">{st}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sam-muted">주문 상태</span>
          <span className="text-sam-fg">{String(ord.order_status ?? "—")}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-sam-muted shrink-0">매장</span>
          <span className="text-right text-sam-fg">{String(data.store?.store_name ?? "—")}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-sam-muted shrink-0">배달지</span>
          <span className="text-right text-sam-fg text-xs">{String(ord.delivery_address_summary ?? "—")}</span>
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
            <dt>POD 위치</dt>
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
          실패 보고가 접수되었습니다. 관리자 확인까지 배달 상태는 유지됩니다.
        </div>
      ) : null}

      {err ? <p className="text-sm text-red-600">{err}</p> : null}

      <section className="space-y-4">
        {st === "rider_assigned" && !del.rider_accepted_at ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={Sam.btn.primary} onClick={() => void patchOrder({ action: "accept" })}>
              수락
            </button>
            <button
              type="button"
              className={Sam.btn.secondary}
              onClick={() => {
                const reason = window.prompt("거절 사유(선택)") ?? "";
                void patchOrder({ action: "decline", reason: reason.trim() || undefined });
              }}
            >
              거절
            </button>
          </div>
        ) : null}

        {st === "rider_assigned" && del.rider_accepted_at ? (
          <button
            type="button"
            className={`${Sam.btn.primary} w-full`}
            onClick={() => void patchOrder({ action: "set_delivery_status", delivery_status: "pickup_in_progress" })}
          >
            출발 (매장으로)
          </button>
        ) : null}

        {st === "pickup_in_progress" ? (
          <button
            type="button"
            className={`${Sam.btn.primary} w-full`}
            onClick={() => void patchOrder({ action: "set_delivery_status", delivery_status: "delivering" })}
          >
            픽업 완료 · 배달 출발
          </button>
        ) : null}

        {(st === "pickup_in_progress" || st === "delivering") && !failureReported ? (
          <div className={`${Sam.card.base} ${Sam.card.pad} space-y-2`}>
            <p className={`${Sam.text.sectionTitle} text-sm`}>실패 보고 (관리자 확정 전)</p>
            <input
              type="text"
              value={failReason}
              onChange={(e) => setFailReason(e.target.value)}
              placeholder="실패 사유 (필수)"
              className={`${Sam.input.base} w-full text-sm`}
            />
            <textarea
              value={failNote}
              onChange={(e) => setFailNote(e.target.value)}
              placeholder="추가 메모"
              rows={2}
              className={`${Sam.input.base} w-full text-sm`}
            />
            <label className={`block text-xs ${Sam.text.bodySecondary}`}>
              증빙 사진 (선택)
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="mt-1 block w-full text-xs"
                disabled={failBusy}
                onChange={(e) => void onPickFailurePhoto(e.target.files)}
              />
            </label>
            {failImgPath ? <p className="text-xs text-sam-muted">증빙 경로 업로드됨</p> : null}
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
              실패 보고 제출
            </button>
          </div>
        ) : null}

        {st === "delivering" ? (
          <div className="flex flex-col gap-3">
            <button type="button" className={Sam.btn.secondary} onClick={() => void patchOrder({ action: "customer_arrived" })}>
              고객 도착
            </button>
            <div className={`${Sam.card.base} ${Sam.card.pad} space-y-2`}>
              <p className={`${Sam.text.sectionTitle} text-sm`}>배달 완료 증명 (선택)</p>
              <label className={`block text-xs ${Sam.text.bodySecondary}`}>
                완료 사진 (선택)
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="mt-1 block w-full text-xs"
                  disabled={podBusy}
                  onChange={(e) => void onPickDeliveryPhoto(e.target.files)}
                />
              </label>
              {podImgPath ? <p className="text-xs text-sam-muted">증빙 경로 업로드됨</p> : null}
              <input
                type="text"
                value={receiverName}
                onChange={(e) => setReceiverName(e.target.value)}
                placeholder="수령자 이름 (선택)"
                className={`${Sam.input.base} w-full text-sm`}
              />
              <textarea
                value={podNote}
                onChange={(e) => setPodNote(e.target.value)}
                placeholder="메모 (선택)"
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
                배달 완료
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <p className={`${Sam.text.helper} text-xs`}>
        진행 중에는 약 30초마다 위치를 올립니다. 완료 시 라이더 최근 좌표가 가능하면 POD 위치로 저장됩니다.
      </p>
    </div>
  );
}
