"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MessengerSearchHighlightText } from "@/components/community-messenger/MessengerSearchHighlightText";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import {
  COMMUNITY_MESSENGER_USER_SEARCH_MIN_LENGTH,
  type CommunityMessengerUserSearchResult,
} from "@/lib/community-messenger/user-public-id-search";

type Props = {
  busyId: string | null;
  onSelectUser: (userId: string) => void;
};

/** 친구 탭 인라인 @ID 검색 — 통화·대화·보관함 탭과 동일 UI */
export function MessengerHomeInlineFriendSearch({ busyId, onSelectUser }: Props) {
  const { t } = useI18n();
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<CommunityMessengerUserSearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const seqRef = useRef(0);

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

  const showResults = keyword.trim().length >= COMMUNITY_MESSENGER_USER_SEARCH_MIN_LENGTH;

  return (
    <div className="space-y-2">
      <input
        value={keyword}
        onChange={(e) => setKeyword(e.target.value.slice(0, 20))}
        maxLength={20}
        placeholder={t("cm_ui_at_id_example")}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className="w-full rounded-ui-rect border border-transparent bg-[color:var(--messenger-primary-soft)] px-2 py-2 text-[14px] outline-none focus:border-[color:var(--messenger-primary)] focus:bg-[color:var(--messenger-surface)] focus:ring-1 focus:ring-[color:var(--messenger-primary)]"
        style={{ color: "var(--messenger-text)" }}
      />
      {showResults ? (
        <div className="divide-y divide-[color:var(--messenger-divider)] overflow-hidden rounded-ui-rect border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)]">
          {busy ? (
            <p className="px-3 py-4 text-center sam-text-helper" style={{ color: "var(--messenger-text-secondary)" }}>
              {t("common_loading")}
            </p>
          ) : results.length === 0 ? (
            <p className="px-3 py-4 text-center sam-text-helper" style={{ color: "var(--messenger-text-secondary)" }}>
              {!attempted ? t("cm_ui_enter_keyword_then_search") : t("cm_social_no_matching_users")}
            </p>
          ) : (
            results.map((user) => (
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
      ) : null}
    </div>
  );
}
