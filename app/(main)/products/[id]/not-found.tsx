import Link from "next/link";

export default function ProductNotFound() {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
      <p className="sam-text-body font-medium text-sam-fg">상품을 찾을 수 없어요</p>
      <p className="mt-1 sam-text-body-secondary text-sam-muted">
        삭제되었거나 존재하지 않는 상품이에요.
      </p>
      <Link
        href="/home"
        className="mt-6 rounded-ui-rect bg-signature px-6 py-2.5 sam-text-body font-medium text-white"
      >
        홈으로
      </Link>
    </div>
  );
}
