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
import { SupportSheetShell } from "@/components/support/SupportSheetShell";
import {
  SupportTicketCompose,
  SupportTicketDetail,
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
  const historyPushed = useRef(false);
  const closingFromPop = useRef(false);
  /**
   * 실기 결함 2(2026-11-10): 창을 닫고 다른 화면으로 갈 때 — 닫기의 history.back() 이 방금 한 이동을 되돌렸다.
   * 이동할 주소가 있으면 back 대신 모달이 넣은 기록 항목을 그 주소로 **교체**한다(뒤로 = 원래 화면).
   */
  const navigateOnClose = useRef<string | null>(null);

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

    // 기기 뒤로 = 닫기(작성 중 내용은 저장되어 다시 열면 「이어 쓰기」)
    const onPop = () => {
      if (!historyPushed.current) return;
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
  }, [open, router]);

  const handleClose = useCallback(() => {
    closeSupportModal();
  }, []);

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
      try {
        const res = await fetch("/api/support/cases/open", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.status === 401) {
          setAuth("out");
          return;
        }
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          case?: { id: string; public_case_no?: string; created_at?: string };
          error?: string;
        };
        if (!res.ok || !json.ok || !json.case?.id) {
          setSubmitError(json.error ?? "open_failed");
          return;
        }
        clearPendingSupportContext();
        clearSupportTicketDraft(draftKey);
        // 새로고침해도 방금 접수한 문의로 돌아오게 복원값 저장
        stashSupportModalRestoreCaseId(json.case.id);
        setSubmitted({
          caseNo: json.case.public_case_no ?? "",
          categoryLabel: labels.categoryLabel(state.audience, state.category),
          issueLabel: labels.issueLabel(state.audience, state.category, state.issueType),
          createdAt: new Date().toISOString(),
          audience: state.audience,
          storeId: state.storeId ?? null,
        });
      } catch {
        setSubmitError("network_error");
      } finally {
        setSubmitting(false);
      }
    },
    [submitting, labels]
  );

  const handleNewInquiry = useCallback(
    (fromCase: { audience: "MEMBER" | "OWNER"; ownerStoreId: string | null } | null) => {
      const prev = getSupportModalState().context;
      // 푸시·목록으로 연 경우 context 가 없다 — 열었던 문의의 대상(회원/매장)을 이어 받는다.
      const audience = (prev?.audience ?? fromCase?.audience) === "OWNER" ? "OWNER" : "MEMBER";
      const storeId = prev?.storeId ?? (audience === "OWNER" ? fromCase?.ownerStoreId ?? undefined : undefined);
      resetSupportModalToStart(
        buildGenericSupportTriageContext({
          audience,
          sourceSurface: audience === "OWNER" ? "owner_customer_center" : "mypage_customer_center",
          storeId,
        })
      );
      setSubmitted(null);
      setSubmitError(null);
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
    } else if (modal.caseId) {
      body = (
        <SupportTicketDetail
          key={modal.caseId}
          caseId={modal.caseId}
          titleId={titleId}
          onClose={handleClose}
          onClosedByRequester={handleClose}
          onNewInquiry={handleNewInquiry}
          onUnauthorized={() => setAuth("out")}
          onBack={
            modal.context && isSupportContextEnabled(modal.context) ? () => setSupportModalCaseId(null) : null
          }
        />
      );
    } else if (modal.context && isSupportContextEnabled(modal.context)) {
      body = (
        <SupportTicketCompose
          key={`compose-${composeNonce}`}
          context={modal.context as SupportContext}
          viewerName={viewerName}
          titleId={titleId}
          submitting={submitting}
          submitError={submitError}
          onClose={handleClose}
          onSubmit={(state, draftKey) => void handleSubmit(state, draftKey)}
          onOpenStoreChat={closeAndNavigate}
          onOpenCase={(caseId) => setSupportModalCaseId(caseId)}
        />
      );
    }
  }

  return (
    <SupportSheetShell open={open} onClose={handleClose} dismissible={false} ariaLabel={ariaLabel}>
      <div className="flex min-h-0 flex-1 flex-col" data-support-sheet-chrome="1">
        {body}
      </div>
    </SupportSheetShell>
  );
}
