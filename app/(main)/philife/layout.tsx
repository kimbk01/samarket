import { COMMUNITY_FONT_CLASS } from "@/lib/philife/philife-flat-ui-classes";

export default function PhilifeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-philife-ui="viber" className="flex min-h-0 min-w-0 flex-1 justify-center bg-[#F7F8FA]">
      <div className={`w-full max-w-[768px] min-w-0 flex-1 flex-col text-[#1F2430] ${COMMUNITY_FONT_CLASS}`}>
        {children}
      </div>
    </div>
  );
}
