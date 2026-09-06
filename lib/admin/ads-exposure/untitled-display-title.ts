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
  const prefix = input.ko ? "팝업" : "Popup";
  return `${prefix} · ${dateLabel} · ${input.id.slice(0, 8)}`;
}
