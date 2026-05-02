import type { CategoryWithSettings } from "@/lib/categories/types";
import type { ImageUploadItem } from "@/components/write/shared/ImageUploader";
import {
  HIRE_WEEKDAY_OPTIONS,
  JOB_SEEKER_TIME_SLOT_OPTIONS,
  type JobListingKind,
  type JobSeekerStartValue,
  type JobSeekerVisaValue,
} from "@/lib/jobs/form-options";
import type { OwnerEditPostSnapshot } from "@/lib/posts/owner-edit-post-snapshot";
import { formatPriceInput } from "@/lib/utils/format";

function str(v: unknown): string {
  return typeof v === "string" ? v : v != null ? String(v) : "";
}

const HIRE_DAY_TOKENS = new Set<string>(HIRE_WEEKDAY_OPTIONS.map((o) => o.value));
const HIRE_TIME_SLOT_IDS = new Set<string>(JOB_SEEKER_TIME_SLOT_OPTIONS.map((o) => o.value));

export type JobsWriteHydratedFields = {
  listingKind: JobListingKind;
  title: string;
  workCategory: string;
  workCategoryOther: string;
  workTerm: string;
  payType: string;
  payAmount: string;
  description: string;
  region: string;
  city: string;
  tradeTopicChildId: string;
  workDate: string;
  workDateEnd: string;
  workTimeStart: string;
  workTimeEnd: string;
  companyName: string;
  availableTime: string;
  experienceLevel: string;
  contactPhone: string;
  phoneAllowed: boolean;
  hireTimeNegotiable: boolean;
  hireTimeSlots: string[];
  hirePayNegotiable: boolean;
  hireWeekDays: string[];
  hireWorkDaysDiscuss: boolean;
  hireHeadcount: string;
  hireGender: string;
  hireAgeNote: string;
  hireMeal: boolean;
  hireHousing: boolean;
  hireVisaNote: string;
  hireLanguagesPreferred: string[];
  images: ImageUploadItem[];
  seekTimeSlots: string[];
  seekLanguages: string[];
  seekVisa: JobSeekerVisaValue | "";
  seekStart: JobSeekerStartValue;
  seekStartDate: string;
};

export function hydrateJobsWriteFormFromSnapshot(
  category: CategoryWithSettings,
  snap: OwnerEditPostSnapshot
): JobsWriteHydratedFields {
  const m = snap.meta ?? {};
  const payFromMeta = m.pay_amount != null ? Number(m.pay_amount) : null;
  const paySrc = payFromMeta != null && Number.isFinite(payFromMeta) ? payFromMeta : snap.price;
  const payStr =
    paySrc != null && Number.isFinite(Number(paySrc)) ? formatPriceInput(String(paySrc)) : "";

  const lkRaw = str(m.listing_kind) || (str(m.job_type) === "seek" ? "work" : str(m.job_type) === "hire" ? "hire" : "");
  const listingKind: JobListingKind = lkRaw === "work" || lkRaw === "hire" ? lkRaw : "hire";

  let tradeTopicChildId = "";
  const tid = (snap.trade_category_id ?? "").trim();
  if (tid && tid !== category.id.trim()) tradeTopicChildId = tid;

  const slotsRaw = str((m as { seek_time_slots?: unknown }).seek_time_slots);
  const seekTimeSlots = slotsRaw ? slotsRaw.split("|").filter(Boolean) : [];
  const langRaw = str((m as { seeker_languages?: unknown }).seeker_languages);
  const seekLanguages = langRaw ? langRaw.split("|").filter(Boolean) : [];
  const visaRaw = str((m as { seeker_visa?: unknown }).seeker_visa);
  const seekVisa: JobSeekerVisaValue | "" =
    visaRaw === "ok" || visaRaw === "check" || visaRaw === "private" ? visaRaw : "";
  const startRaw = str((m as { seeker_start?: unknown }).seeker_start);
  const seekStart: JobSeekerStartValue =
    startRaw === "yes" || startRaw === "date" || startRaw === "discuss" ? startRaw : "discuss";
  const seekStartDate = str((m as { seeker_start_date?: unknown }).seeker_start_date);

  const payTypeRaw = str(m.pay_type) || "hourly";
  const hirePayNegotiable = m.hire_pay_negotiable === true;
  const hireTimeNegotiable = m.hire_time_negotiable === true;
  const hireSlotsRaw = str((m as { hire_work_time_slots?: unknown }).hire_work_time_slots);
  const hireTimeSlots =
    listingKind === "hire" && hireSlotsRaw
      ? hireSlotsRaw.split("|").filter((s) => HIRE_TIME_SLOT_IDS.has(s))
      : [];
  const payAmountForUi =
    (listingKind === "work" && payTypeRaw === "negotiate") ||
    (listingKind === "hire" && hirePayNegotiable)
      ? ""
      : payStr;

  const wdCol = Array.isArray(snap.work_days) ? snap.work_days : null;
  let hireWeekDays: string[] = [];
  let hireWorkDaysDiscuss = false;
  if (listingKind === "hire") {
    if (wdCol && wdCol.length > 0) {
      if (wdCol.includes("discuss")) hireWorkDaysDiscuss = true;
      else hireWeekDays = wdCol.filter((d) => HIRE_DAY_TOKENS.has(d));
    } else {
      hireWorkDaysDiscuss = m.hire_work_days_discuss === true;
      const pipe = str(m.hire_week_days_pipe);
      if (hireWorkDaysDiscuss) {
        /* no-op */
      } else if (pipe) {
        hireWeekDays = pipe.split("|").filter((d) => HIRE_DAY_TOKENS.has(d));
      }
    }
  }

  const headFromCol = snap.headcount != null && Number.isFinite(Number(snap.headcount)) ? Number(snap.headcount) : null;
  const hireHeadcount = headFromCol != null ? String(headFromCol) : str(m.hire_headcount);

  const expHire = str(snap.experience_required);
  const expSeekMeta = str(m.experience_level);
  const experienceUi =
    listingKind === "hire"
      ? expHire || expSeekMeta || "none"
      : expSeekMeta || "none";

  const langPipe = str(m.hire_languages);
  const hireLanguagesPreferred = langPipe ? langPipe.split("|").filter(Boolean) : [];

  return {
    listingKind,
    title: snap.title ?? "",
    workCategory: str(m.work_category),
    workCategoryOther: str(m.work_category_other),
    workTerm:
      listingKind === "work"
        ? str(m.work_term) || "short_alba"
        : str(m.work_term) || "short",
    payType: payTypeRaw,
    payAmount: payAmountForUi,
    description: snap.content ?? "",
    region: (snap.region ?? "").trim(),
    city: (snap.city ?? "").trim(),
    tradeTopicChildId,
    workDate:
      typeof snap.work_start_date === "string" && snap.work_start_date
        ? snap.work_start_date.slice(0, 10)
        : str(m.work_date_start),
    workDateEnd:
      typeof snap.work_end_date === "string" && snap.work_end_date
        ? snap.work_end_date.slice(0, 10)
        : str(m.work_date_end),
    workTimeStart: listingKind === "hire" ? "" : str(m.work_time_start),
    workTimeEnd: listingKind === "hire" ? "" : str(m.work_time_end),
    companyName: str(m.company_name),
    availableTime: str(m.available_time),
    experienceLevel: experienceUi,
    contactPhone: str(m.contact_phone),
    phoneAllowed: m.phone_allowed === true,
    hireTimeNegotiable,
    hireTimeSlots,
    hirePayNegotiable,
    hireWeekDays,
    hireWorkDaysDiscuss,
    hireHeadcount,
    hireGender: str(m.hire_gender) || "any",
    hireAgeNote: str(m.hire_age_note),
    hireMeal: m.hire_meal === true,
    hireHousing: m.hire_housing === true,
    hireVisaNote: str(m.hire_visa_note),
    hireLanguagesPreferred,
    images: (snap.images ?? []).filter(Boolean).map((url) => ({ url })),
    seekTimeSlots,
    seekLanguages,
    seekVisa,
    seekStart,
    seekStartDate,
  };
}
