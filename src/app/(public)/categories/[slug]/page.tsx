import { redirect } from "next/navigation";

/** Category landing pages reuse the filtered catalogue (single source of truth for search/filter/pagination). */
export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/courses?category=${encodeURIComponent(slug)}`);
}
