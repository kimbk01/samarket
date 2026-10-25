"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
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

type Props = {
  busyId: string | null;
  onSelectUser: (userId: string) => void;
  /** 검색창 오른쪽 아이콘 버튼 (친구 탭: 친구 요청 · 친구 관리) */
  trailing?: ReactNode;
};

/**
 * 친구 탭 인라인 @ID 검색 — 통화·대화·보관함 탭과 동일 UI.
 * 홈 친구 행동이 있으면 친구 추가 시트와 같은 결과 행(상태별 친구 버튼 · 행 탭 → 프로필)을 쓴다(F-1).
 */
export function MessengerHomeInlineFriendSearch({ busyId, onSelectUser, trailing }: Props) {
  const { t } = useI18n();
  const friendActions = useMessengerFriendActions();
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<CommunityMessengerUserSearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const seqRef = useRef(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  /** 결과 패널 — 바깥을 누르면 접고, 검색창을 다시 누르거나 입력하면 편다(검색어는 유지). */
  const [panelOpen, setPanelOpen] = useState(true);

  useEffect(() => {
    if (!panelOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const root = rootRef.current;
      if (root && e.target instanceof Node && !root.contains(e.target)) setPanelOpen(false);
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

  return (
    <div ref={rootRef} className="relative" data-cm-inline-friend-search="">
      <div className="flex items-center gap-2">
        <label className="relative flex min-w-0 flex-1 items-center">
          <Search
            className="pointer-events-none absolute left-3 h-4 w-4 text-[color:var(--messenger-text-secondary)]"
            strokeWidth={2}
            aria-hidden
          />
          <input
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value.slice(0, 20));
              setPanelOpen(true);
            }}
            onFocus={() => setPanelOpen(true)}
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
              onClick={() => setKeyword("")}
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
        <div
          className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-[min(60dvh,420px)] overflow-y-auto overscroll-contain rounded-[length:var(--overlay-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] shadow-[var(--overlay-elevation-2)]"
          data-cm-inline-friend-search-results=""
          role="listbox"
          aria-label={t("cm_friend_search_results_title")}
        >
          {!busy && results.length > 0 ? (
            <p
              className="sticky top-0 z-[1] border-b border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] px-3 py-2 sam-text-helper font-semibold"
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
            friendActions ? (
              results.map((user) => (
                <MessengerFriendSearchResultRow
                  key={user.id}
                  user={user}
                  busyId={busyId}
                  onPrefetchDirectRoom={() => {}}
                  onStartDirectChat={onSelectUser}
                  viewerUserId={friendActions.viewerUserId}
                  friendActions={friendActions}
                />
              ))
            ) : results.map((user) => (
              <button
                key={user.id}
                type="button"
                disabled={!user.canMessage || Boolean(busyId)}
                onClick={() => {
                  if (!user.canMessage) return;
                  onSelectUser(user.id);
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
