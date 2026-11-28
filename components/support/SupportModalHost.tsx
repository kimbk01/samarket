"use client";

/**
 * 고객센터 문의 호스트 — 접수형(티켓) (Owner 「접수형 1단계」 2026-11-10).
 * 고객센터 문의와 채팅은 별도 운영: 말풍선·실시간 대화 없이 쓰기 → 접수 완료 → 내 문의(질문·답변).
 *
 * - 진입: FAB·허브·맥락 CTA·푸시·알림함 모두 `deliverSupportOpen` → 상태 기계(`support-modal-machine`) → 이 호스트(전체 화면).
 * - 화면 = 상태 기계의 stack(쓰기 / 상세 / 접수 완료 / 로그인). 맨 위만 보이고 아래 화면은 숨긴 채 유지(입력 그대로).
 * - 모든 버튼·기기 ◁·경로 변화는 intent 하나로 상태 기계에 넣는다. 요청은 `support-modal-ops` 하나만(계약 §5).
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
} from "@/components/support/SupportTicketViews";
import { getCurrentUser, getCurrentUserIdForDb } from "@/lib/auth/get-current-user";
import { getSessionPhase, subscribeSessionPhase } from "@/lib/auth/dibay-session-manager";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { useClientMembershipState } from "@/hooks/use-client-membership-state";
import {
  SUPPORT_CONTEXT_SESSION_KEY,
  buildGenericSupportTriageContext,
  isSupportContextEnabled,
} from "@/lib/support/support-context";
import {
  consumeSupportEntryReplace,
  deliverSupportOpen,
  deliverSupportOpenAfterRouteLeaves,
  flushSupportOpenAfterRoute,
} from "@/lib/support/deliver-support-open";
import {
  clearSupportLoginReturn,
  hasSupportLoginReturn,
  readSupportLoginReturn,
  stashSupportLoginReturn,
} from "@/lib/support/support-modal-restore-stash";
import {
  clearPendingSupportContext,
  consumeSupportModalRestoreCaseId,
  readPendingSupportContext,
  stashSupportModalRestoreCaseId,
} from "@/lib/support/open-support-center";
import {
  dispatchSupportModalIntent,
  getSupportModalLoginReturn,
  getSupportModalMachineState,
  getSupportModalState,
  newSupportModalSubmittedView,
  replaceSupportModalView,
  subscribeSupportModalState,
  type SupportModalMachineState,
  type SupportModalStackView,
  type SupportTicketSubmittedInfo,
} from "@/lib/support/support-modal-machine";
import { newSupportRequestId, runSupportModalWrite } from "@/lib/support/support-modal-ops";
import { useSupportCategoryLabels } from "@/lib/support/use-support-category-settings";
import { useSupportModalMainBottomNavSuppress } from "@/lib/support/support-modal-main-bottom-nav-suppress";
import {
  bindSupportTicketDraftRequestId,
  buildSupportTicketOpenPayload,
  clearSupportTicketDraft,
  readSupportTicketDraft,
  type SupportTicketFormState,
} from "@/lib/support/support-ticket-form";

const HISTORY_KEY = "dibaySupportModal";
/** 창 아래 경로 변화로 기록 중간에 남은 창 항목의 회차 표지(이 탭 메모리 · 새로고침하면 비움) */
const staleHistoryTokens = new Set<string>();
let historyTokenSeq = 0;
function newHistoryToken(): string {
  historyTokenSeq += 1;
  return `${Date.now().toString(36)}-${historyTokenSeq}`;
}

type AuthState = "checking" | "in" | "out";

const SERVER_SNAPSHOT: SupportModalMachineState = {
  phase: "closed",
  session: 0,
  stack: [],
  inflight: null,
  held: null,
  lastClose: null,
};

function supportTicketMineHref(info: { audience: "MEMBER" | "OWNER"; storeId: string | null }): string {
  if (info.audience === "OWNER" && info.storeId) {
    return `/stores/owner/customer-care/customer-center?storeId=${encodeURIComponent(info.storeId)}`;
  }
  return "/mypage/support-history";
}

type OpenCaseJson = {
  ok?: boolean;
  case?: {
    id: string;
    public_case_no?: string;
    created_at?: string;
    category?: string | null;
    issue_type?: string | null;
  };
  created?: boolean;
  replayed?: boolean;
  error?: string;
};

/** 로그인·가입·가입 뒤 프로필 화면 — 여기서는 「로그인 뒤 다시 열기」를 하지도, 표시를 버리지도 않는다 */
function isSupportAuthPath(pathname: string): boolean {
  return /^\/(login|signup|auth|onboarding)(\/|$)/.test(pathname);
}

/**
 * 「로그인 뒤 같은 창」 판정 — 표시는 그 로그인 시도 1번의 것이다 (재감사: 로그인 직후 안 열리고 나중 이동에 뜨던 것).
 * 부르는 때: 마운트 · 경로 변화 · 로그인 신호(프로필 캐시 채움 `TEST_AUTH_CHANGED_EVENT`) · 세션 단계 변화.
 * - 로그인됨: 기다리던 사용자와 다르면 버림 · 로그인 화면이 아니면 1번 열고 소비 · 로그인 화면이면 기다림
 * - 로그인 안 됨: 로그인 화면이면 기다림 · 세션 확인 중(loading·recovering)이면 기다림(새로고침 복귀는 곧 신호가 온다)
 *   · 비로그인 확정이면 버림(로그인을 그만두고 일반 화면으로 돌아옴 — 나중 로그인·이동에서 뜨지 않게)
 */
function evaluateSupportLoginReturn(pathname: string): void {
  const ret = readSupportLoginReturn();
  if (!ret) return;
  const userId = getCurrentUser()?.id ?? null;
  const onAuth = isSupportAuthPath(pathname);
  if (userId) {
    if (ret.expectUserId && ret.expectUserId !== userId) {
      clearSupportLoginReturn();
      clearPendingSupportContext();
      return;
    }
    if (onAuth) return;
    if (getSupportModalMachineState().phase === "open") {
      // 3차 재감사: 창이 이미 열려 있으면 이 로그인 시도는 끝 — 표시와 맥락을 함께 버린다
      clearSupportLoginReturn();
      clearPendingSupportContext();
      return;
    }
    clearSupportLoginReturn();
    if (ret.caseId) {
      clearPendingSupportContext();
      deliverSupportOpen({ caseId: ret.caseId, source: "restore" });
      return;
    }
    const pending = readPendingSupportContext();
    clearPendingSupportContext();
    if (pending) deliverSupportOpen({ context: pending, source: "enter" });
    return;
  }
  if (onAuth) return;
  const phase = getSessionPhase();
  if (phase === "loading" || phase === "recovering" || phase === "authenticated") return;
  clearSupportLoginReturn();
  clearPendingSupportContext();
}

export function SupportModalHost() {
  const { t } = useI18n();
  const labels = useSupportCategoryLabels();
  const router = useRouter();
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  });
  const pathname = usePathname();
  const baseId = useId();
  const m = useSyncExternalStore(subscribeSupportModalState, getSupportModalMachineState, () => SERVER_SNAPSHOT);
  const open = m.phase === "open";
  const busy = m.inflight != null;
  useSupportModalMainBottomNavSuppress(open);

  const [auth, setAuth] = useState<AuthState>("checking");
  /** 쓰기 화면별 접수 오류 (화면 id → 오류 코드) */
  const [submitErrors, setSubmitErrors] = useState<Record<string, string | null>>({});
  const historyPushed = useRef(false);
  /** 이 회차 창 기록 항목의 표지 */
  const historyTokenRef = useRef<string | null>(null);
  /** 창을 연 경로 — 창 아래에서 경로가 바뀌면(호스트가 시작하지 않은 이동) route_changed (C-20) */
  const openPathRef = useRef<string | null>(null);
  /** 최종 점검 U9: 진행 중 문의 행에서 상세를 열었다 — 돌아오면 그 행으로 초점을 돌려준다 */
  const lastActiveRowCaseId = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (getSupportModalMachineState().phase === "open") return;
    // 로그인 안내에서 나갔다 돌아옴 — 로그인이 확인된 화면에서만 연다(아래 경로 effect 와 같은 함수)
    if (hasSupportLoginReturn()) {
      evaluateSupportLoginReturn(window.location.pathname);
      return;
    }
    const restoreId = consumeSupportModalRestoreCaseId();
    if (restoreId) {
      // 진입 주소 위면 그 화면이 주소를 정리한 뒤 연다(정리 replace 로 바로 닫히거나 ◁ 로 다시 열리지 않게)
      if (window.location.pathname.startsWith("/support/")) {
        deliverSupportOpenAfterRouteLeaves(window.location.pathname, { caseId: restoreId, source: "restore" });
      } else {
        deliverSupportOpen({ caseId: restoreId, source: "restore" });
      }
      return;
    }
    // 진입 주소(`/support/enter`)의 저장 맥락은 그 화면이 읽고 주소를 정리한 뒤 연다 — 여기서 먼저 꺼내지 않는다
    if (window.location.pathname.startsWith("/support/")) return;
    const pending = readPendingSupportContext();
    if (pending) {
      deliverSupportOpen({ context: pending, source: "enter" });
      clearPendingSupportContext();
    }
  }, []);

  // 로그인 뒤 같은 창: 로그인 확인 신호(새로고침 복귀는 마운트 뒤 프로필이 늦게 채워진다)·세션 단계 변화 때도 판정
  useEffect(() => {
    if (typeof window === "undefined") return;
    const run = () => evaluateSupportLoginReturn(window.location.pathname);
    window.addEventListener(TEST_AUTH_CHANGED_EVENT, run);
    const offPhase = subscribeSessionPhase(run);
    return () => {
      window.removeEventListener(TEST_AUTH_CHANGED_EVENT, run);
      offPhase();
    };
  }, []);

  // C-21: 진입 주소 화면이 주소를 정리한 뒤(경로가 바뀐 뒤) 보관한 열기를 실행한다
  // C-20: 창이 열린 채 창 아래에서 경로가 바뀌면 닫는다 — 넣은 기록 항목은 그 이동이 소비한 것으로 본다(되돌리지 않음)
  useEffect(() => {
    // 고객센터 흐름 자신이 한 주소 정리(진입 주소 화면·푸시 고객센터 갈래) — 창을 닫지 않고 창의 경로만 바꾼다
    const ownReplace = consumeSupportEntryReplace(pathname);
    flushSupportOpenAfterRoute(pathname);
    if (pathname) evaluateSupportLoginReturn(pathname);
    const st = getSupportModalMachineState();
    if (st.phase !== "open" || openPathRef.current == null) return;
    if (pathname && pathname !== openPathRef.current) {
      if (ownReplace) {
        openPathRef.current = pathname;
        return;
      }
      historyPushed.current = false;
      openPathRef.current = null;
      // 이 회차 항목이 기록 중간에 남는다 — ◁ 로 돌아오면 건너뛸 표지
      if (historyTokenRef.current) staleHistoryTokens.add(historyTokenRef.current);
      historyTokenRef.current = null;
      dispatchSupportModalIntent({ type: "route_changed" });
    }
  }, [pathname]);

  // C-20 마무리(2026-11-29 · 5차 재감사로 다시 설계): 창 아래에서 경로가 바뀌어 창이 닫히면 창이 넣은 기록 항목은 기록 중간에 남는다.
  //   그 항목에만 붙인 **회차 표지**를 이 탭 메모리에 기억해 두고, ◁ 로 그 항목에 돌아오면 한 번만 더 뒤로 가 건너뛴다(◁ 두 번 필요 없음).
  //   표지는 건너뛸 때 지운다 — 앞으로 가기로 다시 오면 멈춘다(앞으로 막지 않음). 새로고침하면 메모리가 비어 건너뛰지 않는다
  //   (새로고침 뒤 남은 옛 표지 항목 때문에 사용자가 보던 화면을 떠나는 일 없음).
  useEffect(() => {
    const onPopStale = (e: PopStateEvent) => {
      if (getSupportModalMachineState().phase === "open" || historyPushed.current) return;
      const st = e.state as Record<string, unknown> | null;
      const token = st ? st[HISTORY_KEY] : null;
      if (typeof token !== "string" || !staleHistoryTokens.has(token)) return;
      staleHistoryTokens.delete(token);
      try {
        window.history.back();
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("popstate", onPopStale);
    return () => window.removeEventListener("popstate", onPopStale);
  }, []);

  // 창 회차가 바뀔 때마다 로그인 확인 — 비로그인은 분야를 고르기 전에 안내한다.
  const session = m.session;
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setAuth(getCurrentUser()?.id ? "in" : "checking");
    void getCurrentUserIdForDb()
      .then((uid) => {
        if (cancelled) return;
        setAuth(uid ? "in" : "out");
        if (!uid) dispatchSupportModalIntent({ type: "auth_out" });
      })
      .catch(() => {
        if (cancelled) return;
        setAuth("out");
        dispatchSupportModalIntent({ type: "auth_out" });
      });
    return () => {
      cancelled = true;
    };
  }, [open, session]);

  // 기록 항목: 열 때 1개 넣고(모듈이 추적), 닫힌 까닭에 따라 정리한다.
  useEffect(() => {
    if (!open) {
      setSubmitErrors((e) => (Object.keys(e).length > 0 ? {} : e));
      // 다음 회차는 로그인 확인부터(지난 회차의 「비로그인」이 남아 로그인한 사람에게 안내가 뜨지 않게)
      setAuth("checking");
      const reason = getSupportModalMachineState().lastClose;
      const pushed = historyPushed.current;
      historyPushed.current = false;
      openPathRef.current = null;
      if (reason?.kind === "navigate") {
        // 실기 결함 2(2026-11-10): 닫고 다른 화면으로 — 넣은 기록 항목을 그 주소로 교체(뒤로 = 원래 화면)
        if (pushed) routerRef.current.replace(reason.href);
        else routerRef.current.push(reason.href);
      } else if (reason?.kind === "intent" && pushed) {
        try {
          window.history.back();
        } catch {
          /* ignore */
        }
      }
      // pop = 기기 ◁ 가 이미 꺼냄 · route = 그 이동이 소비함
      return;
    }

    if (!historyPushed.current) {
      try {
        historyTokenRef.current = newHistoryToken();
        window.history.pushState({ ...window.history.state, [HISTORY_KEY]: historyTokenRef.current }, "");
        historyPushed.current = true;
        openPathRef.current = pathname ?? null;
      } catch {
        /* ignore */
      }
    }

    // 기기 ◁ = 화면 ‹ 와 같은 back intent. 창이 열려 있으면(한 단계 뒤로·쓰기 요청 중 보관) 기록 항목을 다시 넣는다.
    const onPop = () => {
      if (!historyPushed.current) return;
      dispatchSupportModalIntent({ type: "back" }, { fromPop: true });
      if (getSupportModalMachineState().phase === "open") {
        try {
          window.history.pushState({ ...window.history.state, [HISTORY_KEY]: historyTokenRef.current ?? newHistoryToken() }, "");
        } catch {
          historyPushed.current = false;
        }
        return;
      }
      historyPushed.current = false;
      const active = document.activeElement as HTMLElement | null;
      if (active && typeof active.blur === "function") active.blur();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // pathname 은 열 때 한 번만 읽는다(경로 변화는 위 effect) · 닫힌 까닭은 회차(session)마다 한 번
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, session]);

  const top = open ? (m.stack[m.stack.length - 1] ?? null) : null;

  // 비로그인으로 확인된 창에 새 쓰기·상세가 쌓여도 로그인 화면(401 과 같은 규칙 하나)
  const topKindNow = top?.kind ?? null;
  useEffect(() => {
    if (open && auth === "out" && topKindNow && topKindNow !== "login") {
      dispatchSupportModalIntent({ type: "auth_out" });
    }
  }, [open, auth, topKindNow]);
  const titleIdFor = (v: SupportModalStackView) => `${baseId}-${v.id}`;

  // 최종 점검 U9: 맨 위 화면이 상세가 되면 상세 제목으로, 쓰기로 돌아오면 눌렀던 진행 중 문의 행으로 초점
  const topId = top?.id ?? null;
  const topKind = top?.kind ?? null;
  const stackDepth = m.stack.length;
  useEffect(() => {
    if (!topId) {
      lastActiveRowCaseId.current = null;
      return;
    }
    let target: (() => HTMLElement | null) | null = null;
    if (topKind === "detail" && stackDepth > 1) {
      target = () => document.getElementById(`${baseId}-${topId}`);
    } else if (topKind === "compose" && lastActiveRowCaseId.current) {
      const rowId = lastActiveRowCaseId.current;
      lastActiveRowCaseId.current = null;
      target = () =>
        document.querySelector<HTMLElement>(`[data-support-ticket-active-row="${rowId}"]`) ??
        document.getElementById(`${baseId}-${topId}`);
    }
    if (!target) return;
    const find = target;
    const id = window.setTimeout(() => find()?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [topId, topKind, stackDepth, baseId]);

  const intentClose = useCallback(() => {
    dispatchSupportModalIntent({ type: "close" });
  }, []);
  const intentBack = useCallback(() => {
    dispatchSupportModalIntent({ type: "back" });
  }, []);
  const closeAndNavigate = useCallback((href: string) => {
    dispatchSupportModalIntent({ type: "navigate", href });
  }, []);

  const handleSubmit = useCallback(
    (viewId: string, state: SupportTicketFormState, draftKey: string) => {
      const payload = buildSupportTicketOpenPayload(state);
      if (!payload || !isSupportContextEnabled(payload.context)) {
        setSubmitErrors((e) => ({ ...e, [viewId]: "missing_context" }));
        return;
      }
      // 계약 §1: 요청 id 를 보낸 본문에 묶어 초안에 저장 — 「연결 오류」 뒤 다시 누르면 같은 id(서버 replay → 같은 글 2번 없음)
      const requestId = bindSupportTicketDraftRequestId(draftKey, state, newSupportRequestId);
      setSubmitErrors((e) => ({ ...e, [viewId]: null }));
      void runSupportModalWrite<OpenCaseJson>(
        "submit",
        { viewId, caseId: null },
        { url: "/api/support/cases/open", body: { ...payload, requestId } },
        (res, token) => {
          if (res.ok && res.json.case?.id) {
            const opened = res.json.case;
            clearPendingSupportContext();
            // 접수된 그 요청의 초안만 지운다(화면과 상관없이 — 보낸 글이 「작성 중인 문의」로 되살아나지 않게)
            const stored = readSupportTicketDraft(draftKey);
            if (!stored || !stored.requestId || stored.requestId === requestId) clearSupportTicketDraft(draftKey);
            if (!res.current) return;
            // 새로고침해도 방금 접수한 문의로 돌아오게 복원값 저장
            stashSupportModalRestoreCaseId(opened.id);
            // 고객 문의 SSOT §6 (F4): 같은 분야 진행 중 문의에 붙었으면(created=false) 그 문의의 분야·세부·접수 시각
            const merged = res.json.created === false;
            // 붙인 접수·다시 보낸 요청(replayed)은 서버 문의의 분야·세부를 보인다 — 화면 상태가 아니라 실제 접수된 것
            const fromServer = merged || res.json.replayed === true;
            const shownCategory = fromServer ? (opened.category ?? state.category) : state.category;
            const shownIssue = fromServer ? (opened.issue_type ?? null) : state.issueType;
            const info: SupportTicketSubmittedInfo = {
              caseNo: opened.public_case_no ?? "",
              categoryLabel: labels.categoryLabel(state.audience, shownCategory),
              issueLabel: labels.issueLabel(state.audience, shownCategory, shownIssue),
              createdAt: fromServer && opened.created_at ? opened.created_at : new Date().toISOString(),
              audience: state.audience,
              storeId: state.storeId ?? null,
              merged,
            };
            replaceSupportModalView(token, newSupportModalSubmittedView(info));
            return;
          }
          if (!res.current || res.status === 401) return;
          setSubmitErrors((e) => ({ ...e, [viewId]: res.ok ? "open_failed" : res.error }));
        },
        "open_failed"
      );
    },
    [labels]
  );

  const handleNewInquiry = useCallback(
    (fromCase: { audience: "MEMBER" | "OWNER"; ownerStoreId: string | null } | null) => {
      const prev = getSupportModalState().context;
      // 병합 전 2차 6: 「같은 대상 새 쓰기」(계약 §6) = **그 문의**의 대상·매장이 먼저. 문의 정보가 없을 때만 연 맥락.
      const caseAudience = fromCase?.audience === "OWNER" && fromCase.ownerStoreId ? "OWNER" : fromCase ? "MEMBER" : null;
      const audience = (caseAudience ?? prev?.audience) === "OWNER" ? "OWNER" : "MEMBER";
      const storeId =
        audience === "OWNER"
          ? (caseAudience === "OWNER" ? fromCase?.ownerStoreId ?? undefined : prev?.storeId) ?? undefined
          : undefined;
      dispatchSupportModalIntent({
        type: "new_inquiry",
        context: buildGenericSupportTriageContext({
          audience,
          sourceSurface: audience === "OWNER" ? "owner_customer_center" : "mypage_customer_center",
          storeId,
        }),
      });
    },
    []
  );

  const goAuth = useCallback(
    (path: "/login" | "/signup") => {
      // 로그인 안내가 지닌 로그인 전 창(쓰기 맥락 · 맨 위 상세) — 로그인 뒤 같은 창을 다시 연다
      const ret = getSupportModalLoginReturn();
      const ctx = ret?.context ?? getSupportModalState().context;
      try {
        if (ctx && isSupportContextEnabled(ctx)) {
          window.sessionStorage.setItem(SUPPORT_CONTEXT_SESSION_KEY, JSON.stringify(ctx));
        }
      } catch {
        /* 저장 실패 — 로그인 후 버튼을 다시 누르면 된다 */
      }
      if ((ctx && isSupportContextEnabled(ctx)) || ret?.caseId) stashSupportLoginReturn({ caseId: ret?.caseId ?? null, expectUserId: getCurrentUser()?.id ?? null });
      const next = pathname || "/";
      closeAndNavigate(`${path}?next=${encodeURIComponent(next)}`);
    },
    [pathname, closeAndNavigate]
  );

  /** 이름 표시 = 회원 상태 SSOT 프로필(관심이웃 설계 v2 §6 — main 병합) */
  const supportMembership = useClientMembershipState("support-modal");
  const viewerProfile = supportMembership.status === "member" ? supportMembership.profile : null;
  const viewerName = viewerProfile?.nickname || viewerProfile?.display_name || "";
  const ariaLabel = t("support_ticket_title");

  const renderView = (v: SupportModalStackView, index: number): ReactNode => {
    const isTop = index === m.stack.length - 1;
    const titleId = titleIdFor(v);
    switch (v.kind) {
      case "login":
        return (
          <SupportTicketLogin
            titleId={titleId}
            busy={busy}
            onClose={intentClose}
            onLogin={() => goAuth("/login")}
            onSignup={() => goAuth("/signup")}
          />
        );
      case "submitted":
        return (
          <SupportTicketSubmitted
            info={v.info}
            titleId={titleId}
            busy={busy}
            onClose={intentClose}
            onViewMine={() => closeAndNavigate(supportTicketMineHref(v.info))}
          />
        );
      case "compose":
        return (
          <SupportTicketCompose
            viewId={v.id}
            context={v.context}
            viewerName={viewerName}
            titleId={titleId}
            hidden={!isTop}
            busy={busy}
            submitting={m.inflight?.kind === "submit" && m.inflight.viewId === v.id}
            submitError={submitErrors[v.id] ?? null}
            onClose={intentClose}
            onBack={intentBack}
            onSubmit={(state, draftKey) => handleSubmit(v.id, state, draftKey)}
            onOpenStoreChat={closeAndNavigate}
            onOpenCase={(caseId) => {
              lastActiveRowCaseId.current = caseId;
              dispatchSupportModalIntent({ type: "open_case", caseId });
            }}
          />
        );
      case "detail":
        return (
          <SupportTicketDetail
            viewId={v.id}
            caseId={v.caseId}
            reloadTick={v.reloadTick}
            isTop={isTop}
            titleId={titleId}
            busy={busy}
            writeKind={
              m.inflight && m.inflight.viewId === v.id && m.inflight.kind !== "submit" ? m.inflight.kind : null
            }
            canBack={index > 0}
            onClose={intentClose}
            onBack={intentBack}
            onNewInquiry={handleNewInquiry}
          />
        );
    }
  };

  let body: ReactNode = null;
  if (open && top) {
    if (auth === "checking" && top.kind === "compose") {
      // 고객 문의 SSOT §5: 로그인 확인 중에는 쓰기 화면을 그리지 않는다(비로그인에게 쓰기 화면이 잠깐 보였다 바뀌는 것 방지).
      body = (
        <div className="flex min-h-0 flex-1 flex-col bg-sam-app" data-support-ticket-view="checking">
          <SupportTicketHeader titleId={titleIdFor(top)} title={t("support_ticket_title")} onClose={intentClose} />
          <div className="relative min-h-0 flex-1">
            <DibayPendingSpinner layout="fill" />
          </div>
        </div>
      );
    } else {
      // 쌓인 화면을 모두 그리고 맨 위만 보인다 — 아래 화면(쓰기·상세)은 숨긴 채 유지(입력·상태 그대로 · Owner 결정 1)
      body = m.stack.map((v, index) => {
        const isTop = index === m.stack.length - 1;
        return (
          <div
            key={v.id}
            className={isTop ? "flex min-h-0 flex-1 flex-col" : "pointer-events-none invisible absolute inset-0 flex flex-col"}
            aria-hidden={!isTop || undefined}
            inert={!isTop || undefined}
            data-support-view-kept={!isTop ? v.kind : undefined}
            data-support-compose-kept={!isTop && v.kind === "compose" ? "1" : undefined}
          >
            {renderView(v, index)}
          </div>
        );
      });
    }
  }

  return (
    <SupportSheetShell open={open} onClose={intentClose} dismissible={false} ariaLabel={ariaLabel}>
      <div className="relative flex min-h-0 flex-1 flex-col" data-support-sheet-chrome="1" aria-busy={busy || undefined}>
        {body}
      </div>
    </SupportSheetShell>
  );
}
