import { DibayPendingSpinner } from "@/components/ui/DibaySpinner";

/** 상품 상세 대기 — 예전 회색 원 깜박임 + 「불러오는 중…」 → DIBAY 대기 스피너(450ms 뒤, loading-spinner 설계 §3-1) */
export default function ProductDetailLoading() {
  return <DibayPendingSpinner />;
}
