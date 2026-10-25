"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Search, X } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MessengerSearchHighlightText } from "@/components/community-messenger/MessengerSearchHighlightText";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import {
  COMMUNITY_MESSENGER_USER_SEARCH_MIN_LENGTH,
  type CommunityMessengerUserSearchResult,
} from "@/lib/community-messenger/user-public-id-search";
import { MessengerFriendSearchResultRow } from "@/components/community-messenger/MessengerFriendAddSheet";
import { useMessengerFriendActions } from "@/components/community-messenger/friend-cta/messenger-friend-actions-context";
import { useOverlayHardwareBack } from "@/lib/ui/overlay-back-stack";

type Props = {
  busyId: string | null;
  onSelectUser: (userId: string) => void;
  /** 검색창 오른쪽 아이콘 버튼 (친구 탭: 친구 요청 · 친구 관리) */
  trailing?: ReactNode;
  /** 홈 탭(친구·통화·대화·보관함) — 바뀌면 검색어·결과 카드를 비운다 */
  resetKey?: string;
};

/**
 * 친구 탭 인라인 @ID 검색 — 통화·대화·보관함 탭과 동일 UI.
 * 홈 친구 행동이 있으면 친구 추가 시트와 같은 결과 행(상태별 친구 버튼 · 행 탭 → 프로필)을 쓴다(F-1).
 */
export function MessengerHomeInlineFriendSearch({ busyId, onSelectUser, trailing, resetKey }: Props) {
  const { t } = useI18n();
  const friendActions = useMessengerFriendActions();
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<CommunityMessengerUserSearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const seqRef = useRef(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pathname = usePathname();
  /** 결과 패널 — 바깥을 누르면 접고, 검색창을 다시 누르거나 입력하면 편다(검색어는 유지). */
  const [panelOpen, setPanelOpen] = useState(true);
  /** 접을 때 키보드도 내린다 — 포커스가 남으면 검색창을 다시 눌러도 onFocus 가 안 와서 못 편다 */
  const collapse = () => {
    setPanelOpen(false);
    inputRef.current?.blur();
  };

  /**
   * U-3 자동 접힘 (2026-10-25 Owner: 「아이디 입력 시 내려오는 카드가 자동으로 안 접힘」):
   * 탭 전환·화면 이동 → 검색어까지 비움 / 결과에서 프로필·채팅 열기·뒤로 → 카드만 접음.
   */
  useEffect(() => {
    setKeyword("");
    setPanelOpen(false);
  }, [resetKey, pathname]);

  useEffect(() => {
    if (!panelOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const root = rootRef.current;
      if (!root || !(e.target instanceof Node) || root.contains(e.target)) return;
      /**
       * 결과 행에서 띄운 확인 팝업(요청 취소 등)은 포털이라 패널 밖이다. 그 안을 누를 때 패널을 접으면
       * 행과 함께 팝업이 사라져 버튼이 실행되지 않는다(2026-10-25 실기기 D-10) → 오버레이 안 클릭은 무시.
       */
      if (e.target instanceof Element && e.target.closest(".dibay-overlay-root, [data-dibay-overlay]")) return;
      setPanelOpen(false);
      inputRef.current?.blur();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [panelOpen]);

  useEffect(() => {
    const trimmed = keyword.trim();
    if (!trimmed || trimmed.length < COMMUNITY_MESSENGER_USER_SEARCH_MIN_LENGTH) {
      seqRef.current += 1;
      setResults([]);
      setBusy(false);
      if (!trimmed) setAttempted(false);
      return;
    }
    const seq = ++seqRef.current;
    const timer = window.setTimeout(() => {
      void (async () => {
        setBusy(true);
        try {
          const res = await fetch(`/api/community-messenger/users?q=${encodeURIComponent(trimmed)}`, {
            cache: "no-store",
          });
          if (seq !== seqRef.current) return;
          const json = (await res.json()) as { ok?: boolean; users?: CommunityMessengerUserSearchResult[] };
          setResults(res.ok && json.ok ? json.users ?? [] : []);
          setAttempted(true);
        } finally {
          if (seq === seqRef.current) setBusy(false);
        }
      })();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [keyword]);

  const showResults = panelOpen && keyword.trim().length >= COMMUNITY_MESSENGER_USER_SEARCH_MIN_LENGTH;
  useOverlayHardwareBack(showResults, collapse);

  /** 결과 행 본문(프로필 열기)은 카드를 접고 연다 — 친구 요청·취소·수락 버튼은 상태 변화가 보이도록 유지 */
  const rowFriendActions = useMemo(
    () =>
      friendActions
        ? {
            ...friendActions,
            onOpenProfile: (user: CommunityMessengerUserSearchResult) => {
              collapse();
              friendActions.onOpenProfile(user);
            },
          }
        : null,
    [friendActions]
  );
  const selectUser = (userId: string) => {
    collapse();
    onSelectUser(userId);
  };

  return (
    <div ref={rootRef} className={`relative ${showResults ? "z-30" : ""}`} data-cm-inline-friend-search="">
      <div className="flex items-center gap-2">
        <label className="relative flex min-w-0 flex-1 items-center">
          <Search
            className="pointer-events-none absolute left-3 h-4 w-4 text-[color:var(--messenger-text-secondary)]"
            strokeWidth={2}
            aria-hidden
          />
          <input
            ref={inputRef}
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value.slice(0, 20));
              setPanelOpen(true);
            }}
            onFocus={() => setPanelOpen(true)}
            onClick={() => setPanelOpen(true)}
            maxLength={20}
            placeholder={t("cm_ui_at_id_example")}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-label={t("cm_ui_at_id_example")}
            className="h-11 w-full rounded-ui-rect border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] pl-9 pr-9 text-[16px] outline-none transition-colors focus:border-[color:var(--messenger-primary)] focus:ring-1 focus:ring-[color:var(--messenger-primary)]"
            data-cm-messenger-search-input=""
            style={{ color: "var(--messenger-text)" }}
          />
          {keyword ? (
            <button
              type="button"
              onClick={() => {
                setKeyword("");
                setPanelOpen(false);
              }}
              aria-label={t("nav_close")}
              className="absolute right-1 flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--messenger-text-secondary)] active:bg-[color:var(--messenger-primary-soft)]"
            >
              <X className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            </button>
          ) : null}
        </label>
        {trailing}
      </div>
      {showResults ? (
        /* 뒤 목록 어둡게 — 폭 명시 + max-w-none(전역 button max-width:100% 때문에 실측 360px·왼쪽 절반만 덮였다, 2026-10-25 Samsung). 바깥 칸은 목록 영역 overflow 로 잘린다 */
        <button
          type="button"
          tabIndex={-1}
          aria-label={t("nav_close")}
          onClick={collapse}
          className="absolute left-[-100vw] top-full z-[29] h-[100dvh] w-[300vw] max-w-none cursor-default bg-[color:var(--overlay-backdrop)]"
          data-cm-inline-friend-search-backdrop=""
        />
      ) : null}
      {showResults ? (
        <div
          className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-[min(60dvh,420px)] overflow-y-auto overscroll-contain rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-surface)] shadow-[var(--overlay-elevation-3)]"
          data-cm-inline-friend-search-results=""
          role="listbox"
          aria-label={t("cm_friend_search_results_title")}
        >
          {!busy && results.length > 0 ? (
            <p
              className="sticky top-0 z-[1] border-b border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface-muted)] px-3 py-2 sam-text-helper font-semibold"
              style={{ color: "var(--messenger-text-secondary)" }}
            >
              {t("cm_friend_search_results_count", { count: results.length })}
            </p>
          ) : null}
          <div className="divide-y divide-[color:var(--messenger-divider)]">
          {busy ? (
            <p className="px-3 py-4 text-center sam-text-helper" style={{ color: "var(--messenger-text-secondary)" }}>
              {t("common_loading")}
            </p>
          ) : results.length === 0 ? (
            <p className="px-3 py-4 text-center sam-text-helper" style={{ color: "var(--messenger-text-secondary)" }}>
              {!attempted ? t("cm_ui_enter_keyword_then_search") : t("cm_social_no_matching_users")}
            </p>
          ) : (
            rowFriendActions ? (
              results.map((user) => (
                <MessengerFriendSearchResultRow
                  key={user.id}
                  user={user}
                  busyId={busyId}
                  onPrefetchDirectRoom={() => {}}
                  onStartDirectChat={selectUser}
                  viewerUserId={rowFriendActions.viewerUserId}
                  friendActions={rowFriendActions}
                />
              ))
            ) : results.map((user) => (
              <button
                key={user.id}
                type="button"
                disabled={!user.canMessage || Boolean(busyId)}
                onClick={() => {
                  if (!user.canMessage) return;
                  selectUser(user.id);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left active:bg-[color:var(--messenger-surface-muted)] disabled:opacity-40"
              >
                <SamarketThumbnail
                  src={user.avatarUrl?.trim() || null}
                  size={40}
                  roundedClassName="rounded-full"
                  className="bg-[color:var(--messenger-surface-muted)]"
                  fallbackSrc=""
                  fallbackNode={
                    <span className="sam-text-body-secondary font-semibold" style={{ color: "var(--messenger-text-secondary)" }}>
                      {user.displayName.trim().slice(0, 1) || "?"}
                    </span>
                  }
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate sam-text-body font-medium" style={{ color: "var(--messenger-text)" }}>
                    {user.displayName}
                  </p>
                  {user.publicId ? (
                    <p className="truncate sam-text-xxs" style={{ color: "var(--messenger-text-secondary)" }}>
                      <MessengerSearchHighlightText text={user.publicId} ranges={user.highlightRanges} prefix="@" />
                    </p>
                  ) : null}
                </div>
              </button>
            ))
          )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
