/**
 * 앱 진입 어드민 v3 §B 「한눈에 보기」 응답 모양 — 화면(클라이언트)·서버·테스트가 같이 쓴다(서버 모듈 import 없음).
 */
import type { InitialAppSurface } from "@/lib/startup/initial-app-surface";

/** 마지막 변경 — `admin_settings.updated_at` · `audit_logs` 최신 저장 행 */
export type StartupConfigLastChange = {
  at: string | null;
  actorId: string | null;
  actorLabel: string | null;
};

export type AppEntryFail = { ok: false; error: string };

export const APP_ENTRY_INSTALL_WINDOW_DAYS = 30;
/** 설치 버전 분포 조회 상한(행). 넘으면 `truncated: true` */
export const APP_ENTRY_INSTALL_ROW_LIMIT = 20000;

export type AppEntryOverviewOs =
  | {
      ok: true;
      build: { backgroundColor: string; logoSha256: string };
      pending: { backgroundColor: string; logoSha256: string | null; updatedAt: string | null } | null;
      pendingChanged: boolean;
      applyModel: "next_native_build";
    }
  | AppEntryFail;

export type AppEntryOverviewFirstEntry =
  | {
      ok: true;
      initialSurface: InitialAppSurface;
      path: string;
      source: "db" | "default";
      lastChange: StartupConfigLastChange;
    }
  | AppEntryFail;

export type AppEntryOverviewIntro = {
  pool:
    | {
        ok: true;
        /** 묶음 전체 설정(어드민 저장값) */
        policyEnabled: boolean;
        /** 기기가 받는 응답의 `enabled` (설정 켜짐 + 받을 소재 1개 이상) */
        enabled: boolean;
        showOnOsRestore: boolean;
        /** 기기가 받는 소재 수(시작 전 예약 포함 · 20개 상한 안) */
        deviceEntryCount: number;
        /** 그중 지금 기간 안인 수 */
        showingNowCount: number;
        first: { id: string; name: string | null; startsLater: boolean } | null;
      }
    | AppEntryFail;
  scenes:
    | { ok: true; state: string; publicationId: string | null; updatedAt: string | null }
    | AppEntryFail;
};

export type AppEntryOverviewPopup = {
  policy: { ok: true; enabled: boolean; maxPerEntry: number; allowLandscape: boolean } | AppEntryFail;
  /** 팝업 목록 「앱에 나오는 중」 수(같은 「앱에 나오나」 색인 · 빌드 전 감사 A2) */
  eligible: { ok: true; count: number } | AppEntryFail;
};

export type AppEntryInstallBucket = { version: string; devices: number };

export type AppEntryOverviewInstalls =
  | {
      ok: true;
      windowDays: number;
      android: AppEntryInstallBucket[];
      ios: AppEntryInstallBucket[];
      truncated: boolean;
      rowLimit: number;
    }
  | AppEntryFail;

export type AppEntryOverview = {
  ok: true;
  generatedAt: string;
  os: AppEntryOverviewOs;
  firstEntry: AppEntryOverviewFirstEntry;
  intro: AppEntryOverviewIntro;
  popup: AppEntryOverviewPopup;
  installs: AppEntryOverviewInstalls;
};
