"use client";

import Link from "next/link";

const SERVICES: { label: string; href: string; icon: React.ReactNode }[] = [
  { label: "중고거래", href: "/products", icon: <PackageIcon /> },
  { label: "알바", href: "/mypage/jobs", icon: <BriefcaseIcon /> },
  { label: "부동산", href: "/mypage/realty", icon: <HomeIcon /> },
  { label: "중고차", href: "/mypage/cars", icon: <CarIcon /> },
  { label: "모임", href: "/mypage/meetup", icon: <UsersIcon /> },
  { label: "동네걷기", href: "/mypage/walk", icon: <WalkIcon /> },
  { label: "세탁수거", href: "/mypage/laundry", icon: <LaundryIcon /> },
  { label: "카마켓이네", href: "/mypage/store", icon: <StoreIcon /> },
];

export function ServiceGrid() {
  return (
    <section className="rounded-xl border border-ig-border bg-white p-4">
      <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
        {SERVICES.map(({ label, href, icon }) => (
          <Link
            key={label}
            href={href}
            className="flex flex-col items-center gap-1.5 py-2 text-foreground"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ig-highlight text-foreground">
              {icon}
            </span>
            <span className="text-[12px]">{label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function PackageIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l8 4m0-10V4m-8 6v10l8 4" />
    </svg>
  );
}
function BriefcaseIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}
function HomeIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}
function CarIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h8m0 0v3m0-3v3m0 3H8m8 0v-3m0 3v-3" />
    </svg>
  );
}
function UsersIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );
}
function WalkIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  );
}
function LaundryIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}
function StoreIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
    </svg>
  );
}
