import {
  OPERATIONAL_FREQUENCY_ORDER,
  type OperationalFrequencyClass,
} from "./types";

/** Operational semantics — never claim measured usage %. */
export const OPERATIONAL_FREQUENCY_LABEL = {
  DAILY_CRITICAL: {
    ko: "실시간 처리",
    en: "Real-time operations",
    purpose: "Repeated same-day operator actions that unblock users/stores",
  },
  FREQUENT: {
    ko: "반복 관리",
    en: "Routine management",
    purpose: "Daily/weekly entity management lists",
  },
  OCCASIONAL: {
    ko: "가끔 처리",
    en: "Occasional handling",
    purpose: "Infrequent but operational tasks",
  },
  CONFIGURATION: {
    ko: "설정",
    en: "Configuration",
    purpose: "Policies and settings",
  },
  ARCHIVE: {
    ko: "기록",
    en: "Records / archive",
    purpose: "Logs, history, deprecated compat",
  },
} as const satisfies Record<
  OperationalFrequencyClass,
  { ko: string; en: string; purpose: string }
>;

export function compareOperationalFrequency(
  a: OperationalFrequencyClass,
  b: OperationalFrequencyClass
): number {
  return OPERATIONAL_FREQUENCY_ORDER[a] - OPERATIONAL_FREQUENCY_ORDER[b];
}

export function sortByOperationalFrequency<T extends { frequency: OperationalFrequencyClass }>(
  entries: readonly T[]
): T[] {
  return [...entries].sort((x, y) => {
    const byFreq = compareOperationalFrequency(x.frequency, y.frequency);
    if (byFreq !== 0) return byFreq;
    const ox = "order" in x && typeof (x as { order?: number }).order === "number"
      ? (x as { order: number }).order
      : 0;
    const oy = "order" in y && typeof (y as { order?: number }).order === "number"
      ? (y as { order: number }).order
      : 0;
    return ox - oy;
  });
}
