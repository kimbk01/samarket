"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MessengerHomeBottomSheetShell, MessengerSheetHeaderBar } from "@/components/community-messenger/MessengerSheetUi";
import { SamarketUserAvatar } from "@/components/profile/SamarketUserAvatar";
import { useFriendQrResultStore } from "@/lib/community-messenger/friend-qr/friend-qr-result-store";
import {
  buildFriendQrHomePath,
  FRIEND_QR_HOME_QUERY_KEY,
  friendQrErrorMessageKey,
  isFriendQrToken,
} from "@/lib/community-messenger/friend-qr/friend-qr-contract";
import { formatAtUsername } from "@/lib/users/user-label";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import { handleProfileIncompleteApiResponse, type ProfileIncompleteApiPayload } from "@/lib/profile/handle-profile-incomplete-api-response";
import { redirectForBlockedAction } from "@/lib/auth/client-access-flow";
import { MemberAtIdText } from "@/components/profile/MemberAtIdText";

type Preview = {
  userId: string;
  dibayId: string | null;
  displayName: string;
  avatarUrl: string | null;
  isSelf: boolean;
  isFriend: boolean;
};

/**
 * 스캔 결과 시트 (설계안 v3 §3.6 · 시안 D) — 메신저 홈에 하나만 둔다.
 * 토큰 출처: 앱 안 스캔·갤러리(`useFriendQrResultStore.open`), 주소 `?friendQr=` (웹 /f · `dibay://friend/`).
 * 사진·이름·@회원 아이디 → [친구 추가] = 바로 친구 (이미 친구면 [대화하기]). 실패 문구는 하나.
 */
export function FriendQrResultHost({
  onAdded,
  onOpenChat,
}: {
  onAdded: (peerUserId: string) => void;
  onOpenChat: (peerUserId: string) => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const token = useFriendQrResultStore((s) => s.token);
  const open = useFriendQrResultStore((s) => s.open);
  const close = useFriendQrResultStore((s) => s.close);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [errorKey, setErrorKey] = useState<"friend_qr_err_self" | "friend_qr_err_unusable" | "common_try_again_later" | null>(null);
  const [adding, setAdding] = useState(false);

  /**
   * 실패 이유별 처리 (재감사 Q3): 가입·프로필 미완료 → 앱 공용 안내(시트 닫음), 너무 잦은 시도(429) → 잠시 후,
   * 그 밖(옛 QR·QR 친구 추가 끔·차단·탈퇴 — 이유를 숨김) → 「이 QR로는 친구를 추가할 수 없어요」 하나.
   * 안내를 마치고 돌아올 곳 = 같은 QR 결과 시트(`?friendQr=`) — 다시 스캔하지 않게 (PR #154 리뷰).
   */
  const applyFailure = useCallback(
    (status: number, j: ProfileIncompleteApiPayload & { error?: string }, failedToken: string) => {
      const returnTo = buildFriendQrHomePath(failedToken);
      if (
        handleProfileIncompleteApiResponse(j, { returnTo }).handled ||
        redirectForBlockedAction(router, j.error ?? j.code, returnTo)
      ) {
        close();
        return;
      }
      setErrorKey(status === 429 ? "common_try_again_later" : friendQrErrorMessageKey(j.error));
    },
    [close, router],
  );

  /** 주소로 들어온 토큰 → 시트를 열고 주소에서 지운다 (뒤로가기로 다시 열리지 않게) */
  const queryToken = searchParams.get(FRIEND_QR_HOME_QUERY_KEY)?.trim() ?? "";
  useEffect(() => {
    if (!queryToken) return;
    if (isFriendQrToken(queryToken)) open(queryToken);
    const next = new URLSearchParams(searchParams.toString());
    next.delete(FRIEND_QR_HOME_QUERY_KEY);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : (pathname ?? "/community-messenger"), { scroll: false });
  }, [open, pathname, queryToken, router, searchParams]);

  useEffect(() => {
    setPreview(null);
    setErrorKey(null);
    if (!token) return;
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch(`/api/community-messenger/friend-qr/resolve?token=${encodeURIComponent(token)}`, {
          credentials: "include",
          cache: "no-store",
        });
        const j = (await r.json().catch(() => ({}))) as ProfileIncompleteApiPayload & { preview?: Preview };
        if (cancelled) return;
        if (!r.ok || j.ok !== true || !j.preview) {
          applyFailure(r.status, j, token);
          return;
        }
        setPreview(j.preview);
        if (j.preview.isSelf) setErrorKey("friend_qr_err_self");
      } catch {
        if (!cancelled) setErrorKey("friend_qr_err_unusable");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyFailure, token]);

  const add = useCallback(async () => {
    if (!token || !preview || adding) return;
    setAdding(true);
    try {
      const r = await fetch("/api/community-messenger/friend-qr/add", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const j = (await r.json().catch(() => ({}))) as ProfileIncompleteApiPayload & { peerUserId?: string };
      if (!r.ok || j.ok !== true || !j.peerUserId) {
        applyFailure(r.status, j, token);
        return;
      }
      showMessengerSnackbar(t("friend_qr_added", { name: preview.displayName || t("friend_qr_member_fallback") }), {
        variant: "success",
      });
      onAdded(j.peerUserId);
      close();
    } catch {
      setErrorKey("friend_qr_err_unusable");
    } finally {
      setAdding(false);
    }
  }, [adding, applyFailure, close, onAdded, preview, t, token]);

  if (!token) return null;

  const atId = preview?.dibayId ? formatAtUsername(preview.dibayId) : null;

  return (
    <MessengerHomeBottomSheetShell onClose={close} closeAriaLabel={t("nav_close")} dialogAriaLabel={t("friend_qr_add")}>
      {/** 머리 = 메신저 시트 공용(손잡이·제목·닫기 X) — 닫기는 X 하나, 본문 하단 = 기기 안전 영역 */}
      <MessengerSheetHeaderBar title={t("friend_qr_add")} onClose={close} closeLabel={t("nav_close")} />
      <div className="grid gap-3 px-4 pb-[max(1rem,var(--kb-safe-bottom))] pt-4" data-testid="friend-qr-result">
        {preview && !preview.isSelf ? (
          <div className="grid justify-items-center gap-1.5 text-center">
            <SamarketUserAvatar avatarUrl={preview.avatarUrl} sizePx={72} alt="" />
            <p
              className="mt-1.5 max-w-full text-[length:var(--overlay-title-2-size)] font-bold leading-[1.35] [overflow-wrap:anywhere] [text-wrap:balance]"
              style={{ color: "var(--overlay-text-primary)" }}
            >
              {preview.displayName || t("friend_qr_member_fallback")}
            </p>
            {atId ? (
              <p className="max-w-full text-[length:var(--overlay-body-2-size)] font-semibold text-sam-primary">
                <MemberAtIdText value={atId} />
              </p>
            ) : null}
            <p className="text-[length:var(--overlay-caption-size)]" style={{ color: "var(--overlay-text-secondary)" }}>
              {preview.isFriend ? t("friend_qr_already_friend") : t("friend_qr_result_source")}
            </p>
          </div>
        ) : null}
        {errorKey ? (
          <p className="text-center text-[length:var(--overlay-body-2-size)]" style={{ color: "var(--overlay-danger)" }} role="alert">
            {t(errorKey)}
          </p>
        ) : null}
        {!preview && !errorKey ? (
          <p className="text-center text-[length:var(--overlay-body-2-size)]" style={{ color: "var(--overlay-text-secondary)" }}>
            {t("common_loading")}
          </p>
        ) : null}
        {preview && !preview.isSelf && !errorKey ? (
          preview.isFriend ? (
            <button
              type="button"
              className="dibay-overlay-btn dibay-overlay-btn--primary w-full whitespace-nowrap"
              onClick={() => {
                close();
                onOpenChat(preview.userId);
              }}
            >
              {t("friend_qr_open_chat")}
            </button>
          ) : (
            <button
              type="button"
              className="dibay-overlay-btn dibay-overlay-btn--primary w-full whitespace-nowrap"
              disabled={adding}
              aria-busy={adding}
              onClick={() => void add()}
              data-testid="friend-qr-add"
            >
              {t("friend_qr_add")}
            </button>
          )
        ) : null}
      </div>
    </MessengerHomeBottomSheetShell>
  );
}
