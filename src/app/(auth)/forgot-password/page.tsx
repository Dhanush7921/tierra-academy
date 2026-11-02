import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "../AuthCard";
import { ForgotForm } from "../AuthForms";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPage() {
  return <AuthCard title="Reset your password" subtitle="We'll email you a secure link." footer={<Link className="text-brand-strong" href="/login">Back to sign in</Link>}><ForgotForm /></AuthCard>;
}
