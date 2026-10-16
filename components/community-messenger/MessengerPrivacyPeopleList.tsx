"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { DibayConfirmDialog } from "@/components/ui/dibay-overlay";
import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";
import type { MessengerPrivacyListsStatus } from "@/lib/community-messenger/home/use-community-messenger-home-bootstrap";

export type MessengerPrivacyPeopleKind = "hidden" | "blocked";

/**
 * 숨김친구·차단친구 목록 — 카톡 「친구 관리」 형태 단일 정의.
 * 사진·이름·[숨김해제]/[차단해제](확인 후 실행). 불러오는 중 / 실패(다시 시도) / 비어 있음 을 구분한다
 * (목록을 아직 모르는 상태를 "없음" 으로 보여 주지 않는다).
 * 친구 관리 시트·보관함·설정 시트가 같은 컴포넌트를 쓴다.
 */
export function MessengerPrivacyPeopleList({
  kind,
  people,
  status,
  busyId,
  onRelease,
  onRetry,
}: {
  kind: MessengerPrivacyPeopleKind;
  people: CommunityMessengerProfileLite[];
  status: MessengerPrivacyListsStatus;
  busyId: string | null;
  onRelease: (userId: string) => void;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  const [confirmTarget, setConfirmTarget] = useState<CommunityMessengerProfileLite | null>(null);
  const busyKey = (id: string) => (kind === "hidden" ? `hidden:${id}` : `block:${id}`);
  const releaseLabel = kind === "hidden" ? t("cm_ui_unhide_friend") : t("cm_ui_unblock_friend");

  let body: React.ReactNode;
  if (people.length === 0 && (status === "idle" || status === "loading")) {
    body = (
      <div className="flex items-center justify-center gap-2 px-4 py-8" role="status">
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-[color:var(--messenger-divider)] border-t-[color:var(--messenger-primary)]"
          aria-hidden
        />
        <span className="sam-text-body-secondary" style={{ color: "var(--messenger-text-secondary)" }}>
          {t("cm_ui_privacy_list_loading")}
        </span>
      </div>
    );
  } else if (people.length === 0 && status === "error") {
    body = (
      <div className="flex flex-col items-center gap-3 px-4 py-8">
        <p className="text-center sam-text-body-secondary" style={{ color: "var(--messenger-text-secondary)" }}>
          {t("cm_ui_privacy_list_load_failed")}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-ui-rect border border-[color:var(--messenger-divider)] px-3 py-1.5 sam-text-helper font-medium"
          style={{ color: "var(--messenger-text)" }}
        >
          {t("cm_ui_retry")}
        </button>
      </div>
    );
  } else if (people.length === 0) {
    body = (
      <p className="px-4 py-8 text-center sam-text-body-secondary" style={{ color: "var(--messenger-text-secondary)" }}>
        {kind === "hidden" ? t("cm_ui_hidden_friends_empty") : t("cm_ui_blocked_friends_empty")}
      </p>
    );
  } else {
    body = (
      <ul className="divide-y divide-[color:var(--messenger-divider)]" data-cm-privacy-list={kind}>
        {people.map((p) => {
          const initial = p.label.trim().slice(0, 1) || "?";
          const busy = busyId === busyKey(p.id);
          return (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
              <SamarketThumbnail
                src={p.avatarUrl}
                size={40}
                roundedClassName="rounded-full"
                className="bg-[color:var(--messenger-surface-muted)]"
                fallbackSrc=""
                fallbackNode={
                  <div
                    className="flex h-full w-full items-center justify-center sam-text-body-secondary font-semibold"
                    style={{ color: "var(--messenger-text-secondary)" }}
                  >
                    {initial}
                  </div>
                }
              />
              <div className="min-w-0 flex-1">
                <p className="truncate sam-text-body font-medium" style={{ color: "var(--messenger-text)" }}>
                  {p.label}
                </p>
                {p.subtitle ? (
                  <p className="truncate sam-text-xxs" style={{ color: "var(--messenger-text-secondary)" }}>
                    {p.subtitle}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setConfirmTarget(p)}
                disabled={busy}
                className="shrink-0 rounded-ui-rect border border-[color:var(--messenger-divider)] px-2.5 py-1.5 sam-text-helper font-medium disabled:opacity-50"
                style={{ color: "var(--messenger-text)" }}
              >
                {busy ? "…" : releaseLabel}
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  const name = confirmTarget?.label.trim() || "";
  return (
    <>
      {body}
      <DibayConfirmDialog
        open={confirmTarget != null}
        title={kind === "hidden" ? t("cm_ui_unhide_confirm_title") : t("cm_ui_unblock_confirm_title")}
        description={
          kind === "hidden"
            ? t("cm_ui_unhide_confirm_body", { name })
            : t("cm_ui_unblock_confirm_body", { name })
        }
        cancelLabel={t("common_cancel")}
        confirmLabel={releaseLabel}
        onCancel={() => setConfirmTarget(null)}
        onConfirm={() => {
          const target = confirmTarget;
          setConfirmTarget(null);
          if (target) onRelease(target.id);
        }}
      />
    </>
  );
}
