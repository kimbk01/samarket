import { WriteForm } from "@/components/community/WriteForm";

interface PhilifeWritePageProps {
  searchParams: Promise<{
    category?: string;
  }>;
}

export default async function PhilifeWritePage({ searchParams }: PhilifeWritePageProps) {
  const { category } = await searchParams;
  return <WriteForm initialCategory={category} />;
}
