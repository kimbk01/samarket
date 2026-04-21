import "@/app/flat-community-ui-skin.css";

export default function PhilifeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-community-flat-ui className="flex min-h-0 min-w-0 flex-1 flex-col bg-sam-app text-sam-fg">
      {children}
    </div>
  );
}
