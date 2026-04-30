import { MyOffersView } from "@/components/offers/MyOffersView";

export default function MyReceivedOffersPage() {
  return (
    <MyOffersView
      mode="received"
      title="내가 받은 가격 제안"
      emptyLabel="아직 받은 가격 제안이 없습니다."
    />
  );
}
