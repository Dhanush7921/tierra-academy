import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/paths";
import { listCourses } from "@/lib/services/catalog";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const statics = ["/", "/courses", "/live", "/categories", "/instructors", "/about", "/faq", "/contact", "/terms", "/privacy", "/refund-policy", "/verify"];
  const courses = await listCourses({ pageSize: 48 }).catch(() => ({ items: [] as { slug: string }[] }));
  return [...statics.map((p) => ({ url: absoluteUrl(p) })), ...courses.items.map((c) => ({ url: absoluteUrl(`/courses/${c.slug}`) }))];
}
