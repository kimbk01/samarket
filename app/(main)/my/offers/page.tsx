import { MyOffersView } from "@/components/offers/MyOffersView";

export const dynamic = "force-dynamic";

export default function MyOffersPage() {
  return (
    <MyOffersView
      mode="sent"
      title="내가 보낸 가격 제안"
      emptyLabel="아직 보낸 가격 제안이 없습니다."
    />
  );
}
