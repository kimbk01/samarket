"use client";

/**
 * 어드민 통합 신고 목록·상세 — 서버 API(권한 키 `reports`) 호출 (거래 Admin 설계 v2 D-42 · D-43).
 * 조회·변환 본체: `admin-reports-read.server.ts`. 함수 이름·반환 형태는 기존 화면 호환을 위해 유지.
 */
import type { Report } from "@/lib/types/report";

/**
 * 어드민 신고 목록 — reports 테이블 기준. 실패는 빈 목록이 아니라 예외 (「신고 없음」 오인 방지).
 */
export async function getReportsForAdminFromDb(): Promise<Report[]> {
  const res = await fetch("/api/admin/reports", { credentials: "include", cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; reports?: Report[] };
  if (!res.ok || json.ok === false || !Array.isArray(json.reports)) {
    throw new Error(json.error || `reports_load_failed_${res.status}`);
  }
  return json.reports;
}

/** 「전체 신고 현황」 커서 모드 응답의 원장 제외 정보 (RS-02) */
export type AdminReportsPageExclusion = { source: string; reason: "permission" | "filter" };

/**
 * 통합 신고 서버 페이지 — `GET /api/admin/reports?limit=&offset=|cursor=&domain=&status=&target_type=&reason=&target=`.
 * offset 모드(R7): 거래·커뮤니티 2원장. 커서 모드(RS-02, `cursor` 파라미터): 원장 6종 병합 + 다음 커서 · 원장별 건수 ·
 * 제외 원장. 실패는 예외.
 */
export async function getReportsPageForAdminFromDb(params: URLSearchParams): Promise<{
  reports: Report[];
  total: number;
  nextCursor: string | null;
  sourceCounts: Record<string, number>;
  excludedSources: AdminReportsPageExclusion[];
  partial: boolean;
}> {
  const res = await fetch(`/api/admin/reports?${params.toString()}`, { credentials: "include", cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    reports?: Report[];
    total?: number;
    nextCursor?: string | null;
    sourceCounts?: Record<string, number>;
    excludedSources?: AdminReportsPageExclusion[];
    partial?: boolean;
  };
  if (!res.ok || json.ok === false || !Array.isArray(json.reports)) {
    throw Object.assign(new Error(json.error || `reports_load_failed_${res.status}`), { httpStatus: res.status });
  }
  return {
    reports: json.reports,
    total: Math.max(0, Math.trunc(Number(json.total) || 0)),
    nextCursor: typeof json.nextCursor === "string" && json.nextCursor ? json.nextCursor : null,
    sourceCounts: json.sourceCounts ?? {},
    excludedSources: Array.isArray(json.excludedSources) ? json.excludedSources : [],
    partial: json.partial === true,
  };
}

/**
 * 어드민 신고 1건 조회
 */
export async function getReportByIdFromDb(reportId: string): Promise<Report | null> {
  try {
    const res = await fetch(`/api/admin/reports/${encodeURIComponent(reportId)}`, {
      credentials: "include",
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; report?: Report };
    return res.ok && json.ok !== false && json.report ? json.report : null;
  } catch {
    return null;
  }
}
