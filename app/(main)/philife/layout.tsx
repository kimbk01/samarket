import { COMMUNITY_FONT_CLASS } from "@/lib/philife/philife-flat-ui-classes";
import { CM_PAGE_CLASS } from "@/lib/community/community-ui-classes";

export default function PhilifeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="sam-domain-shell" data-community-ui>
      <div
        className={`mx-auto flex min-h-0 w-full max-w-[66rem] min-w-0 flex-col ${CM_PAGE_CLASS} ${COMMUNITY_FONT_CLASS}`}
      >
        {children}
      </div>
    </div>
  );
}
