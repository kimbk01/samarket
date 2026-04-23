import { COMMUNITY_FONT_CLASS } from "@/lib/philife/philife-flat-ui-classes";

export default function PhilifeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="sam-domain-shell justify-center bg-sam-app">
      <div className={`mx-auto flex min-h-0 w-full max-w-[66rem] min-w-0 flex-1 flex-col text-sam-fg ${COMMUNITY_FONT_CLASS}`}>
        {children}
      </div>
    </div>
  );
}
