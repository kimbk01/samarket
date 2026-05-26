import { COMMUNITY_FONT_CLASS } from "@/lib/philife/philife-flat-ui-classes";

/** `/philife` 와 동일 — 컬럼·타이포·배경 셸로 거래 탭·피드 정렬을 맞춘다 */
export default function MarketLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="sam-domain-shell">
      <div className={`mx-auto flex min-h-0 w-full max-w-[66rem] min-w-0 flex-col text-sam-fg ${COMMUNITY_FONT_CLASS}`}>
        {children}
      </div>
    </div>
  );
}
