import type { ImageUploadItem } from "@/components/write/shared/ImageUploader";
import type { OwnerEditPostSnapshot } from "@/lib/posts/owner-edit-post-snapshot";
import { formatPriceInput } from "@/lib/utils/format";
import type { TradeChatCallPolicy } from "@/lib/trade/trade-chat-call-policy";
import { normalizeTradeChatCallPolicy } from "@/lib/trade/trade-chat-call-policy";
import {
  findMileagePresetKeyForDigits,
  resolveUsedCarSellKeysFromStoredCarModel,
} from "@/lib/trade/used-car-form-catalog";
import { hydrateTradeCategoryFieldsFromSnapshot } from "@/lib/trade/category-form/edit-hydrator";

export type TradeWriteHydratedFields = {
  title: string;
  description: string;
  price: string;
  region: string;
  city: string;
  images: ImageUploadItem[];
  isFreeShare: boolean;
  isPriceOfferEnabled: boolean;
  isDirectDeal: boolean;
  tradeTopicChildId: string;
  neighborhood: string;
  buildingName: string;
  estateType: string;
  dealType: "임대" | "판매";
  deposit: string;
  monthly: string;
  managementFee: string;
  hasPremium: boolean;
  areaSqm: string;
  roomCount: string;
  bathroomCount: string;
  moveInDate: string;
  carModel: string;
  carYear: string;
  mileage: string;
  usedCarTrade: "buy" | "sell" | null;
  carHasAccident: boolean;
  transmission: string;
  fuelType: string;
  salary: string;
  workPlace: string;
  workType: string;
  currency: string;
  exchangeRate: string;
  tradeChatCallPolicy: TradeChatCallPolicy;
  /** used-car + 팝니다 — 선택 UI 초기화 */
  usedCarBrandKey?: string;
  usedCarModelKey?: string;
  usedCarMileagePresetKey?: string;
  /** used-car + 삽니다 — meta.car_body_type */
  usedCarBodyTypeKey?: string;
};

function str(v: unknown): string {
  return typeof v === "string" ? v : v != null ? String(v) : "";
}

/** CREATE == EDIT — Field Library storage authority for category fields */
export function hydrateTradeWriteFormFromSnapshot(
  skinKey: string,
  snap: OwnerEditPostSnapshot
): TradeWriteHydratedFields {
  const m = snap.meta ?? {};
  const priceStr =
    snap.price != null && Number.isFinite(Number(snap.price))
      ? formatPriceInput(String(snap.price))
      : "";

  const categoryFields = hydrateTradeCategoryFieldsFromSnapshot({
    meta: m,
    post: {
      price: snap.price,
      region: snap.region,
      city: snap.city,
      is_free_share: snap.is_free_share,
    },
  });

  const base: TradeWriteHydratedFields = {
    title: skinKey === "real-estate" ? "" : snap.title,
    description: snap.content,
    price: priceStr,
    region: snap.region?.trim() ?? "",
    city: snap.city?.trim() ?? "",
    images: (snap.images ?? []).filter(Boolean).map((url) => ({ url })),
    isFreeShare: snap.is_free_share === true,
    isPriceOfferEnabled: snap.is_price_offer === true,
    isDirectDeal: m.direct_deal === true,
    tradeTopicChildId: "",
    ...categoryFields,
    salary: str(m.salary),
    workPlace: str(m.work_place),
    workType: str(m.work_type),
    currency: str(m.currency),
    exchangeRate: str(m.exchange_rate),
    tradeChatCallPolicy: normalizeTradeChatCallPolicy(m.trade_chat_call_policy),
  };

  if (skinKey === "used-car" && base.usedCarTrade === "sell") {
    const resolved = resolveUsedCarSellKeysFromStoredCarModel(base.carModel);
    const mileageDigits = base.mileage.replace(/\D/g, "");
    return {
      ...base,
      usedCarBrandKey: resolved.brandKey,
      usedCarModelKey: resolved.modelKey,
      usedCarMileagePresetKey: mileageDigits ? findMileagePresetKeyForDigits(mileageDigits) : "",
    };
  }

  if (skinKey === "used-car" && base.usedCarTrade === "buy") {
    return {
      ...base,
      usedCarBodyTypeKey: categoryFields.usedCarBodyTypeKey,
    };
  }

  return base;
}
