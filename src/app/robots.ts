import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/paths";

export default function robots(): MetadataRoute.Robots {
  if (process.env.APP_MODE !== "production") return { rules: { userAgent: "*", disallow: "/" } };
  return { rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/dashboard", "/api", "/checkout", "/invite", "/setup"] }, sitemap: absoluteUrl("/sitemap.xml") };
}
