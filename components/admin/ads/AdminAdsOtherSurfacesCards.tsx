"use client";

import { useEffect, useState } from "react";
import { AdminActionLink } from "@/components/admin/ui/AdminActionButton";

/**
 * Owner 결정 O-5 (2026-11-03): 「전체 광고」 위 바로가기 카드 — 공통 목록에 없는 광고 4종(인트로·당겨서 새로고침·
 * 마이페이지 배너·이벤트)을 이 화면에서도 보고 들어가게 한다. 읽기 전용 요약 + 「관리」(각 화면이 정본 · 새 원장 없음 · M2 카드 형태).
 */
type Summary = {
  intro: { state: string; live: boolean };
  ptrLive: number | null;
  mypageBannersLive: number | null;
  eventsLive: number | null;
};

const INTRO_STATE_KO: Record<string, string> = { active: "게시 중", paused: "일시정지", unpublished: "게시 안 함" };
const INTRO_STATE_EN: Record<string, string> = { active: "Live", paused: "Paused", unpublished: "Not published" };

export function AdminAdsOtherSurfacesCards({ ko }: { ko: boolean }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    void fetch("/api/admin/advertising/other-surfaces", { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { ok?: boolean } & Partial<Summary>) => {
        if (!alive) return;
        if (j.ok && j.intro) setSummary(j as Summary);
        else setFailed(true);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  const liveText = (n: number | null | undefined) =>
    summary == null ? (failed ? (ko ? "불러오지 못함" : "Unavailable") : "…") : n == null ? (ko ? "확인 못 함" : "Unknown") : ko ? `노출 중 ${n}개` : `${n} live`;
  const cards = [
    {
      key: "intro",
      title: ko ? "인트로" : "Launch intro",
      statusText:
        summary == null
          ? liveText(null)
          : (ko ? INTRO_STATE_KO : INTRO_STATE_EN)[summary.intro.state] ?? (ko ? "확인 못 함" : "Unknown"),
      href: "/admin/platform-promotion/intro",
    },
    { key: "ptr", title: ko ? "당겨서 새로고침 광고" : "Pull-to-refresh ads", statusText: liveText(summary?.ptrLive), href: "/admin/ptr-reveal-ads" },
    { key: "mypage", title: ko ? "마이페이지 배너" : "My page banner", statusText: liveText(summary?.mypageBannersLive), href: "/admin/my/banners" },
    { key: "events", title: ko ? "이벤트" : "Events", statusText: liveText(summary?.eventsLive), href: "/admin/platform-events" },
  ];

  return (
    <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" data-admin-ads-other-surfaces="">
      {cards.map((c) => (
        <div
          key={c.key}
          className="flex items-center justify-between gap-2 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2.5"
          data-admin-ads-other-surface={c.key}
        >
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold text-sam-fg">{c.title}</p>
            <p className="text-[12px] text-sam-muted">{c.statusText}</p>
          </div>
          <AdminActionLink href={c.href} variant="secondary" size="sm">
            {ko ? "관리" : "Manage"}
          </AdminActionLink>
        </div>
      ))}
    </section>
  );
}
