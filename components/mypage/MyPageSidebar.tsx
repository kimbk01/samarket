import Link from "next/link";
import { buildMyPageHref, MYPAGE_NAV, type MyPageSectionItem } from "./mypage-nav";
import type { MyPageTabId } from "./types";

export function MyPageSidebar({
  activeTab,
  activeSection,
  onClose,
}: {
  activeTab: MyPageTabId;
  activeSection: string;
  onClose?: () => void;
}) {
  return (
    <aside className="rounded-[4px] border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-4 py-3">
        <p className="text-[14px] font-semibold text-gray-900">내정보</p>
        <p className="mt-1 text-[12px] text-gray-500">개인 운영 허브</p>
      </div>
      <div className="max-h-[calc(100vh-220px)] overflow-y-auto px-2 py-2">
        {MYPAGE_NAV.map((tab) => (
          <nav key={tab.id} className="py-1">
            <Link
              href={buildMyPageHref(tab.id, tab.sections[0]?.id)}
              onClick={onClose}
              className={`block rounded-[4px] px-2 py-2 text-[14px] font-semibold ${
                tab.id === activeTab ? "bg-gray-900 text-white" : "text-gray-900 hover:bg-gray-50"
              }`}
            >
              {tab.label}
            </Link>
            <div className="mt-1 space-y-0.5 pl-2">
              {tab.sections.map((section) => (
                <SidebarSectionLink
                  key={`${tab.id}:${section.id}`}
                  tabId={tab.id}
                  section={section}
                  active={tab.id === activeTab && section.id === activeSection}
                  onClose={onClose}
                />
              ))}
            </div>
          </nav>
        ))}
      </div>
    </aside>
  );
}

function SidebarSectionLink({
  tabId,
  section,
  active,
  onClose,
}: {
  tabId: MyPageTabId;
  section: MyPageSectionItem;
  active: boolean;
  onClose?: () => void;
}) {
  return (
    <Link
      href={buildMyPageHref(tabId, section.id)}
      onClick={onClose}
      className={`block rounded-[4px] px-2 py-2 text-[12px] ${
        active ? "bg-blue-50 font-semibold text-blue-700" : "text-gray-600 hover:bg-gray-50"
      }`}
    >
      {section.label}
    </Link>
  );
}
