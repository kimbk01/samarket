import { WORK_CATEGORY_OTHER } from "@/lib/jobs/form-options";
import type {
  ExchangeWriteMeetSpotStagingV1,
  JobsWriteMeetSpotStagingV1,
} from "@/lib/posts/jobs-exchange-write-meet-spot-staging";
import type { TradeMeetSpotValue } from "@/lib/posts/trade-meet-spot-types";

/**
 * `WriteSheetFlowInner` 의 `meaningfulTradeDraft`·시트 `blockingDraft` 와 동일한 판정.
 * 일반 거래 `tradeWriteSessionDraftLooksFilled` 철학과 맞춤: 자동 채움만으로는 true 금지.
 */

export function jobsWriteSessionDraftLooksMeaningful(args: {
  editPostId?: string;
  title: string;
  description: string;
  images: readonly unknown[];
  tradeTopicChildId: string;
  workCategory: string;
  workCategoryOther: string;
  payAmount: string;
  companyName: string;
  tradeMeetSpot: TradeMeetSpotValue | null;
}): boolean {
  if (args.editPostId) return false;
  return Boolean(
    args.title.trim() ||
      args.description.trim() ||
      args.images.length > 0 ||
      args.tradeTopicChildId.trim() ||
      args.workCategory.trim() ||
      args.payAmount.trim() ||
      args.companyName.trim() ||
      (args.workCategory === WORK_CATEGORY_OTHER && args.workCategoryOther.trim().length >= 2) ||
      (args.tradeMeetSpot?.displayLine?.trim() ?? "").length > 0
  );
}

/** 세션 스테이징 JSON만 있을 때 복구 시트 노출 여부 */
export function jobsMeetSpotStagingLooksMeaningful(staged: JobsWriteMeetSpotStagingV1): boolean {
  return jobsWriteSessionDraftLooksMeaningful({
    editPostId: undefined,
    title: staged.title ?? "",
    description: staged.description ?? "",
    images: staged.imageUrls ?? [],
    tradeTopicChildId: staged.tradeTopicChildId ?? "",
    workCategory: staged.workCategory ?? "",
    workCategoryOther: staged.workCategoryOther ?? "",
    payAmount: staged.payAmount ?? "",
    companyName: staged.companyName ?? "",
    tradeMeetSpot: null,
  });
}

export function exchangeWriteSessionDraftLooksMeaningful(args: {
  editPostId?: string;
  amount: string;
  memo: string;
  descriptionAppend: string;
  tradeTopicChildId: string;
  images: readonly unknown[];
  sellerPrep: readonly string[];
  buyerPrep: readonly string[];
  tradeMeetSpot: TradeMeetSpotValue | null;
  /** 기준 환율은 API로 채워질 수 있어 단독으로는 의미 없음 — 가산만 사용자 편집 프록시로 사용 */
  ratePlus: string;
}): boolean {
  if (args.editPostId) return false;
  const amtRaw = args.amount.replace(/,/g, "").trim();
  const amtNum = amtRaw ? Number(amtRaw) : NaN;
  const plusRaw = String(args.ratePlus ?? "")
    .replace(/,/g, "")
    .trim();
  const plusNum = plusRaw === "" ? NaN : Number(plusRaw);
  return Boolean(
    (Number.isFinite(amtNum) && amtNum > 0) ||
      args.memo.trim() ||
      args.descriptionAppend.trim() ||
      args.tradeTopicChildId.trim() ||
      args.images.length > 0 ||
      args.sellerPrep.length > 0 ||
      args.buyerPrep.length > 0 ||
      (args.tradeMeetSpot?.displayLine?.trim() ?? "").length > 0 ||
      (Number.isFinite(plusNum) && plusNum !== 0)
  );
}

export function exchangeMeetSpotStagingLooksMeaningful(staged: ExchangeWriteMeetSpotStagingV1): boolean {
  return exchangeWriteSessionDraftLooksMeaningful({
    editPostId: undefined,
    amount: staged.amount ?? "",
    memo: staged.memo ?? "",
    descriptionAppend: staged.descriptionAppend ?? "",
    tradeTopicChildId: staged.tradeTopicChildId ?? "",
    images: staged.imageUrls ?? [],
    sellerPrep: staged.sellerPrep ?? [],
    buyerPrep: staged.buyerPrep ?? [],
    tradeMeetSpot: null,
    ratePlus: staged.ratePlus ?? "0",
  });
}
