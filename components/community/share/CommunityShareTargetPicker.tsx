"use client";

import { Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { CM_INPUT_CLASS, CM_META_CLASS } from "@/lib/community/community-ui-classes";

export type CommunityShareTargetItem = {
  id: string;
  kind: "room" | "friend";
  label: string;
  subtitle?: string;
  avatarUrl?: string | null;
  roomId?: string;
  userId?: string;
};

type Props = {
  disabled?: boolean;
  onSelect: (item: CommunityShareTargetItem) => void;
};

export function CommunityShareTargetPicker({ disabled = false, onSelect }: Props) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [recent, setRecent] = useState<CommunityShareTargetItem[]>([]);
  const [friends, setFriends] = useState<CommunityShareTargetItem[]>([]);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<CommunityShareTargetItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/community/share/targets", { credentials: "include" });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          recent?: CommunityShareTargetItem[];
          friends?: CommunityShareTargetItem[];
        };
        if (!cancelled && data.ok) {
          setRecent(data.recent ?? []);
          setFriends(data.friends ?? []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        setSearching(true);
        try {
          const res = await fetch(
            `/api/community-messenger/users?q=${encodeURIComponent(q)}`,
            { credentials: "include" }
          );
          const data = (await res.json().catch(() => ({}))) as {
            ok?: boolean;
            users?: Array<{ id: string; label?: string; avatarUrl?: string | null; subtitle?: string }>;
          };
          if (!cancelled && data.ok) {
            setSearchResults(
              (data.users ?? []).map((u) => ({
                id: `friend:${u.id}`,
                kind: "friend" as const,
                label: u.label?.trim() || "",
                subtitle: u.subtitle,
                avatarUrl: u.avatarUrl ?? null,
                userId: u.id,
              }))
            );
          }
        } finally {
          if (!cancelled) setSearching(false);
        }
      })();
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const list = useMemo(() => {
    if (query.trim().length >= 2) return searchResults;
    return [...recent, ...friends.filter((f) => !recent.some((r) => r.userId === f.userId))];
  }, [friends, query, recent, searchResults]);

  const renderRow = useCallback(
    (item: CommunityShareTargetItem) => (
      <button
        key={item.id}
        type="button"
        disabled={disabled}
        className="flex min-h-11 w-full min-w-0 items-center gap-3 rounded-[14px] px-2 py-2 text-left hover:bg-[color-mix(in_srgb,var(--cm-primary)_6%,white)] disabled:opacity-50"
        onClick={() => onSelect(item)}
      >
        <SamarketThumbnail
          src={item.avatarUrl ?? undefined}
          alt=""
          size={40}
          className="h-10 w-10 shrink-0"
          roundedClassName="rounded-full"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-[var(--cm-text)]">{item.label}</p>
          {item.subtitle ? <p className={`truncate ${CM_META_CLASS}`}>{item.subtitle}</p> : null}
        </div>
      </button>
    ),
    [disabled, onSelect]
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--cm-text-muted)]" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("community_share_target_search_placeholder")}
          className={`${CM_INPUT_CLASS} pl-9`}
          disabled={disabled}
        />
      </div>
      {loading || searching ? (
        <p className={`py-6 text-center ${CM_META_CLASS}`}>{t("community_share_target_loading")}</p>
      ) : list.length === 0 ? (
        <p className={`py-6 text-center ${CM_META_CLASS}`}>{t("community_share_target_empty")}</p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {query.trim().length < 2 && recent.length > 0 ? (
            <>
              <p className={`mb-1 px-2 ${CM_META_CLASS}`}>{t("community_share_target_recent")}</p>
              {recent.map(renderRow)}
            </>
          ) : null}
          {query.trim().length < 2 && friends.length > 0 ? (
            <>
              <p className={`mb-1 mt-3 px-2 ${CM_META_CLASS}`}>{t("community_share_target_friends")}</p>
              {friends
                .filter((f) => !recent.some((r) => r.userId === f.userId))
                .map(renderRow)}
            </>
          ) : null}
          {query.trim().length >= 2 ? list.map(renderRow) : null}
        </div>
      )}
    </div>
  );
}
