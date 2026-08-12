/** GATE 3 admin INSERT ingress trace — not sound authority. */

const PREFIX = "[dibay-admin-sound]";

export type AdminSoundTraceRow = {
  t: number;
  stage: string;
  [key: string]: unknown;
};

export function traceAdminSound(stage: string, payload: Record<string, unknown> = {}): void {
  const row: AdminSoundTraceRow = { t: Date.now(), stage, ...payload };
  try {
    console.info(`${PREFIX} ${JSON.stringify(row)}`);
  } catch {
    /* ignore */
  }
  if (typeof window === "undefined") return;
  const w = window as Window & { __dibayAdminSoundTrace?: AdminSoundTraceRow[] };
  if (!Array.isArray(w.__dibayAdminSoundTrace)) w.__dibayAdminSoundTrace = [];
  w.__dibayAdminSoundTrace.push(row);
  if (w.__dibayAdminSoundTrace.length > 80) {
    w.__dibayAdminSoundTrace.splice(0, w.__dibayAdminSoundTrace.length - 80);
  }
}
