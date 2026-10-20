/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { MobileConfirmBottomSheet } from "@/components/ui/MobileConfirmBottomSheet";
import { MyStateView } from "@/components/mypage/ds/MyStateView";
import { formatMypageDate } from "@/lib/mypage/format-mypage-date";
import { showMypageToast } from "@/lib/mypage/mypage-toast";
import { useMypageListRestore } from "@/lib/mypage/use-mypage-list-restore";
import type { MessageKey } from "@/lib/i18n/messages";
import { Sam } from "@/lib/ui/sam-component-classes";
import {
  buildUserRelationDeleteUrl,
  userRelationReleaseNeedsConfirm,
} from "@/lib/mypage/user-relation-release";

type ListType = "favorite" | "hidden" | "blocked" | "neighbor";

interface UserListContentProps {
  type: ListType;
  emptyMessage: string;
}

type UserRelationItem = {
  id: string;
  targetId: string;
  nickname: string | null;
  username?: string | null;
  avatarUrl: string | null;
  regionName: string | null;
  createdAt: string;
};

/** 목록 종류별 해제 버튼 문구 (S14 — "삭제" 대신 해제 문구) */
export const USER_LIST_RELEASE_LABEL_KEYS: Record<ListType, MessageKey> = {
  favorite: "mypage_s14_release_favorite",
  blocked: "mypage_s14_release_blocked",
  hidden: "mypage_s14_release_hidden",
  neighbor: "community_neighbor_follow_remove",
};

const CONFIRM_KEYS: Record<ListType, { title: MessageKey; body: MessageKey; cta: MessageKey }> = {
  favorite: {
    title: "mypage_s14_confirm_favorite_title",
    body: "mypage_s14_confirm_favorite_body",
    cta: "mypage_s14_release_favorite",
  },
  blocked: {
    title: "mypage_s14_confirm_blocked_title",
    body: "mypage_s14_confirm_blocked_body",
    cta: "mypage_s14_confirm_release",
  },
  hidden: {
    title: "mypage_s14_confirm_hidden_title",
    body: "mypage_s14_confirm_hidden_body",
    cta: "mypage_s14_confirm_release",
  },
  neighbor: {
    title: "mypage_s14_confirm_neighbor_title",
    body: "mypage_s14_confirm_neighbor_body",
    cta: "community_neighbor_follow_remove",
  },
};

/**
 * 관심·차단·숨김(·이웃) 사용자 목록 (최종 설계 S14).
 * - 관심·차단·숨김 해제는 확인 시트 후 실행(관심 추가 POST API 가 없어 [되돌리기] 대신 확인 — 설계 대체 규칙).
 *   이웃(`neighbor`, 커뮤니티 공유 사용처)은 기존 즉시 해제 동작 유지.
 * - 해제 실패 = 토스트, 목록 유지. 첫 로딩 = 스켈레톤 행 5, 오류 = 재시도.
 */
export function UserListContent({ type, emptyMessage }: UserListContentProps) {
  const { t } = useI18n();
  const [items, setItems] = useState<UserRelationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<UserRelationItem | null>(null);
  useMypageListRestore({ ready: !loading });

  const load = useCallback(async () => {
    setLoading((prev) => (prev ? prev : true));
    setLoadError((prev) => (prev === null ? prev : null));
    try {
      const res = await runSingleFlight(`me:relations:${type}:list`, () =>
        fetch(`/api/me/relations/${type}`, {
          credentials: "include",
          cache: "no-store",
        })
      );
      const json = (await res.clone().json().catch(() => ({}))) as {
        ok?: boolean;
        items?: UserRelationItem[];
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setItems((prev) => (prev.length === 0 ? prev : []));
        setLoadError(t("settings_user_list_load_failed"));
        return;
      }
      const nextItems = Array.isArray(json.items) ? json.items : [];
      setItems((prev) => {
        if (
          prev.length === nextItems.length &&
          prev.every(
            (item, idx) =>
              item.id === nextItems[idx]?.id &&
              item.targetId === nextItems[idx]?.targetId &&
              item.createdAt === nextItems[idx]?.createdAt
          )
        ) {
          return prev;
        }
        return nextItems;
      });
    } catch {
      setItems((prev) => (prev.length === 0 ? prev : []));
      setLoadError(t("settings_user_list_load_failed"));
    } finally {
      setLoading((prev) => (prev ? false : prev));
    }
  }, [type, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const release = async (item: UserRelationItem) => {
    if (busyId) return;
    setBusyId(item.id);
    try {
      const res = await fetch(buildUserRelationDeleteUrl(type, item), {
        method: "DELETE",
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        showMypageToast(t("settings_user_list_delete_failed"), "error");
        return;
      }
      setItems((current) => current.filter((row) => row.id !== item.id));
      showMypageToast(t("mypage_s14_released_toast"), "success");
    } catch {
      showMypageToast(t("settings_user_list_delete_failed"), "error");
    } finally {
      setBusyId((prev) => (prev === null ? prev : null));
    }
  };

  if (loading) {
    return <MyStateView kind="loading" template="list" rows={5} listVariant="thumb" />;
  }

  if (loadError) {
    return <MyStateView kind="error" template="list" error={{ message: loadError, onRetry: () => void load() }} />;
  }

  if (items.length === 0) {
    return <MyStateView kind="empty" template="list" empty={{ title: emptyMessage }} />;
  }

  const confirmKeys = CONFIRM_KEYS[type];
  const confirmName = confirmTarget ? confirmTarget.nickname?.trim() || confirmTarget.targetId : "";

  return (
    <>
      <ul
        className="divide-y divide-sam-border-soft overflow-hidden rounded-ui-rect border border-sam-border-soft bg-sam-surface"
        data-testid="user-relation-list"
      >
        {items.map((item) => {
          const profileHref =
            item.username && item.username.trim()
              ? `/u/${encodeURIComponent(item.username.trim())}`
              : null;
          const identity = (
            <>
              <p className="truncate sam-text-body font-medium text-sam-fg">
                {item.nickname?.trim() || item.targetId}
              </p>
              {item.username ? (
                <p className="mt-0.5 truncate font-mono sam-text-xxs text-sam-muted tabular-nums">
                  @{item.username}
                </p>
              ) : null}
              <p className="mt-1 sam-text-helper text-sam-muted">
                {[item.regionName, formatMypageDate(item.createdAt)].filter(Boolean).join(" · ") || item.targetId}
              </p>
            </>
          );
          return (
            <li key={item.id} className="flex min-h-[64px] items-center justify-between gap-2 px-4 py-3 md:px-5">
              <div className="flex min-w-0 flex-1 items-center gap-3 pr-2">
                {item.avatarUrl ? (
                  <img
                    src={item.avatarUrl}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded-full bg-sam-app object-cover"
                  />
                ) : (
                  <div className="h-10 w-10 shrink-0 rounded-full border border-sam-border bg-sam-app" aria-hidden />
                )}
                <div className="min-w-0">
                  {profileHref ? (
                    <Link href={profileHref} className="block hover:opacity-80">
                      {identity}
                    </Link>
                  ) : (
                    identity
                  )}
                </div>
              </div>
              <button
                type="button"
                data-testid="user-relation-release"
                disabled={busyId === item.id}
                aria-busy={busyId === item.id}
                className={`${Sam.btn.secondaryCombo} ${Sam.btn.sm} ${Sam.focusRing} shrink-0 disabled:opacity-45`}
                onClick={() => {
                  /** 이웃(커뮤니티) 해제는 기존 동작 유지 — 즉시 실행 */
                  if (userRelationReleaseNeedsConfirm(type)) setConfirmTarget(item);
                  else void release(item);
                }}
              >
                {busyId === item.id ? t("settings_user_list_deleting") : t(USER_LIST_RELEASE_LABEL_KEYS[type])}
              </button>
            </li>
          );
        })}
      </ul>
      <MobileConfirmBottomSheet
        open={confirmTarget != null}
        title={t(confirmKeys.title, { name: confirmName })}
        description={t(confirmKeys.body)}
        cancelLabel={t("common_cancel")}
        confirmLabel={t(confirmKeys.cta)}
        confirmTone="primary"
        onCancel={() => setConfirmTarget(null)}
        onConfirm={() => {
          const target = confirmTarget;
          setConfirmTarget(null);
          if (target) void release(target);
        }}
      />
    </>
  );
}
