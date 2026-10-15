"use client";

/** 사진 여러 장 전송 방식 — 묶어 보내기(앨범 1건, 기본) / 한 장씩 따로 보내기. 기기별 마지막 선택 유지. */
const SEND_AS_ALBUM_KEY = "cm:attach:send-as-album";

export function readMessengerSendAsAlbumPreference(): boolean {
  try {
    return typeof window === "undefined" || window.localStorage.getItem(SEND_AS_ALBUM_KEY) !== "0";
  } catch {
    return true;
  }
}

export function writeMessengerSendAsAlbumPreference(sendAsAlbum: boolean): void {
  try {
    window.localStorage.setItem(SEND_AS_ALBUM_KEY, sendAsAlbum ? "1" : "0");
  } catch {
    /* storage 차단 — 현재 화면 상태에만 적용 */
  }
}
