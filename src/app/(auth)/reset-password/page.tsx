import type { Metadata } from "next";
import { AuthCard } from "../AuthCard";
import { ResetForm } from "../AuthForms";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <AuthCard title="Choose a new password"><ResetForm token={token} /></AuthCard>;
}
