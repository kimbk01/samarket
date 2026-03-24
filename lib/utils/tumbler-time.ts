/** 24h "HH:mm" ↔ 12h 휠 값 */
export function hhmm24ToWheelParts(hhmm: string): { h12: number; minute: number; pm: boolean } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return { h12: 9, minute: 0, pm: false };
  let H = Number(m[1]);
  const minute = Number(m[2]);
  if (!Number.isFinite(H) || !Number.isFinite(minute)) return { h12: 9, minute: 0, pm: false };
  H = Math.min(23, Math.max(0, H));
  const mm = Math.min(59, Math.max(0, minute));
  const pm = H >= 12;
  let h12 = H % 12;
  if (h12 === 0) h12 = 12;
  return { h12, minute: mm, pm };
}

export function wheelPartsToHHmm24(h12: number, minute: number, pm: boolean): string {
  const mm = Math.min(59, Math.max(0, minute));
  const h = Math.min(12, Math.max(1, h12));
  let H: number;
  if (pm) {
    H = h === 12 ? 12 : h + 12;
  } else {
    H = h === 12 ? 0 : h;
  }
  return `${String(H).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function formatHHmm12hLabel(hhmm24: string): string {
  const { h12, minute, pm } = hhmm24ToWheelParts(hhmm24);
  const mm = String(minute).padStart(2, "0");
  return `${h12}:${mm} ${pm ? "PM" : "AM"}`;
}
