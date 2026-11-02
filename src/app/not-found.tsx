import Link from "next/link";
import { buttonClass } from "@/components/ui/primitives";
import { LogoMark } from "@/components/ui/brand";

export default function NotFound() {
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-4 text-center">
      <div>
        <div className="mx-auto w-fit"><LogoMark size={72} /></div>
        <p className="label-mono mt-6">Error 404</p>
        <h1 className="mt-2 font-display text-3xl font-semibold">This circuit is open.</h1>
        <p className="mt-2 text-muted">The page you were looking for doesn&apos;t exist or has moved.</p>
        <div className="mt-6 flex justify-center gap-3"><Link href="/" className={buttonClass("primary", "md")}>Home</Link><Link href="/courses" className={buttonClass("outline", "md")}>Courses</Link></div>
      </div>
    </main>
  );
}
