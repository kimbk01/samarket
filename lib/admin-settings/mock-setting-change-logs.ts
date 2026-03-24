/**
 * 17단계: 설정 변경 이력 mock (Supabase 연동 시 교체)
 */

import type { SettingChangeLog } from "@/lib/types/admin-settings";

const ADMIN_ID = "admin";
const ADMIN_NICKNAME = "관리자";

export const MOCK_SETTING_CHANGE_LOGS: SettingChangeLog[] = [];

export function addSettingChangeLog(
  key: string,
  oldValue: string,
  newValue: string,
  note?: string
): SettingChangeLog {
  const log: SettingChangeLog = {
    id: `scl-${Date.now()}`,
    key,
    oldValue,
    newValue,
    adminId: ADMIN_ID,
    adminNickname: ADMIN_NICKNAME,
    createdAt: new Date().toISOString(),
    note,
  };
  MOCK_SETTING_CHANGE_LOGS.push(log);
  return log;
}

const PAGE_SIZE_DEFAULT = 30;

export interface GetSettingChangeLogsOptions {
  page?: number;
  pageSize?: number;
}

export interface GetSettingChangeLogsResult {
  logs: SettingChangeLog[];
  total: number;
  totalPages: number;
  page: number;
  pageSize: number;
}

export function getSettingChangeLogs(
  options: number | GetSettingChangeLogsOptions = PAGE_SIZE_DEFAULT
): GetSettingChangeLogsResult | SettingChangeLog[] {
  const opts: GetSettingChangeLogsOptions =
    typeof options === "number" ? { page: 1, pageSize: options } : options;
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.max(1, opts.pageSize ?? PAGE_SIZE_DEFAULT);

  const sorted = [...MOCK_SETTING_CHANGE_LOGS].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = (page - 1) * pageSize;
  const logs = sorted.slice(from, from + pageSize);

  return { logs, total, totalPages, page, pageSize };
}
