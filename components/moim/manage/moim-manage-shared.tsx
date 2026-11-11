"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayToast, type DibayToastTone } from "@/components/ui/dibay-overlay";
import { useRegisterMainTier1Header } from "@/lib/layout/use-register-main-tier1-header";
import type { MainTier1Partial } from "@/contexts/MainTier1ExtrasContext";
import type { MessageKey } from "@/lib/i18n/messages";
import { DIBAY_TOAST_MS } from "@/lib/ui/dibay-overlay-contract";
import { Sam } from "@/lib/ui/sam-component-classes";
import { moimApi, moimErrorKey, moimRoutes } from "@/lib/moim/moim-client-api";
import type { MoimApiResult, MoimDetailDto } from "@/lib/moim/moim-api-types";
import type { MoimRole } from "@/lib/moim/moim-permission-contract";

/**
 * 모임 운영 화면 공통 — 상세 불러오기·머리글·로딩/오류/권한 없음·토스트·사람 행.
 * 사람은 모임 닉네임·사진만 보여 준다 (설계 §4).
 */

type ResourceState<T> = { status: "loading" } | { status: "error"; errorKey: MessageKey } | { status: "ready"; data: T };

/** API 하나를 불러오고 reload() 로 다시 불러온다. `load` 는 호출 측에서 useCallback 으로 고정한다. */
export function useMoimResource<T>(load: () => Promise<MoimApiResult<T>>) {
  const [state, setState] = useState<ResourceState<T>>({ status: "loading" });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let alive = true;
    void load().then((r) => {
      if (!alive) return;
      if (r.ok) setState({ status: "ready", data: r as T });
      else setState({ status: "error", errorKey: moimErrorKey(r.error) });
    });
    return () => {
      alive = false;
    };
  }, [load, nonce]);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { state, reload };
}

export type MoimManageCtx = { detail: MoimDetailDto; reload: () => void };

/** 운영 화면 틀 — 머리글 등록 + 모임 상세 + 권한 판정. allow(detail) 가 false 면 권한 없음 화면. */
export function MoimManageFrame({
  moimId,
  titleKey,
  backHref,
  allow,
  children,
}: {
  moimId: string;
  titleKey: MessageKey;
  backHref?: string;
  allow: (detail: MoimDetailDto) => boolean;
  children: (ctx: MoimManageCtx) => ReactNode;
}) {
  const tier1 = useMemo<MainTier1Partial>(
    () => ({ titleText: titleKey, backHref: backHref ?? moimRoutes.manage(moimId) }),
    [backHref, moimId, titleKey]
  );
  useRegisterMainTier1Header(tier1);
  const load = useCallback(() => moimApi.detail(moimId), [moimId]);
  const { state, reload } = useMoimResource(load);

  return (
    <div className="min-h-[60vh] bg-sam-app pb-24">
      {state.status === "loading" ? <MoimManageLoading /> : null}
      {state.status === "error" ? <MoimManageError errorKey={state.errorKey} onRetry={reload} /> : null}
      {state.status === "ready" ? (
        allow(state.data.moim) ? (
          children({ detail: state.data.moim, reload })
        ) : (
          <MoimManageForbidden moimId={moimId} />
        )
      ) : null}
    </div>
  );
}

export function MoimManageLoading() {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-center px-4 py-16" role="status" aria-live="polite">
      <p className="text-[14px] text-sam-muted">{t("moim_manage_loading")}</p>
    </div>
  );
}

export function MoimManageError({ errorKey, onRetry }: { errorKey: MessageKey; onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
      <p className="text-[14px] text-sam-fg">{t(errorKey)}</p>
      <button type="button" className={`${Sam.btn.secondaryCombo} ${Sam.btn.sm} rounded-ui-rect`} onClick={onRetry}>
        {t("moim_manage_retry_btn")}
      </button>
    </div>
  );
}

export function MoimManageForbidden({ moimId }: { moimId: string }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
      <p className="text-[16px] font-semibold text-sam-fg">{t("moim_manage_forbidden_title")}</p>
      <p className="text-[14px] text-sam-muted">{t("moim_manage_forbidden_body")}</p>
      <Link href={moimRoutes.home(moimId)} className={`${Sam.btn.secondaryCombo} ${Sam.btn.sm} mt-2 rounded-ui-rect`}>
        {t("moim_manage_back_to_group_btn")}
      </Link>
    </div>
  );
}

export function MoimManageEmpty({ textKey }: { textKey: MessageKey }) {
  const { t } = useI18n();
  return <p className="px-4 py-12 text-center text-[14px] text-sam-muted">{t(textKey)}</p>;
}

/** 화면 안 토스트 1개 — show(문구, 톤) */
export function useMoimManageToast() {
  const { t } = useI18n();
  const [toast, setToast] = useState<{ message: string; tone: DibayToastTone; seq: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );
  const show = useCallback((message: string, tone: DibayToastTone = "default") => {
    if (timer.current) clearTimeout(timer.current);
    setToast((prev) => ({ message, tone, seq: (prev?.seq ?? 0) + 1 }));
    timer.current = setTimeout(() => setToast(null), DIBAY_TOAST_MS);
  }, []);
  const showError = useCallback((error: string | undefined) => show(t(moimErrorKey(error)), "error"), [show, t]);
  const node = toast ? <DibayToast key={toast.seq} message={toast.message} tone={toast.tone} /> : null;
  return { node, show, showError };
}

export function MoimAvatar({ url, name, size = 40 }: { url: string | null; name: string; size?: number }) {
  const initial = (name.trim()[0] ?? "").toUpperCase();
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- 모임 프로필 사진(외부 저장소 URL)
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full border border-sam-border-soft bg-sam-surface-muted object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full bg-sam-primary-soft text-[15px] font-semibold text-sam-primary"
      style={{ width: size, height: size }}
    >
      {initial}
    </span>
  );
}

const ROLE_BADGE_CLASS: Record<MoimRole, string | null> = {
  host: Sam.badge.primary,
  co_host: Sam.badge.info,
  staff: Sam.badge.info,
  member: null,
};

export function MoimRoleBadge({ role }: { role: MoimRole }) {
  const { t } = useI18n();
  const cls = ROLE_BADGE_CLASS[role];
  if (!cls) return null;
  return <span className={`${cls} shrink-0 whitespace-nowrap`}>{t(`moim_role_${role}` as MessageKey)}</span>;
}

export function moimRoleKey(role: MoimRole): MessageKey {
  return `moim_role_${role}` as MessageKey;
}

/** 날짜만 (필리핀 시간 기준) */
export function useMoimDateFormat() {
  const { language } = useI18n();
  return useCallback(
    (iso: string | null | undefined) => {
      if (!iso) return "";
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "";
      return d.toLocaleDateString(language, { timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric" });
    },
    [language]
  );
}

export const moimManageCardClass = "rounded-ui-rect border border-sam-border bg-sam-surface";
export const moimManageInputClass = `${Sam.input.base} w-full rounded-ui-rect`;
export const moimManageTextareaClass = `${Sam.input.textarea} w-full rounded-ui-rect`;
export const moimManageSectionTitleClass = "px-4 pb-2 pt-5 text-[13px] font-semibold text-sam-muted";
