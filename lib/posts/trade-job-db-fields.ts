/**
 * 일자리(trade_type=job) DB 컬럼 ↔ 글쓰기/수정 페이로드 — meta 와 이중 기록
 */

export type TradeJobColumnPayload = {
  jobEmploymentType: string;
  jobCategory: string;
  payType: string;
  payAmount: number | null;
  workStartDate: string | null;
  workEndDate: string | null;
  workDays: string[] | null;
  workStartTime: string | null;
  workEndTime: string | null;
  headcount: number | null;
  experienceRequired: string | null;
};

export function tradeJobColumnsForInsert(job: TradeJobColumnPayload): Record<string, unknown> {
  return {
    trade_type: "job",
    job_employment_type: job.jobEmploymentType.trim() || null,
    job_category: job.jobCategory.trim() || null,
    pay_type: job.payType.trim() || null,
    pay_amount: job.payAmount,
    work_start_date: job.workStartDate?.trim() || null,
    work_end_date: job.workEndDate?.trim() || null,
    work_days: job.workDays && job.workDays.length > 0 ? job.workDays : null,
    work_start_time: job.workStartTime?.trim() || null,
    work_end_time: job.workEndTime?.trim() || null,
    headcount: job.headcount,
    experience_required: job.experienceRequired?.trim() || null,
  };
}
