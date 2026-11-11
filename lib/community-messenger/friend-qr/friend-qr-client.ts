"use client";

import { copyTextToClipboard, isShareAbortError } from "@/lib/community/share/community-share-copy";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";

/**
 * 내 QR 공유·이미지 저장·다시 만들기 — 클라이언트 단일 정의 (QR 친구 재감사 Q1·Q2·Q9, 2026-11-12).
 *
 * - 취소(공유 창 닫기)는 실패가 아니다: 문구 없이 끝낸다 (Q2).
 * - 앱(Capacitor)에서는 아직 이미지 파일을 쓸 플러그인이 없어 「이미지 저장」을 숨긴다 (Q1 — WebView 의 `<a download>` 는
 *   저장되지 않는데 성공 문구가 떴다). 파일 플러그인을 넣는 네이티브 단계(S3)에서 이 함수만 바꾼다.
 */

export type FriendQrShareOutcome = "shared" | "copied" | "cancelled" | "failed";
export type FriendQrSaveOutcome = "saved" | "cancelled" | "failed";

type MyQr = { token: string; url: string };

function isCancelMessage(err: unknown): boolean {
  if (isShareAbortError(err)) return true;
  const msg = err && typeof err === "object" && "message" in err ? String((err as { message?: unknown }).message) : "";
  return /cancel/i.test(msg);
}

/**
 * 앱(Capacitor 셸) 여부 — 공용 판별 `isCapacitorNativePlatform` 만 쓴다.
 * 원격 server.url WebView 는 `Capacitor.isNativePlatform()` 이 web 을 돌려줄 때가 있어 bridge 로 판별한다 (PR #154 리뷰).
 * 화면이 열릴 때 한 번 구해 두고 공유·저장에 넘긴다(누른 순간 기다리지 않게).
 */
export function isFriendQrNativeApp(): boolean {
  return isCapacitorNativePlatform();
}

/**
 * 공유 = QR 카드 이미지 + 링크 글.
 * - 브라우저: `navigator.share` 를 누른 동작 안에서 바로 부른다 — 앞에서 아무것도 기다리지 않는다
 *   (기다리면 브라우저가 공유 창을 막는다, PR #154 리뷰). 이미지는 미리 만들어 둔 것만 쓴다.
 * - 앱: 링크 공유(이미지 파일은 S3). 앱 공유 창은 누른 동작 제한이 없다.
 * - 공유가 없거나 실패 → 링크 복사.
 */
export async function shareFriendQr(args: {
  native: boolean;
  title: string;
  text: string;
  url: string;
  image?: Blob | null;
}): Promise<FriendQrShareOutcome> {
  if (args.native) {
    try {
      const { Share } = await import("@capacitor/share");
      await Share.share({ title: args.title, text: args.text, url: args.url, dialogTitle: args.title });
      return "shared";
    } catch (err) {
      if (isCancelMessage(err)) return "cancelled";
      return (await copyTextToClipboard(args.url)) === "failed" ? "failed" : "copied";
    }
  }
  const nav = typeof navigator !== "undefined" ? (navigator as Navigator & { canShare?: (d: ShareData) => boolean }) : null;
  if (nav && typeof nav.share === "function") {
    const file = args.image ? new File([args.image], "dibay-qr.png", { type: "image/png" }) : null;
    const data: ShareData =
      file && nav.canShare?.({ files: [file] })
        ? { title: args.title, text: `${args.text}\n${args.url}`, files: [file] }
        : { title: args.title, text: args.text, url: args.url };
    try {
      await nav.share(data);
      return "shared";
    } catch (err) {
      if (isCancelMessage(err)) return "cancelled";
    }
  }
  return (await copyTextToClipboard(args.url)) === "failed" ? "failed" : "copied";
}

/** 브라우저 내려받기 — 앱에서는 버튼을 숨겨 부르지 않는다 (S3 전) */
export function saveFriendQrImage(image: Blob, fileName = "dibay-qr.png"): FriendQrSaveOutcome {
  try {
    const url = URL.createObjectURL(image);
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    return "saved";
  } catch (err) {
    return isCancelMessage(err) ? "cancelled" : "failed";
  }
}

/** QR 다시 만들기 — 내 QR 시트·설정 공용 (Q9) */
export async function requestFriendQrRegenerate(): Promise<MyQr | null> {
  try {
    const r = await fetch("/api/community-messenger/friend-qr/regenerate", { method: "POST", credentials: "include" });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; qr?: MyQr };
    return r.ok && j.ok === true && j.qr ? j.qr : null;
  } catch {
    return null;
  }
}
