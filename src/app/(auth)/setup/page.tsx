import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { superAdminExists } from "@/app/actions/auth";
import { AuthCard } from "../AuthCard";
import { SetupForm } from "../AuthForms";

export const metadata: Metadata = { title: "Platform setup", robots: { index: false } };
export const dynamic = "force-dynamic";

/** One-time Super Admin provisioning. Disappears (404) once a Super Admin exists or if no token is configured. */
export default async function SetupPage() {
  if (!env().SUPER_ADMIN_SETUP_TOKEN || (await superAdminExists())) notFound();
  return <AuthCard title="One-time platform setup" subtitle="Create the first Super Admin. This page closes permanently afterwards."><SetupForm /></AuthCard>;
}
