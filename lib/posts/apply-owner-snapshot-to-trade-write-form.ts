import type { ImageUploadItem } from "@/components/write/shared/ImageUploader";
import type { OwnerEditPostSnapshot } from "@/lib/posts/owner-edit-post-snapshot";
import { formatPriceInput } from "@/lib/utils/format";

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
  salary: string;
  workPlace: string;
  workType: string;
  currency: string;
  exchangeRate: string;
};

function str(v: unknown): string {
  return typeof v === "string" ? v : v != null ? String(v) : "";
}

/** 스킨별 meta → TradeWriteForm 상태 초기값 */
export function hydrateTradeWriteFormFromSnapshot(
  skinKey: string,
  snap: OwnerEditPostSnapshot
): TradeWriteHydratedFields {
  const m = snap.meta ?? {};
  const priceStr =
    snap.price != null && Number.isFinite(Number(snap.price))
      ? formatPriceInput(String(snap.price))
      : "";

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
    neighborhood: str(m.neighborhood),
    buildingName: str(m.building_name),
    estateType: str(m.estate_type),
    dealType: m.deal_type === "판매" ? "판매" : "임대",
    deposit: formatPriceInput(str(m.deposit).replace(/,/g, "")),
    monthly: formatPriceInput(str(m.monthly).replace(/,/g, "")),
    managementFee: formatPriceInput(str(m.management_fee).replace(/,/g, "")),
    hasPremium: m.has_premium === true,
    areaSqm: str(m.size_sq || m.area_sqm),
    roomCount: str(m.room_count),
    bathroomCount: str(m.bathroom_count),
    moveInDate: str(m.move_in_date),
    carModel: str(m.car_model),
    carYear: str(m.car_year || m.car_year_max),
    mileage: str(m.mileage),
    usedCarTrade:
      m.car_trade === "buy" || m.car_trade === "sell"
        ? (m.car_trade as "buy" | "sell")
        : null,
    carHasAccident: m.has_accident === true,
    salary: str(m.salary),
    workPlace: str(m.work_place),
    workType: str(m.work_type),
    currency: str(m.currency),
    exchangeRate: str(m.exchange_rate),
  };

  return base;
}
