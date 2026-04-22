"use client";

import type { CommunityMessengerDiscoverableGroupSummary } from "@/lib/community-messenger/types";

export type MeetingJoinPreviewFullScreenProps = {
  group: CommunityMessengerDiscoverableGroupSummary;
  busy: boolean;
  onClose: () => void;
  onJoin: () => void;
  joinPassword: string;
  onJoinPasswordChange: (value: string) => void;
  joinIdentityMode: "real_name" | "alias";
  onJoinIdentityModeChange: (mode: "real_name" | "alias") => void;
  joinAliasName: string;
  onJoinAliasNameChange: (value: string) => void;
  joinAliasAvatarUrl: string;
  onJoinAliasAvatarUrlChange: (value: string) => void;
  joinAliasBio: string;
  onJoinAliasBioChange: (value: string) => void;
};

/**
 * 모임 오픈그룹 입장 전 풀스크린 미리보기 — 카카오 오픈채팅형 하단 고정 CTA.
 */
export function MeetingJoinPreviewFullScreen({
  group,
  busy,
  onClose,
  onJoin,
  joinPassword,
  onJoinPasswordChange,
  joinIdentityMode,
  onJoinIdentityModeChange,
  joinAliasName,
  onJoinAliasNameChange,
  joinAliasAvatarUrl,
  onJoinAliasAvatarUrlChange,
  joinAliasBio,
  onJoinAliasBioChange,
}: MeetingJoinPreviewFullScreenProps) {
  const joinDisabled =
    busy ||
    (group.joinPolicy === "password" && !joinPassword.trim()) ||
    (joinIdentityMode === "alias" && group.identityPolicy === "alias_allowed" && !joinAliasName.trim());

  return (
    <div className="fixed inset-0 z-[55] flex flex-col bg-[color:var(--messenger-bg)]" role="dialog" aria-modal="true">
      <header className="flex shrink-0 items-center justify-between border-b border-[color:var(--messenger-divider)] px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onClose}
          className="rounded-ui-rect px-3 py-2 sam-text-body-secondary font-medium text-[color:var(--messenger-text)]"
        >
          닫기
        </button>
        <span className="sam-text-body-secondary font-semibold text-[color:var(--messenger-text)]">모임 미리보기</span>
        <span className="w-14" aria-hidden />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div
          className="relative min-h-[38vh] bg-gradient-to-br from-emerald-600 via-teal-600 to-sky-700 px-4 pb-10 pt-8"
          style={{ color: "#fff" }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
          <div className="relative z-[1]">
            <h1 className="sam-text-page-title font-bold leading-tight tracking-tight drop-shadow-sm">{group.title}</h1>
            <p className="mt-2 max-h-28 overflow-y-auto sam-text-body-secondary leading-snug text-white/95">
              {group.summary || "한줄 소개가 없습니다."}
            </p>
            <p className="mt-4 sam-text-xxs font-medium text-white/85">
              방장 {group.ownerLabel} · {group.memberCount}명
              {group.memberLimit ? ` / 최대 ${group.memberLimit}명` : ""}
            </p>
          </div>
        </div>

        <div className="space-y-3 px-4 py-4">
          <div className="flex flex-wrap gap-2 sam-text-xxs font-semibold">
            <span className="rounded-full border border-sam-border bg-sam-surface px-2 py-1 text-sam-muted">
              {group.joinPolicy === "password" ? "비밀번호 입장" : "자유 입장"}
            </span>
            <span className="rounded-full border border-sam-border bg-sam-surface px-2 py-1 text-sam-muted">
              {group.identityPolicy === "alias_allowed" ? "별칭 허용" : "실명 기반"}
            </span>
          </div>

          {group.joinPolicy === "password" ? (
            <input
              value={joinPassword}
              onChange={(e) => onJoinPasswordChange(e.target.value)}
              placeholder="비밀번호 입력"
              className="h-12 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 sam-text-body outline-none focus:border-sam-border"
            />
          ) : null}

          <div className="rounded-ui-rect border border-sam-border-soft bg-sam-surface px-4 py-4">
            <p className="sam-text-body-secondary font-semibold text-sam-fg">표시 이름</p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => onJoinIdentityModeChange("real_name")}
                className={`rounded-ui-rect border px-3 py-2 sam-text-helper font-semibold ${
                  joinIdentityMode === "real_name"
                    ? "border-sam-border bg-sam-surface-muted text-sam-fg"
                    : "border-sam-border bg-sam-app text-sam-muted"
                }`}
              >
                실명 프로필
              </button>
              {group.identityPolicy === "alias_allowed" ? (
                <button
                  type="button"
                  onClick={() => onJoinIdentityModeChange("alias")}
                  className={`rounded-ui-rect border px-3 py-2 sam-text-helper font-semibold ${
                    joinIdentityMode === "alias"
                      ? "border-sam-border bg-sam-surface-muted text-sam-fg"
                      : "border-sam-border bg-sam-app text-sam-muted"
                  }`}
                >
                  방별 별칭
                </button>
              ) : null}
            </div>
            {joinIdentityMode === "alias" && group.identityPolicy === "alias_allowed" ? (
              <div className="mt-3 grid gap-3">
                <input
                  value={joinAliasName}
                  onChange={(e) => onJoinAliasNameChange(e.target.value)}
                  placeholder="별칭 닉네임"
                  className="h-11 w-full rounded-ui-rect border border-sam-border px-3 sam-text-body outline-none focus:border-sam-border"
                />
                <input
                  value={joinAliasAvatarUrl}
                  onChange={(e) => onJoinAliasAvatarUrlChange(e.target.value)}
                  placeholder="아바타 URL (선택)"
                  className="h-11 w-full rounded-ui-rect border border-sam-border px-3 sam-text-body outline-none focus:border-sam-border"
                />
                <textarea
                  value={joinAliasBio}
                  onChange={(e) => onJoinAliasBioChange(e.target.value)}
                  rows={2}
                  placeholder="소개 (선택)"
                  className="w-full rounded-ui-rect border border-sam-border px-3 py-3 sam-text-body outline-none focus:border-sam-border"
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] px-4 py-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          disabled={joinDisabled}
          onClick={() => void onJoin()}
          className="flex h-12 w-full items-center justify-center rounded-ui-rect bg-[color:var(--messenger-primary)] sam-text-body-secondary font-bold text-white shadow-[var(--messenger-shadow-soft)] disabled:opacity-40"
        >
          {busy ? "입장 중…" : "모임 참여하기"}
        </button>
      </div>
    </div>
  );
}
