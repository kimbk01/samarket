import Link from "next/link";

const HOME_SERVICE_LINKS = [
  { href: "/market", title: "거래", description: "전체 거래 상품을 둘러보고 필요한 카테고리로 이동하세요." },
  { href: "/philife", title: "커뮤니티", description: "동네 소식과 모임 이야기를 확인해 보세요." },
  { href: "/stores", title: "배달", description: "주변 매장 메뉴를 보고 주문을 진행하세요." },
  { href: "/mypage", title: "내정보", description: "거래 내역, 설정, 알림을 한곳에서 관리하세요." },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-sam-app">
      <section className="mx-auto w-full max-w-3xl px-4 py-6">
        <h1 className="sam-text-title text-sam-fg">dibaY 홈</h1>
        <p className="mt-2 sam-text-body text-sam-muted">
          필요한 서비스를 선택해서 바로 이동할 수 있어요.
        </p>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {HOME_SERVICE_LINKS.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="block rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3 transition hover:bg-sam-surface-muted"
              >
                <p className="sam-text-body font-semibold text-sam-fg">{item.title}</p>
                <p className="mt-1 sam-text-helper text-sam-muted">{item.description}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
