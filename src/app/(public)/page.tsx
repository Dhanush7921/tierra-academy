import { Hero } from "@/components/home/Hero";
import { World } from "@/components/home/World";
import { CourseDiscovery, FinalCta, LearningOptions, Process } from "@/components/home/Sections";
import { RevealOnScroll } from "@/components/ui/client";
import { listCategories, listCourses } from "@/lib/services/catalog";

export const revalidate = 60;

export default async function HomePage() {
  const [categories, featured] = await Promise.all([listCategories(), listCourses({ pageSize: 24 })]);
  const cats = categories.map((c) => ({ slug: c.slug as string, name: c.name as string, tagline: c.tagline as string, description: c.description as string, accent: c.accent as string, course_count: c.course_count as number }));
  return (
    <>
      <Hero />
      <World categories={cats} />
      <LearningOptions />
      <CourseDiscovery courses={featured.items} categories={cats} />
      <Process />
      <FinalCta />
      <RevealOnScroll />
    </>
  );
}
