"use client";

/** P4 APK-distributed QA — ring buffer + localStorage for Device B (no USB logcat). */

export type DibayCallQaLogEntry = {
  at: number;
  step: string;
  callId?: string;
  mediaType?: string;
  phase?: string;
  reason?: string;
  cleanupReason?: string;
  extra?: Record<string, unknown>;
};

const STORAGE_KEY = "dibay_call_qa_logs_v1";
const MAX_ENTRIES = 300;

let memoryEntries: DibayCallQaLogEntry[] = [];

function readStored(): DibayCallQaLogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DibayCallQaLogEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(entries: DibayCallQaLogEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    /* quota */
  }
}

function syncWindowExport(entries: DibayCallQaLogEntry[]): void {
  if (typeof window === "undefined") return;
  window.__dibayCallQaLogs = {
    entries,
    exportText: () => exportDibayCallQaLogsText(),
    clear: () => clearDibayCallQaLogs(),
  };
}

export function appendDibayCallQaLog(
  input: Omit<DibayCallQaLogEntry, "at"> & { at?: number },
): void {
  if (typeof window !== "undefined" && memoryEntries.length === 0) {
    memoryEntries = readStored();
  }
  const entry: DibayCallQaLogEntry = {
    at: input.at ?? Date.now(),
    step: input.step,
    callId: input.callId,
    mediaType: input.mediaType,
    phase: input.phase,
    reason: input.reason,
    cleanupReason: input.cleanupReason,
    extra: input.extra,
  };
  memoryEntries = [...memoryEntries, entry].slice(-MAX_ENTRIES);
  if (typeof window === "undefined") return;
  persist(memoryEntries);
  syncWindowExport(memoryEntries);
}

export function getDibayCallQaLogs(): DibayCallQaLogEntry[] {
  if (typeof window !== "undefined" && memoryEntries.length === 0) {
    memoryEntries = readStored();
  }
  return [...memoryEntries];
}

export function clearDibayCallQaLogs(): void {
  memoryEntries = [];
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  syncWindowExport([]);
}

export function exportDibayCallQaLogsText(): string {
  return getDibayCallQaLogs()
    .map((e) => {
      const parts = [
        new Date(e.at).toISOString(),
        e.step,
        e.callId ? `callId=${e.callId}` : null,
        e.mediaType ? `media=${e.mediaType}` : null,
        e.phase ? `phase=${e.phase}` : null,
        e.cleanupReason ? `cleanup=${e.cleanupReason}` : null,
        e.reason ? `reason=${e.reason}` : null,
        e.extra ? JSON.stringify(e.extra) : null,
      ].filter(Boolean);
      return parts.join(" ");
    })
    .join("\n");
}

declare global {
  interface Window {
    __dibayCallQaLogs?: {
      entries: DibayCallQaLogEntry[];
      exportText: () => string;
      clear: () => void;
    };
  }
}
