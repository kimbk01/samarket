"use client";

/**
 * 고객센터 문의 호스트 — 접수형(티켓) (Owner 「접수형 1단계」 2026-11-10).
 * 고객센터 문의와 채팅은 별도 운영: 말풍선·실시간 대화 없이 쓰기 → 접수 완료 → 내 문의(질문·답변).
 *
 * - 진입: FAB·허브·맥락 CTA·푸시·알림함 모두 `deliverSupportOpen` → 이 호스트(전체 화면).
 * - caseId 없음 = 쓰기, caseId 있음 = 문의 상세. 접수 직후 = 접수 완료 화면.
 * - 비로그인(세션 없음·401) = 로그인/회원가입 안내 — 맥락을 저장해 로그인 후 같은 화면에서 다시 연다.
 */

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayPendingSpinner } from "@/components/ui/DibaySpinner";
import { SupportSheetShell } from "@/components/support/SupportSheetShell";
import {
  SupportTicketCompose,
  SupportTicketDetail,
  SupportTicketHeader,
  SupportTicketLogin,
  SupportTicketSubmitted,
  type SupportTicketSubmittedInfo,
} from "@/components/support/SupportTicketViews";
import { getCurrentUser, getCurrentUserIdForDb } from "@/lib/auth/get-current-user";
import type { SupportContext } from "@/lib/support/support-context";
import {
  SUPPORT_CONTEXT_SESSION_KEY,
  buildGenericSupportTriageContext,
  isSupportContextEnabled,
} from "@/lib/support/support-context";
import { deliverSupportOpen } from "@/lib/support/deliver-support-open";
import {
  clearPendingSupportContext,
  consumeSupportModalRestoreCaseId,
  readPendingSupportContext,
  stashSupportModalRestoreCaseId,
} from "@/lib/support/open-support-center";
import {
  closeSupportModal,
  getSupportModalState,
  resetSupportModalToStart,
  setSupportModalCaseId,
  subscribeSupportModalState,
  type SupportModalState,
} from "@/lib/support/support-modal-controller";
import { useSupportCategoryLabels } from "@/lib/support/use-support-category-settings";
import { useSupportModalMainBottomNavSuppress } from "@/lib/support/support-modal-main-bottom-nav-suppress";
import {
  buildSupportTicketOpenPayload,
  clearSupportTicketDraft,
  type SupportTicketFormState,
} from "@/lib/support/support-ticket-form";
import {
  SUPPORT_BACK_PRIORITY,
  SupportModalBackContext,
  createSupportModalBackRegistry,
} from "@/components/support/support-modal-back-steps";

const HISTORY_KEY = "dibaySupportModal";

type AuthState = "checking" | "in" | "out";

function supportTicketMineHref(info: { audience: "MEMBER" | "OWNER"; storeId: string | null }): string {
  if (info.audience === "OWNER" && info.storeId) {
    return `/stores/owner/customer-care/customer-center?storeId=${encodeURIComponent(info.storeId)}`;
  }
  return "/mypage/support-history";
}

export function SupportModalHost() {
  const { t } = useI18n();
  const labels = useSupportCategoryLabels();
  const router = useRouter();
  const pathname = usePathname();
  const titleId = useId();
  const modal = useSyncExternalStore(
    subscribeSupportModalState,
    getSupportModalState,
    (): SupportModalState => ({
      phase: "closed",
      context: null,
      caseId: null,
      restoreCaseId: null,
    })
  );
  const open = modal.phase === "open";
  useSupportModalMainBottomNavSuppress(open);

  const [auth, setAuth] = useState<AuthState>("checking");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<SupportTicketSubmittedInfo | null>(null);
  /** 「새 문의 쓰기」마다 쓰기 화면을 새로 만든다 */
  const [composeNonce, setComposeNonce] = useState(0);
  /**
   * 최종 감사 U-3: 쓰기 화면의 「진행 중인 문의」로 상세를 열면 쓰기 화면을 **숨긴 채 유지**한다 —
   * 상세 ‹ 로 돌아오면 입력하던 내용 그대로(이어 쓰기 카드로 바뀌지 않음 · 300ms 저장 전 입력도 그대로).
   * 쓰기 화면을 거치지 않고 연 상세(푸시·목록)는 쓰기 화면을 만들지 않는다(불필요한 목록 요청 없음).
   */
  const [composeKept, setComposeKept] = useState(false);
  const historyPushed = useRef(false);
  const closingFromPop = useRef(false);
  /** 최종 점검 M1: 화면 단계마다 「한 단계 뒤로」 — ◁ 는 이것을 먼저 부르고, 없을 때(첫 단계)만 닫는다 */
  const [backRegistry] = useState(createSupportModalBackRegistry);
  /** 최종 점검 U9: 진행 중 문의 행에서 상세를 열었다 — 돌아오면 그 행으로 초점을 돌려준다 */
  const lastActiveRowCaseId = useRef<string | null>(null);
  /**
   * 실기 결함 2(2026-11-10): 창을 닫고 다른 화면으로 갈 때 — 닫기의 history.back() 이 방금 한 이동을 되돌렸다.
   * 이동할 주소가 있으면 back 대신 모달이 넣은 기록 항목을 그 주소로 **교체**한다(뒤로 = 원래 화면).
   */
  const navigateOnClose = useRef<string | null>(null);
  /** 병합 전 3차: 창이 닫힐 때마다 +1 — 접수 응답이 보낸 회차와 같을 때만 화면에 반영 */
  const openSessionRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (getSupportModalState().phase === "open") return;
    const restoreId = consumeSupportModalRestoreCaseId();
    if (restoreId) {
      deliverSupportOpen({ caseId: restoreId, source: "restore" });
      return;
    }
    const pending = readPendingSupportContext();
    if (pending) {
      deliverSupportOpen({ context: pending, source: "enter" });
      clearPendingSupportContext();
    }
  }, []);

  // 열릴 때마다 로그인 확인 — 비로그인은 분야를 고르기 전에 안내한다.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setAuth(getCurrentUser()?.id ? "in" : "checking");
    void getCurrentUserIdForDb()
      .then((uid) => {
        if (!cancelled) setAuth(uid ? "in" : "out");
      })
      .catch(() => {
        if (!cancelled) setAuth("out");
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      // 병합 전 3차: 창이 닫혔다 — 이 회차에 보낸 접수의 늦은 응답은 화면에 남기지 않는다
      openSessionRef.current += 1;
      setComposeKept(false);
      setSubmitting(false);
      setSubmitError(null);
      setSubmitted(null);
      const navTarget = navigateOnClose.current;
      navigateOnClose.current = null;
      if (navTarget) {
        if (historyPushed.current && !closingFromPop.current) {
          historyPushed.current = false;
          router.replace(navTarget);
        } else {
          router.push(navTarget);
        }
      } else if (historyPushed.current && !closingFromPop.current) {
        historyPushed.current = false;
        try {
          if (window.history.state?.[HISTORY_KEY]) {
            window.history.back();
          }
        } catch {
          /* ignore */
        }
      }
      closingFromPop.current = false;
      return;
    }

    if (!historyPushed.current) {
      try {
        window.history.pushState({ ...window.history.state, [HISTORY_KEY]: true }, "");
        historyPushed.current = true;
      } catch {
        /* ignore */
      }
    }

    // 최종 점검 M1: 기기 뒤로 = 화면 ‹ 와 같이 한 단계 뒤로 — 기록 항목을 다시 넣어 창이 가진 항목은 늘 1개.
    //   첫 단계(쓰기·접수 완료·직접 연 상세)에서만 닫기(작성 중 내용은 저장되어 다시 열면 「이어 쓰기」).
    const onPop = () => {
      if (!historyPushed.current) return;
      if (backRegistry.stepBack()) {
        try {
          window.history.pushState({ ...window.history.state, [HISTORY_KEY]: true }, "");
        } catch {
          historyPushed.current = false;
        }
        return;
      }
      historyPushed.current = false;
      closingFromPop.current = true;
      const active = document.activeElement as HTMLElement | null;
      if (active && typeof active.blur === "function") {
        active.blur();
      }
      closeSupportModal();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [open, router, backRegistry]);

  const handleClose = useCallback(() => {
    closeSupportModal();
  }, []);

  const composeEnabledNow = Boolean(modal.context && isSupportContextEnabled(modal.context));
  /** 상세 ‹ 와 같은 조건 — 쓰기 화면을 만들 수 있는 맥락이면 상세 ◁ = 쓰기 화면 */
  const detailCanBack = open && auth !== "out" && !submitted && Boolean(modal.caseId) && composeEnabledNow;
  /** 최종 점검 M2: 쓰기 화면의 「진행 중인 문의」에서 연 상세 — 끝나면 창을 닫지 않고 쓰기 화면(입력 그대로)으로 */
  const detailFromCompose = detailCanBack && composeKept;

  const backToCompose = useCallback(() => setSupportModalCaseId(null), []);

  useEffect(() => {
    if (!detailCanBack) return;
    return backRegistry.register(SUPPORT_BACK_PRIORITY.detailToCompose, () => setSupportModalCaseId(null));
  }, [detailCanBack, backRegistry]);

  // 최종 점검 U9: 쓰기 화면을 숨기면 상세 제목으로, 돌아오면 눌렀던 진행 중 문의 행(없으면 쓰기 제목)으로 초점
  useEffect(() => {
    if (!open) {
      lastActiveRowCaseId.current = null;
      return;
    }
    let target: (() => HTMLElement | null) | null = null;
    if (modal.caseId && composeKept) {
      target = () => document.getElementById(titleId);
    } else if (!modal.caseId && lastActiveRowCaseId.current) {
      const rowId = lastActiveRowCaseId.current;
      lastActiveRowCaseId.current = null;
      target = () =>
        document.querySelector<HTMLElement>(`[data-support-ticket-active-row="${rowId}"]`) ??
        document.getElementById(titleId);
    }
    if (!target) return;
    const find = target;
    const id = window.setTimeout(() => find()?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open, modal.caseId, composeKept, titleId]);

  /** 재감사 D1: 고정 함수 — 매 렌더 새 함수면 문의 상세가 다시 조회된다(종료+안 읽은 답변이 빈 화면으로 덮임) */
  const handleUnauthorized = useCallback(() => setAuth("out"), []);

  const handleSubmit = useCallback(
    async (state: SupportTicketFormState, draftKey: string) => {
      if (submitting) return;
      const payload = buildSupportTicketOpenPayload(state);
      if (!payload || !isSupportContextEnabled(payload.context)) {
        setSubmitError("missing_context");
        return;
      }
      setSubmitting(true);
      setSubmitError(null);
      // 병합 전 3차: 응답 전에 창이 닫히면(✕·◁) 결과 화면·오류·다시 열 문의를 남기지 않는다
      // (다음에 창을 열면 지난 「접수 완료」가 나오던 것). 성공이면 초안만 지운다(이미 접수된 글이 되살아나지 않게).
      const session = openSessionRef.current;
      const sameSession = () => openSessionRef.current === session;
      try {
        const res = await fetch("/api/support/cases/open", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.status === 401) {
          if (sameSession()) setAuth("out");
          return;
        }
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          case?: {
            id: string;
            public_case_no?: string;
            created_at?: string;
            category?: string | null;
            issue_type?: string | null;
          };
          created?: boolean;
          error?: string;
        };
        if (!res.ok || !json.ok || !json.case?.id) {
          if (sameSession()) setSubmitError(json.error ?? (res.status === 429 ? "rate_limited" : "open_failed"));
          return;
        }
        clearPendingSupportContext();
        clearSupportTicketDraft(draftKey);
        if (!sameSession()) return;
        // 새로고침해도 방금 접수한 문의로 돌아오게 복원값 저장
        stashSupportModalRestoreCaseId(json.case.id);
        // 고객 문의 SSOT §6 (F4): 같은 분야 진행 중 문의에 붙었으면(created=false) 그 문의의 분야·세부·접수 시각을 보여 준다.
        const merged = json.created === false;
        const shownCategory = merged ? (json.case.category ?? state.category) : state.category;
        const shownIssue = merged ? (json.case.issue_type ?? null) : state.issueType;
        setSubmitted({
          caseNo: json.case.public_case_no ?? "",
          categoryLabel: labels.categoryLabel(state.audience, shownCategory),
          issueLabel: labels.issueLabel(state.audience, shownCategory, shownIssue),
          createdAt: merged && json.case.created_at ? json.case.created_at : new Date().toISOString(),
          audience: state.audience,
          storeId: state.storeId ?? null,
          merged,
        });
      } catch {
        if (sameSession()) setSubmitError("network_error");
      } finally {
        if (sameSession()) setSubmitting(false);
      }
    },
    [submitting, labels]
  );

  const handleNewInquiry = useCallback(
    (fromCase: { audience: "MEMBER" | "OWNER"; ownerStoreId: string | null } | null) => {
      const prev = getSupportModalState().context;
      // 병합 전 2차 6: 「같은 대상 새 쓰기」(계약 §6) = **그 문의**의 대상·매장이 먼저. 문의 정보가 없을 때만 연 맥락.
      // (회원 맥락에서 「매장으로」 바꿔 연 매장 문의가 종료돼 「문의하기」 → 회원 쓰기가 열리던 것)
      const caseAudience = fromCase?.audience === "OWNER" && fromCase.ownerStoreId ? "OWNER" : fromCase ? "MEMBER" : null;
      const audience = (caseAudience ?? prev?.audience) === "OWNER" ? "OWNER" : "MEMBER";
      const storeId =
        audience === "OWNER"
          ? (caseAudience === "OWNER" ? fromCase?.ownerStoreId ?? undefined : prev?.storeId) ?? undefined
          : undefined;
      resetSupportModalToStart(
        buildGenericSupportTriageContext({
          audience,
          sourceSurface: audience === "OWNER" ? "owner_customer_center" : "mypage_customer_center",
          storeId,
        })
      );
      setSubmitted(null);
      setSubmitError(null);
      setComposeKept(false);
      setComposeNonce((n) => n + 1);
    },
    []
  );

  const closeAndNavigate = useCallback((href: string) => {
    navigateOnClose.current = href;
    closeSupportModal();
  }, []);

  const goAuth = useCallback(
    (path: "/login" | "/signup") => {
      const ctx = getSupportModalState().context;
      try {
        if (ctx && isSupportContextEnabled(ctx)) {
          window.sessionStorage.setItem(SUPPORT_CONTEXT_SESSION_KEY, JSON.stringify(ctx));
        }
      } catch {
        /* 저장 실패 — 로그인 후 버튼을 다시 누르면 된다 */
      }
      const next = pathname || "/";
      closeAndNavigate(`${path}?next=${encodeURIComponent(next)}`);
    },
    [pathname, closeAndNavigate]
  );

  const goMine = useCallback(
    (info: SupportTicketSubmittedInfo) => {
      closeAndNavigate(supportTicketMineHref(info));
    },
    [closeAndNavigate]
  );

  const viewerName = getCurrentUser()?.nickname || getCurrentUser()?.display_name || "";
  const ariaLabel = t("support_ticket_title");

  let body: ReactNode = null;
  if (open) {
    if (auth === "out") {
      body = (
        <SupportTicketLogin
          titleId={titleId}
          onClose={handleClose}
          onLogin={() => goAuth("/login")}
          onSignup={() => goAuth("/signup")}
        />
      );
    } else if (submitted) {
      body = (
        <SupportTicketSubmitted
          info={submitted}
          titleId={titleId}
          onClose={handleClose}
          onViewMine={() => goMine(submitted)}
        />
      );
    } else if (auth === "checking" && !modal.caseId) {
      // 고객 문의 SSOT §5: 로그인 확인 중에는 쓰기 화면을 그리지 않는다(비로그인에게 쓰기 화면이 잠깐 보였다 바뀌는 것 방지).
      body = (
        <div className="flex min-h-0 flex-1 flex-col bg-sam-app" data-support-ticket-view="checking">
          <SupportTicketHeader titleId={titleId} title={t("support_ticket_title")} onClose={handleClose} />
          <div className="relative min-h-0 flex-1">
            <DibayPendingSpinner layout="fill" />
          </div>
        </div>
      );
    } else {
      const composeEnabled = composeEnabledNow;
      const detailOpen = Boolean(modal.caseId);
      const showCompose = composeEnabled && (!detailOpen || composeKept);
      // 같은 자리(첫 칸 = 쓰기, 둘째 칸 = 상세)에 그려 상세를 열고 닫아도 쓰기 화면이 새로 만들어지지 않는다(U-3).
      body = (
        <>
          {showCompose ? (
            <div
              className={
                detailOpen
                  ? "pointer-events-none invisible absolute inset-0 flex flex-col"
                  : "flex min-h-0 flex-1 flex-col"
              }
              aria-hidden={detailOpen || undefined}
              inert={detailOpen || undefined}
              data-support-compose-kept={detailOpen ? "1" : undefined}
            >
              <SupportTicketCompose
                key={`compose-${composeNonce}`}
                context={modal.context as SupportContext}
                viewerName={viewerName}
                titleId={detailOpen ? `${titleId}-kept` : titleId}
                hidden={detailOpen}
                submitting={submitting}
                submitError={submitError}
                onClose={handleClose}
                onSubmit={(state, draftKey) => void handleSubmit(state, draftKey)}
                onOpenStoreChat={closeAndNavigate}
                onOpenCase={(caseId) => {
                  setComposeKept(true);
                  setSupportModalCaseId(caseId);
                  lastActiveRowCaseId.current = caseId;
                }}
              />
            </div>
          ) : null}
          {modal.caseId ? (
            <SupportTicketDetail
              key={modal.caseId}
              caseId={modal.caseId}
              titleId={titleId}
              onClose={handleClose}
              onClosedByRequester={detailFromCompose ? backToCompose : handleClose}
              onDone={detailFromCompose ? backToCompose : handleClose}
              onNewInquiry={handleNewInquiry}
              onUnauthorized={handleUnauthorized}
              onBack={composeEnabled ? () => setSupportModalCaseId(null) : null}
            />
          ) : null}
        </>
      );
    }
  }

  return (
    <SupportSheetShell open={open} onClose={handleClose} dismissible={false} ariaLabel={ariaLabel}>
      <SupportModalBackContext.Provider value={backRegistry}>
        <div className="relative flex min-h-0 flex-1 flex-col" data-support-sheet-chrome="1">
          {body}
        </div>
      </SupportModalBackContext.Provider>
    </SupportSheetShell>
  );
}
