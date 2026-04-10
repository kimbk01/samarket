import type { CategoryWithSettings } from "@/lib/categories/types";
import type { ImageUploadItem } from "@/components/write/shared/ImageUploader";
import type { JobListingKind } from "@/lib/jobs/form-options";
import type { OwnerEditPostSnapshot } from "@/lib/posts/owner-edit-post-snapshot";
import { formatPriceInput } from "@/lib/utils/format";

function str(v: unknown): string {
  return typeof v === "string" ? v : v != null ? String(v) : "";
}

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
  sameDayPay: boolean;
  companyName: string;
  availableTime: string;
  experienceLevel: string;
  contactPhone: string;
  phoneAllowed: boolean;
  termsAgreed: boolean;
  images: ImageUploadItem[];
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

  return {
    listingKind,
    title: snap.title ?? "",
    workCategory: str(m.work_category),
    workCategoryOther: str(m.work_category_other),
    workTerm: str(m.work_term) || "short",
    payType: str(m.pay_type) || "hourly",
    payAmount: payStr,
    description: snap.content ?? "",
    region: (snap.region ?? "").trim(),
    city: (snap.city ?? "").trim(),
    tradeTopicChildId,
    workDate: str(m.work_date_start),
    workDateEnd: str(m.work_date_end),
    workTimeStart: str(m.work_time_start),
    workTimeEnd: str(m.work_time_end),
    sameDayPay: m.same_day_pay === true,
    companyName: str(m.company_name),
    availableTime: str(m.available_time),
    experienceLevel: str(m.experience_level) || "none",
    contactPhone: str(m.contact_phone),
    phoneAllowed: m.phone_allowed === true,
    termsAgreed: m.terms_agreed === true,
    images: (snap.images ?? []).filter(Boolean).map((url) => ({ url })),
  };
}
