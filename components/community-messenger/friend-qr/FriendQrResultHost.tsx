"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MessengerHomeBottomSheetShell } from "@/components/community-messenger/MessengerSheetUi";
import { SamarketUserAvatar } from "@/components/profile/SamarketUserAvatar";
import { useFriendQrResultStore } from "@/lib/community-messenger/friend-qr/friend-qr-result-store";
import {
  FRIEND_QR_HOME_QUERY_KEY,
  friendQrErrorMessageKey,
  isFriendQrToken,
} from "@/lib/community-messenger/friend-qr/friend-qr-contract";
import { formatAtUsername } from "@/lib/users/user-label";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";

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
  const [errorKey, setErrorKey] = useState<"friend_qr_err_self" | "friend_qr_err_unusable" | null>(null);
  const [adding, setAdding] = useState(false);

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
        const j = (await r.json().catch(() => ({}))) as { ok?: boolean; preview?: Preview; error?: string };
        if (cancelled) return;
        if (!r.ok || j.ok !== true || !j.preview) {
          setErrorKey(friendQrErrorMessageKey(j.error));
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
  }, [token]);

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
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; peerUserId?: string; error?: string };
      if (!r.ok || j.ok !== true || !j.peerUserId) {
        setErrorKey(friendQrErrorMessageKey(j.error));
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
  }, [adding, close, onAdded, preview, t, token]);

  if (!token) return null;

  const atId = preview?.dibayId ? formatAtUsername(preview.dibayId) : null;

  return (
    <MessengerHomeBottomSheetShell onClose={close} closeAriaLabel={t("nav_close")} dialogAriaLabel={t("friend_qr_add")}>
      <div className="grid gap-3 px-4 pb-5 pt-4" data-testid="friend-qr-result">
        {preview && !preview.isSelf ? (
          <div className="grid justify-items-center gap-1.5 text-center">
            <SamarketUserAvatar avatarUrl={preview.avatarUrl} sizePx={72} alt="" />
            <p className="text-[length:var(--overlay-title-2-size)] font-bold" style={{ color: "var(--overlay-text-primary)" }}>
              {preview.displayName || t("friend_qr_member_fallback")}
            </p>
            {atId ? <p className="text-[length:var(--overlay-body-2-size)] font-semibold text-sam-primary">{atId}</p> : null}
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
              className="dibay-overlay-btn dibay-overlay-btn--primary w-full"
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
              className="dibay-overlay-btn dibay-overlay-btn--primary w-full"
              disabled={adding}
              aria-busy={adding}
              onClick={() => void add()}
              data-testid="friend-qr-add"
            >
              {t("friend_qr_add")}
            </button>
          )
        ) : null}
        <button type="button" className="dibay-overlay-btn dibay-overlay-btn--secondary w-full" onClick={close}>
          {t("common_cancel")}
        </button>
      </div>
    </MessengerHomeBottomSheetShell>
  );
}
