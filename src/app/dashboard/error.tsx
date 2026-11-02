"use client";
import { Alert, Button } from "@/components/ui/primitives";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg py-16">
      <Alert tone="danger" title="Something went wrong">We couldn&apos;t load this part of your lab. {error.digest && <span className="font-mono text-xs">Ref: {error.digest}</span>}</Alert>
      <Button className="mt-4" onClick={reset}>Try again</Button>
    </div>
  );
}
