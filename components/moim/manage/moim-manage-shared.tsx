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
import { moimCls } from "@/components/moim/moim-ui";
import { moimApi, moimErrorKey, moimRoutes } from "@/lib/moim/moim-client-api";
import { MOIM_LIST_CAP, type MoimApiResult, type MoimDetailDto } from "@/lib/moim/moim-api-types";

/**
 * 모임 운영 화면 공통 — 상세 불러오기·머리글·로딩/오류/권한 없음·토스트·사람 행.
 * 사람은 모임 닉네임·사진만 보여 준다 (설계 §4).
 */

/** 모임장 위임 화면 — 권한이 있거나, 모임장인데 경고 때문에 막힌 경우(이유를 보여 주기 위해) */
export function canOpenMoimTransfer(detail: MoimDetailDto): boolean {
  return detail.can.transfer_host || (detail.viewer.role === "host" && detail.status === "active" && detail.platformState === "warned");
}

/** P8 미접속 모임장 변경 요청 — 부모임장·운영진, 운영 중인 모임 (모임장 30일 미접속 판정은 서버) */
export function canRequestMoimHostChange(detail: MoimDetailDto): boolean {
  return (detail.viewer.role === "co_host" || detail.viewer.role === "staff") && detail.status === "active";
}

export function canOpenMoimMembers(detail: MoimDetailDto): boolean {
  const c = detail.can;
  return c.remove_member || c.ban_member || c.set_role || c.write_note;
}

/**
 * 운영 허브(`/moim/[id]/manage`)에 들어갈 항목이 하나라도 있는가 — 허브 항목 조건과 같다(없으면 허브는 「권한 없음」).
 * R4 #17: 바로 연 운영 화면의 뒤로는 이 값이 false 면 허브 대신 모임 홈으로.
 */
export function canOpenMoimManageHub(detail: MoimDetailDto): boolean {
  const c = detail.can;
  return (
    c.decide_join ||
    canOpenMoimMembers(detail) ||
    c.edit_info ||
    c.manage_invite_link ||
    c.send_invite ||
    c.manage_boards ||
    c.hide_post ||
    canOpenMoimTransfer(detail) ||
    canRequestMoimHostChange(detail) ||
    c.close
  );
}

/** R4 #17: 운영 화면 뒤로 — 지정값 > (상세를 받았고 허브 권한이 없으면) 모임 홈 > 운영 허브 */
export function moimManageBackHref(moimId: string, backHref: string | undefined, detail: MoimDetailDto | null): string {
  if (backHref) return backHref;
  if (detail && !canOpenMoimManageHub(detail)) return moimRoutes.home(moimId);
  return moimRoutes.manage(moimId);
}

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
  stickyFooter = false,
}: {
  moimId: string;
  titleKey: MessageKey;
  backHref?: string;
  allow: (detail: MoimDetailDto) => boolean;
  children: (ctx: MoimManageCtx) => ReactNode;
  /** 본문 끝에 MoimStickyFooter(하단 고정 저장 줄)가 있으면 아래 여백을 두지 않는다 — 줄이 화면 아래에 붙게 (감사 F9) */
  stickyFooter?: boolean;
}) {
  /** 처음 열 때는 화면 간 공유 상세를 쓰고, 다시 불러오기(재시도·충돌 뒤)는 저장값을 무시한다 (감사 E2 · 재감사 M2) */
  const loadedOnce = useRef(false);
  const load = useCallback(() => {
    const force = loadedOnce.current;
    loadedOnce.current = true;
    return moimApi.detail(moimId, { force });
  }, [moimId]);
  const { state, reload } = useMoimResource(load);
  const loadedDetail = state.status === "ready" ? state.data.moim : null;
  const resolvedBack = moimManageBackHref(moimId, backHref, loadedDetail);
  const tier1 = useMemo<MainTier1Partial>(() => ({ titleText: titleKey, backHref: resolvedBack }), [resolvedBack, titleKey]);
  useRegisterMainTier1Header(tier1);

  return (
    <div className={`min-h-[60vh] bg-sam-app ${stickyFooter ? "" : "pb-24"}`}>
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
      <button type="button" className={`${moimCls.btnSecondary} ${moimCls.btnSm}`} onClick={onRetry}>
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
      <Link href={moimRoutes.home(moimId)} className={`${moimCls.btnSecondary} ${moimCls.btnSm} mt-2`}>
        {t("moim_manage_back_to_group_btn")}
      </Link>
    </div>
  );
}

/** R4 #6: 목록이 상한(500)에 닿았을 때 한 줄 안내 */
export function MoimListCappedHint({ show }: { show: boolean | undefined }) {
  const { t } = useI18n();
  if (!show) return null;
  return <p className="px-4 pt-2 text-[12px] text-sam-meta">{t("moim_list_capped_hint", { count: MOIM_LIST_CAP })}</p>;
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

/** 역할 배지·아바타·역할 키는 모임 공용 부품 하나 (D-8 · R3 U-08) — 운영 화면은 여기서 다시 내보낸다 */
export { MoimAvatar, MoimRoleBadge, moimRoleKey } from "@/components/moim/moim-ui";

/** 영어 단수 — 수가 1이면 `_one` 키 (모임 선례 `formatMoimCount` 와 같은 방식 · R3 U-09) */
export function moimCountKey(count: number, other: MessageKey, one: MessageKey): MessageKey {
  return count === 1 ? one : other;
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
/** 시트·다이얼로그 안 입력·선택 카드 — 12px (LOCKED `04-DESIGN-SYSTEM.md` 「시트·다이얼로그 안 버튼·카드·입력」 · R3 U-07) */
export const moimManageSheetRadius = "rounded-[length:var(--overlay-radius-md)]";
export const moimManageSheetInputClass = `${Sam.input.base} w-full ${moimManageSheetRadius}`;
export const moimManageSheetTextareaClass = `${Sam.input.textarea} w-full ${moimManageSheetRadius}`;
export const moimManageSectionTitleClass = "px-4 pb-2 pt-5 text-[13px] font-semibold text-sam-muted";
