import dynamic from "next/dynamic";
import { Suspense } from "react";
import { ADDR_FLOW_MIN_VIEWPORT } from "@/lib/ui/address-flow-viber";

/** Google Maps 기반 위치 선택 — `sessionStorage`로 이전 화면에 좌표·주소 전달. 지도는 `dynamic`으로 클라이언트 전용 마운트 */
function AddressSelectRouteLoading() {
  return (
    <div
      className={`${ADDR_FLOW_MIN_VIEWPORT} items-center justify-center sam-text-body text-sam-muted`}
    >
      불러오는 중…
    </div>
  );
}

const AddressSelectClient = dynamic(
  () =>
    import("@/components/map/AddressSelectClient").then((m) => ({
      default: m.AddressSelectClient,
    })),
  { ssr: false, loading: AddressSelectRouteLoading }
);

export default function AddressSelectPage() {
  return (
    <Suspense fallback={<AddressSelectRouteLoading />}>
      <AddressSelectClient />
    </Suspense>
  );
}
