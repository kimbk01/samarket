"use client";

import { useMemo, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketUserAvatarThumb } from "@/components/profile/SamarketUserAvatarThumb";
import { useBottomNavOccupiesClearance } from "@/lib/layout/bottom-nav-scroll-chrome-context";
import type { MessengerPickMode } from "@/lib/community-messenger/messenger-sub-screen-route";
import {
  canCreateMessengerPickerGroup,
  filterMessengerPickerFriends,
  toggleMessengerPickerSelection,
} from "@/lib/community-messenger/messenger-friend-picker";
import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";

type Props = {
  mode: MessengerPickMode;
  /** 친구 탭과 같은 친구 목록 (`sortedFriends`) */
  friends: CommunityMessengerProfileLite[];
  viewerUserId: string | null;
  /** 그룹 대화 — 고른 친구 id (홈이 가진다: 머리글 「고른 수」와 같은 값) */
  selectedIds: string[];
  onSelectedIdsChange: (next: string[]) => void;
  /** 1:1 대화 — 친구 한 명을 누르면 친구 탭 줄과 같은 방 열기(`startDirectRoom`) */
  onPickDirect: (userId: string) => void;
  /** 그룹 대화 — 「n명으로 그룹 만들기」 (비공개 그룹 만들기 기존 경로) */
  onCreateGroup: () => void;
  creatingGroup: boolean;
};

/**
 * 친구 고르기 (채팅 시안 4판 「6. 그룹 대화 — 친구 고르기」, Owner 「정확히 시안대로」 2026-11-10) — 1:1 대화·그룹 대화 공용.
 * 머리글(뒤로 + 「그룹 대화」/「1:1 대화」 + 오른쪽 「고른 수」)은 1단 공통 하위 화면 머리글이 그린다.
 * - 찾기 칸 38 · 둥글기 10 · 연회색 · 돋보기 · 「친구 이름 검색」 (여백 8 16)
 * - 그룹: 고른 친구 줄(사진 44 + 이름 12, 가로) · 줄마다 오른쪽 24 동그라미(고르면 초록 + 흰 체크) · 아래 고정 「n명으로 그룹 만들기」
 * - 1:1: 동그라미 없음 — 친구를 누르면 바로 대화방
 * 줄: 높이 64 · 좌우 16 · 간격 12 · 사진 44 둥근 사각(16) · 이름 16/600.
 */
export function MessengerFriendPickerScreen({
  mode,
  friends,
  viewerUserId,
  selectedIds,
  onSelectedIdsChange,
  onPickDirect,
  onCreateGroup,
  creatingGroup,
}: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const bottomNavOccupiesClearance = useBottomNavOccupiesClearance();
  const group = mode === "group";

  const pickable = useMemo(
    () => filterMessengerPickerFriends(friends, { viewerUserId, query: "" }),
    [friends, viewerUserId]
  );
  const rows = useMemo(
    () => filterMessengerPickerFriends(friends, { viewerUserId, query }),
    [friends, query, viewerUserId]
  );
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const picked = useMemo(() => {
    const byId = new Map(pickable.map((f) => [f.id, f] as const));
    return selectedIds.map((id) => byId.get(id)).filter((f): f is CommunityMessengerProfileLite => Boolean(f));
  }, [pickable, selectedIds]);
  const count = picked.length;

  const toggle = (id: string) => onSelectedIdsChange(toggleMessengerPickerSelection(selectedIds, id));

  return (
    <section
      className="relative flex min-h-0 min-w-0 flex-1 flex-col"
      data-cm-friend-picker={mode}
      aria-label={t(group ? "cm_ui_new_conversation_group" : "cm_ui_new_conversation_direct")}
    >
      <div className="shrink-0">
        <label className="relative mx-4 my-2 flex items-center">
          <Search
            className="pointer-events-none absolute left-3 h-5 w-5"
            style={{ color: "var(--cm-chat-sub)" }}
            strokeWidth={1.7}
            aria-hidden
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("cm_pick_search_placeholder")}
            aria-label={t("cm_pick_search_placeholder")}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="h-[38px] w-full border-0 bg-[color:var(--cm-chat-band)] text-[16px] outline-none placeholder:text-[15px] placeholder:text-[color:var(--cm-chat-sub)] focus:ring-1 focus:ring-[color:var(--messenger-primary)]"
            data-cm-messenger-search-input=""
            style={{ color: "var(--cm-chat-fg)" }}
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={t("cm_pick_search_clear")}
              className="absolute right-1 flex h-9 w-9 items-center justify-center rounded-full"
              style={{ color: "var(--cm-chat-sub)" }}
            >
              <X className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            </button>
          ) : null}
        </label>
        {group && count > 0 ? (
          <ul
            role="list"
            aria-label={t("cm_pick_selected_strip_aria")}
            className="flex gap-2.5 overflow-x-auto border-b border-[color:var(--messenger-divider)] px-4 py-2.5"
            data-cm-friend-picker-picked=""
          >
            {picked.map((friend) => (
              <li key={friend.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => toggle(friend.id)}
                  aria-label={t("cm_pick_remove_aria", { name: friend.label })}
                  className="flex w-14 flex-col items-center gap-1"
                >
                  <SamarketUserAvatarThumb avatarUrl={friend.avatarUrl} size={44} roundedClassName="rounded-[16px]" />
                  <span className="w-full truncate text-center text-[12px] leading-[1.3]" style={{ color: "var(--cm-chat-fg)" }}>
                    {friend.label}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div
        className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${
          group
            ? bottomNavOccupiesClearance
              ? "pb-[calc(var(--app-bottom-nav-clearance)+74px)]"
              : "pb-[calc(var(--safe-bottom)+74px)]"
            : bottomNavOccupiesClearance
              ? "pb-[var(--app-bottom-nav-clearance)]"
              : "pb-[var(--safe-bottom)]"
        }`}
        data-cm-friend-picker-list=""
      >
        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-[14px]" style={{ color: "var(--cm-chat-sub)" }}>
            {pickable.length === 0 ? t("cm_ui_group_member_picker_empty_friends") : t("cm_ui_no_matching_friends")}
          </p>
        ) : (
          <ul role="list">
            {rows.map((friend) => {
              const on = selectedSet.has(friend.id);
              return (
                <li key={friend.id}>
                  <button
                    type="button"
                    onClick={() => (group ? toggle(friend.id) : onPickDirect(friend.id))}
                    {...(group ? { role: "checkbox", "aria-checked": on } : {})}
                    data-cm-friend-picker-row={friend.id}
                    className="flex h-16 w-full items-center gap-3 px-4 text-left transition-colors active:bg-[color:var(--cm-chat-band)]"
                  >
                    <SamarketUserAvatarThumb avatarUrl={friend.avatarUrl} size={44} roundedClassName="rounded-[16px]" />
                    <span
                      className="min-w-0 flex-1 truncate text-[16px] font-semibold leading-[1.3] tracking-[-0.2px]"
                      style={{ color: "var(--cm-chat-fg)" }}
                    >
                      {friend.label}
                    </span>
                    {group ? (
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-[1.5px] ${
                          on ? "border-sam-primary bg-sam-primary text-white" : "border-sam-border"
                        }`}
                        data-cm-friend-picker-check={on ? "on" : "off"}
                        aria-hidden
                      >
                        {on ? <Check className="h-4 w-4" strokeWidth={2.2} /> : null}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {group ? (
        <div
          className={`absolute inset-x-0 z-20 border-t border-[color:var(--messenger-divider)] bg-[color:var(--messenger-bg,#fff)] px-4 pb-3.5 pt-2.5 ${
            bottomNavOccupiesClearance ? "bottom-[var(--app-bottom-nav-clearance)]" : "bottom-0 pb-[max(14px,var(--safe-bottom))]"
          }`}
          data-cm-friend-picker-cta=""
        >
          <button
            type="button"
            onClick={onCreateGroup}
            disabled={!canCreateMessengerPickerGroup(count) || creatingGroup}
            className="h-[50px] w-full rounded-[12px] bg-sam-primary text-[16px] font-bold text-white transition active:opacity-90 disabled:opacity-40"
          >
            {creatingGroup
              ? t("cm_ui_creating")
              : count > 0
                ? t("cm_pick_create_group_cta", { count })
                : t("cm_pick_create_group_cta_empty")}
          </button>
        </div>
      ) : null}
    </section>
  );
}
