"use client";

import { ShieldCheck } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { buildCrewRepView, CREW_REP_MAX, type CrewRepView } from "@/lib/trust/crew-rep";

/**
 * CREW REP 표시 컴포넌트 — 회원·상대방 모든 표면이 이 파일 하나를 쓴다 (설계 §4.1).
 * - `CrewRepBadge`: 상대방·목록용 한 줄 (`CREW REP 81` + 등급 색 막대 + 등급 칩)
 * - `CrewRepBar`: 0~100 가로 막대
 * - `CrewRepCard`: 내 CREW REP 상세 카드
 */

function useView(score: number): CrewRepView {
  return buildCrewRepView(score);
}

export function CrewRepBar({
  score,
  className = "",
  thin = false,
}: {
  score: number;
  className?: string;
  thin?: boolean;
}) {
  const v = useView(score);
  return (
    <span
      aria-hidden
      className={`block overflow-hidden rounded-full bg-sam-surface-muted ${thin ? "h-1.5" : "h-2.5"} ${className}`}
    >
      <span className="block h-full rounded-full" style={{ width: `${v.score}%`, backgroundColor: v.color }} />
    </span>
  );
}

export function CrewRepTierChip({ score, className = "" }: { score: number; className?: string }) {
  const { t } = useI18n();
  const v = useView(score);
  return (
    <span
      className={`inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[11px] font-bold leading-none text-white ${className}`}
      style={{ backgroundColor: v.color }}
      data-testid="crew-rep-tier-chip"
    >
      {t(v.labelKey)}
    </span>
  );
}

/**
 * 한 줄 배지. `compact` = 좁은 머리글(숫자 + 짧은 막대만).
 */
export function CrewRepBadge({
  score,
  variant = "full",
  className = "",
}: {
  score: number;
  variant?: "full" | "compact";
  className?: string;
}) {
  const { t } = useI18n();
  const v = useView(score);
  const aria = t("crew_rep_score_aria", { score: v.score, tier: t(v.labelKey) });
  if (variant === "compact") {
    return (
      <span className={`inline-flex shrink-0 items-center gap-1 ${className}`} aria-label={aria} data-testid="crew-rep-badge">
        <span className="text-[12px] font-bold tabular-nums leading-none" style={{ color: v.color }}>
          {v.score}
        </span>
        <CrewRepBar score={v.score} thin className="w-6" />
      </span>
    );
  }
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 ${className}`} aria-label={aria} data-testid="crew-rep-badge">
      <span className="text-[11px] font-semibold leading-none text-sam-muted">{t("crew_rep_name")}</span>
      <span className="text-[13px] font-bold tabular-nums leading-none" style={{ color: v.color }}>
        {v.score}
      </span>
      <CrewRepBar score={v.score} thin className="w-8" />
      <CrewRepTierChip score={v.score} />
    </span>
  );
}

export function CrewRepIcon({ score, className = "h-5 w-5" }: { score: number; className?: string }) {
  const v = useView(score);
  return <ShieldCheck aria-hidden className={className} style={{ color: v.color }} strokeWidth={2} />;
}

/** 내 CREW REP 상세 카드 (`/mypage/trust`). */
export function CrewRepCard({ score }: { score: number }) {
  const { t } = useI18n();
  const v = useView(score);
  return (
    <div className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4" data-testid="crew-rep-card">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-ui-rect bg-sam-surface-muted">
          <CrewRepIcon score={v.score} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold tracking-wide text-sam-fg">{t("crew_rep_name")}</span>
          <span className="block text-[12px] text-sam-muted">{t("crew_rep_subtitle")}</span>
        </span>
        <CrewRepTierChip score={v.score} />
        <span className="shrink-0 tabular-nums" data-testid="mypage-trust-score">
          <span className="text-[26px] font-extrabold leading-none" style={{ color: v.color }}>
            {v.score}
          </span>
          <span className="ml-0.5 text-[12px] font-semibold text-sam-muted">/ {CREW_REP_MAX}</span>
        </span>
      </div>
      <CrewRepBar score={v.score} className="mt-3" />
      <div className="mt-1 flex justify-between text-[11px] text-sam-muted">
        <span>{t("crew_rep_scale_low")}</span>
        <span>{t("crew_rep_scale_high")}</span>
      </div>
    </div>
  );
}
