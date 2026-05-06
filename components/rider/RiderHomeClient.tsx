"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Sam } from "@/lib/ui/sam-component-classes";

type RiderRow = {
  id: string;
  is_online: boolean | null;
  rider_status: string | null;
  last_active_at?: string | null;
};

export function RiderHomeClient() {
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
      setErr(j.error ?? "불러오기 실패");
      setRider(null);
      setCounts(null);
      return;
    }
    setRider(j.rider ?? null);
    setCounts(j.counts ?? null);
  }, []);

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
      setErr(j.error ?? "상태 변경 실패");
      return;
    }
    if (j.rider) setRider(j.rider);
  };

  if (loading) {
    return (
      <div className={`${Sam.page} bg-sam-app min-h-[70vh] flex items-center justify-center text-sam-muted`}>
        불러오는 중…
      </div>
    );
  }

  if (err === "rider_profile_not_found" || err === "unauthorized") {
    return (
      <div className={`${Sam.page} bg-sam-app min-h-[70vh] px-4 py-8 max-w-md mx-auto`}>
        <h1 className={Sam.text.pageTitle}>라이더 센터</h1>
        <p className={`mt-3 ${Sam.text.bodySecondary}`}>
          {err === "unauthorized"
            ? "로그인 후 이용할 수 있습니다."
            : "이 계정은 라이더로 등록되어 있지 않습니다. 관리자에게 문의하세요."}
        </p>
        <Link href="/login" className={`mt-6 inline-flex ${Sam.btn.primary}`}>
          로그인
        </Link>
      </div>
    );
  }

  return (
    <div className={`${Sam.page} bg-sam-app min-h-[70vh] px-4 py-6 max-w-lg mx-auto space-y-6`}>
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className={Sam.text.pageTitle}>라이더</h1>
          <p className={`mt-1 ${Sam.text.bodySecondary}`}>온라인 상태와 배달 목록을 관리합니다.</p>
        </div>
        <Link href="/rider/orders" className={`${Sam.btn.secondary} shrink-0 text-sm`}>
          주문 목록
        </Link>
      </header>

      {err ? <p className="text-sm text-red-600">{err}</p> : null}

      {rider ? (
        <section className={`${Sam.card.base} ${Sam.card.pad}`}>
          <h2 className={Sam.text.sectionTitle}>내 상태</h2>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <dt className="text-sam-muted">온라인</dt>
            <dd className="text-sam-fg">{rider.is_online ? "예" : "아니오"}</dd>
            <dt className="text-sam-muted">모드</dt>
            <dd className="text-sam-fg">{rider.rider_status ?? "—"}</dd>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className={Sam.btn.primary}
              disabled={rider.is_online === true}
              onClick={() => void patchStatus({ is_online: true, rider_status: "active" })}
            >
              온라인
            </button>
            <button
              type="button"
              className={Sam.btn.secondary}
              disabled={rider.is_online === false}
              onClick={() => void patchStatus({ is_online: false })}
            >
              오프라인
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={Sam.btn.secondary} onClick={() => void patchStatus({ rider_status: "active" })}>
              업무(active)
            </button>
            <button type="button" className={Sam.btn.secondary} onClick={() => void patchStatus({ rider_status: "delivering" })}>
              배달중 표시
            </button>
            <button type="button" className={Sam.btn.secondary} onClick={() => void patchStatus({ rider_status: "on_break" })}>
              휴식
            </button>
          </div>
        </section>
      ) : null}

      {counts ? (
        <section className={`${Sam.card.base} ${Sam.card.pad}`}>
          <h2 className={Sam.text.sectionTitle}>오늘 요약</h2>
          <ul className={`mt-3 space-y-2 ${Sam.text.body}`}>
            <li>대기 배차: {counts.queue}</li>
            <li>진행 중: {counts.active}</li>
            <li>오늘 완료: {counts.delivered_today}</li>
          </ul>
        </section>
      ) : null}

      <button type="button" className={`${Sam.btn.secondary} w-full`} onClick={() => void load()}>
        새로고침
      </button>
    </div>
  );
}
