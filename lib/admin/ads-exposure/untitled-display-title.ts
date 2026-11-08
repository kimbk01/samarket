
import { translate, type MessageKey } from "@/lib/i18n/messages";

/** 언어 SSOT B4 — 불리언 언어 값으로 카탈로그 문구를 고른다(원래 `ko ? "…" : "…"` 와 같은 결과). */
function tx(ko: unknown, key: MessageKey, vars?: Record<string, string | number>): string {
  return translate(ko ? "ko" : "en", key, vars);
}

export const PLATFORM_POPUP_UNTITLED_NAMES = new Set([
  "새 팝업 캠페인",
  "Untitled popup",
  "New popup campaign",
]);

export function isPlatformPopupUntitledName(name: string | null | undefined): boolean {
  const normalized = String(name ?? "").trim().toLocaleLowerCase();
  if (!normalized) return true;
  return [...PLATFORM_POPUP_UNTITLED_NAMES].some(
    (candidate) => candidate.toLocaleLowerCase() === normalized
  );
}

export function popupOperationalDisplayTitle(input: {
  name: string | null | undefined;
  id: string;
  updatedAt?: string | null;
  createdAt?: string | null;
  ko: boolean;
}): string {
  const name = String(input.name ?? "").trim();
  if (!isPlatformPopupUntitledName(name)) return name;

  const rawDate = input.updatedAt || input.createdAt;
  const date = rawDate ? new Date(rawDate) : null;
  const dateLabel =
    date && Number.isFinite(date.getTime())
      ? `${String(date.getUTCMonth() + 1).padStart(2, "0")}/${String(date.getUTCDate()).padStart(2, "0")}`
      : "--/--";
  const prefix = tx(input.ko, "admin_ads_exposure_popup");
  return `${prefix} · ${dateLabel} · ${input.id.slice(0, 8)}`;
}
