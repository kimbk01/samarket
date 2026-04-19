import { AddressSelectClient } from "@/components/map/AddressSelectClient";

export const dynamic = "force-dynamic";

/** Google Maps 기반 위치 선택 — `sessionStorage` 로 이전 화면에 좌표·주소 전달 */
export default function AddressSelectPage() {
  return <AddressSelectClient />;
}
