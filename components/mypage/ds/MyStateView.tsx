"use client";

import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SellerHubEmptyState } from "@/components/mypage/seller/SellerHubEmptyState";
import { Sam } from "@/lib/ui/sam-component-classes";
import { MYPAGE_COLUMN_MAX_WIDTH_CLASS, MYPAGE_GUTTER_X_CLASS } from "@/lib/ui/mypage-responsive-breakpoints";

/**
 * 화면 유형 (최종 설계 §1.2 `MyScreen.template` · §1.5 스켈레톤 표)
 * list=T1 · detail=T2 · form=T3 · settings=T4 · hub=T5 · board=T6 · asset=자산 · static=정적(스켈레톤 없음)
 */
export type MyScreenTemplate = "list" | "detail" | "form" | "settings" | "hub" | "board" | "asset" | "static";

export type MyStateEmpty = {
  icon?: ReactNode;
  title: string;
  body?: string;
  /** 주 CTA 0~1 (버튼·링크 노드) */
  cta?: ReactNode;
};

export type MyStateError = {
  /** 생략 시 공통 문구 */
  message?: string;
  onRetry: () => void;
};

export type MyStateViewProps = {
  kind: "loading" | "empty" | "error";
  template?: MyScreenTemplate;
  /** 스켈레톤 행 수 (list·board·asset·form·settings) — 기본 5 */
  rows?: number;
  /** T1 목록 모양 — thumb = 56×56 썸네일 행, text = 텍스트 행(기본) */
  listVariant?: "thumb" | "text";
  /** T4 설정 — 행 제목은 실제 텍스트로 먼저 그림(토글 자리만 스켈레톤) */
  rowLabels?: readonly string[];
  empty?: MyStateEmpty;
  error?: MyStateError;
};

/** 스켈레톤 블록 — `bg-sam-border-soft/70` + `rounded-ui-rect`, reduced-motion 이면 정지 */
const BONE = "rounded-ui-rect bg-sam-border-soft/70 motion-safe:animate-pulse";
const ROW_SHELL = "flex min-h-[52px] items-center gap-3 border-t border-sam-border-soft px-4 py-3 first:border-t-0 md:px-5";
const SURFACE = "overflow-hidden rounded-ui-rect border border-sam-border-soft bg-sam-surface";

function ListRows({ rows, variant }: { rows: number; variant: "thumb" | "text" }) {
  return (
    <div className={SURFACE}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={ROW_SHELL} data-skeleton-row="">
          {variant === "thumb" ? <span className={`h-14 w-14 shrink-0 ${BONE}`} /> : null}
          <span className="flex min-w-0 flex-1 flex-col gap-2">
            <span className={`h-3.5 ${variant === "thumb" ? "w-[60%]" : "w-[70%]"} ${BONE}`} />
            <span className={`h-3 w-[40%] ${BONE}`} />
          </span>
          {variant === "thumb" ? <span className={`h-3.5 w-12 shrink-0 ${BONE}`} /> : null}
        </div>
      ))}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <div className={`${SURFACE} flex flex-col gap-2 px-4 py-4 md:px-5`} data-skeleton-summary="">
        <span className={`h-3 w-[40%] ${BONE}`} />
        <span className={`h-5 w-[70%] ${BONE}`} />
      </div>
      {[0, 1].map((s) => (
        <div key={s} className={SURFACE} data-skeleton-section="">
          <div className="px-4 pb-2 pt-4 md:px-5">
            <span className={`block h-3 w-24 ${BONE}`} />
          </div>
          {[0, 1, 2].map((r) => (
            <div key={r} className={ROW_SHELL} data-skeleton-row="">
              <span className={`h-3.5 w-[35%] ${BONE}`} />
              <span className="flex-1" />
              <span className={`h-3.5 w-[25%] ${BONE}`} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function FormSkeleton({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex flex-col gap-2" data-skeleton-row="">
          <span className={`h-3 w-20 ${BONE}`} />
          <span className="block h-[46px] w-full rounded-ui-rect border border-sam-border-soft bg-sam-surface px-3 py-3">
            <span className={`block h-full w-[45%] ${BONE}`} />
          </span>
        </div>
      ))}
    </div>
  );
}

function SettingsSkeleton({ rows, rowLabels }: { rows: number; rowLabels?: readonly string[] }) {
  const count = rowLabels?.length ? rowLabels.length : rows;
  return (
    <div className={SURFACE}>
      {Array.from({ length: count }, (_, i) => {
        const label = rowLabels?.[i];
        return (
          <div key={i} className={ROW_SHELL} data-skeleton-row="">
            {label ? (
              <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-sam-fg">{label}</span>
            ) : (
              <span className="flex-1">
                <span className={`block h-3.5 w-[50%] ${BONE}`} />
              </span>
            )}
            <span className="h-[31px] w-[51px] shrink-0 rounded-full bg-sam-border-soft/70 motion-safe:animate-pulse" />
          </div>
        );
      })}
    </div>
  );
}

function HubSkeleton() {
  return (
    <div className={`${SURFACE} flex flex-col gap-2 px-4 py-4 md:px-5`} data-skeleton-summary="">
      <span className={`h-3 w-[30%] ${BONE}`} />
      <span className={`h-6 w-[50%] ${BONE}`} />
    </div>
  );
}

function AssetSkeleton({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col gap-2">
      <div className={`${SURFACE} flex flex-col gap-3 px-4 py-4 md:px-5`} data-skeleton-summary="">
        <span className={`h-7 w-[120px] ${BONE}`} />
        <span className={`h-3 w-[45%] ${BONE}`} />
      </div>
      <ListRows rows={rows} variant="text" />
    </div>
  );
}

export function MyStateSkeleton({
  template = "list",
  rows = 5,
  listVariant = "text",
  rowLabels,
}: Pick<MyStateViewProps, "template" | "rows" | "listVariant" | "rowLabels">) {
  const n = Math.max(1, Math.floor(rows));
  let body: ReactNode;
  switch (template) {
    case "static":
      return null;
    case "detail":
      body = <DetailSkeleton />;
      break;
    case "form":
      body = <FormSkeleton rows={n} />;
      break;
    case "settings":
      body = <SettingsSkeleton rows={n} rowLabels={rowLabels} />;
      break;
    case "hub":
      body = <HubSkeleton />;
      break;
    case "asset":
      body = <AssetSkeleton rows={n} />;
      break;
    case "board":
      body = <ListRows rows={n} variant="text" />;
      break;
    case "list":
    default:
      body = <ListRows rows={n} variant={listVariant} />;
      break;
  }
  return (
    <div aria-busy="true" data-testid="my-state-loading" data-template={template}>
      {body}
    </div>
  );
}

/**
 * 라우트 `Suspense`·`loading.tsx` 대체 화면 (설계서 §4 ③) — `MyScreen` 본문 열(40rem·16/20px)과 같은 자리에
 * 화면 유형 스켈레톤만 그린다. 헤더는 1단 셸이 경로 표 제목으로 즉시 그리므로 여기서 그리지 않는다.
 * 피드 스켈레톤(`MainFeedRouteLoading`)·임의 `pt-16` 여백 대체용.
 */
export function MyRouteSkeleton(props: Pick<MyStateViewProps, "template" | "rows" | "listVariant" | "rowLabels">) {
  return (
    <div
      className={`mx-auto w-full min-w-0 ${MYPAGE_COLUMN_MAX_WIDTH_CLASS} ${MYPAGE_GUTTER_X_CLASS} pt-2`}
      data-testid="my-route-skeleton"
    >
      <MyStateSkeleton {...props} />
    </div>
  );
}

/**
 * 스켈레톤 n행 / 빈 / 오류+재시도 (최종 설계 §1.2·§1.5·§1.6).
 * 오류를 빈 목록·0 으로 표시하지 않는다 — 실패는 항상 `kind="error"`.
 */
export function MyStateView(props: MyStateViewProps) {
  const { t } = useI18n();
  const { kind } = props;

  if (kind === "loading") {
    return (
      <MyStateSkeleton
        template={props.template}
        rows={props.rows}
        listVariant={props.listVariant}
        rowLabels={props.rowLabels}
      />
    );
  }

  if (kind === "empty") {
    const empty = props.empty;
    return (
      <div data-testid="my-state-empty" className="flex flex-col items-center">
        {empty?.icon ? (
          <span className="mt-10 flex h-12 w-12 items-center justify-center rounded-full bg-sam-icon-surface text-sam-primary">
            {empty.icon}
          </span>
        ) : null}
        <SellerHubEmptyState message={empty?.title ?? ""} hint={empty?.body} actions={empty?.cta} />
      </div>
    );
  }

  const error = props.error;
  return (
    <div
      role="alert"
      data-testid="my-state-error"
      className="flex flex-col items-center justify-center gap-3 px-4 pb-12 pt-10 text-center"
    >
      {/* 빈 상태 아이콘과 같은 48px 원형 — 위험 토큰 */}
      <span
        aria-hidden
        data-testid="my-state-error-icon"
        className="mb-9 flex h-12 w-12 items-center justify-center rounded-full bg-sam-danger-soft text-sam-danger"
      >
        <AlertCircle className="h-6 w-6" />
      </span>
      <p className="sam-text-body text-sam-fg">{error?.message?.trim() || t("mypage_comp_ds_error_default")}</p>
      {error?.onRetry ? (
        <button
          type="button"
          data-testid="my-state-retry"
          onClick={error.onRetry}
          className={`${Sam.btn.secondaryCombo} ${Sam.focusRing} min-w-[120px]`}
        >
          {t("common_retry")}
        </button>
      ) : null}
    </div>
  );
}
