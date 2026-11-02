import { Alert } from "@/components/ui/primitives";

export function Flash({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const ok = typeof sp.ok === "string" ? sp.ok : undefined;
  const err = typeof sp.err === "string" ? sp.err : undefined;
  if (!ok && !err) return null;
  return <div className="mb-5">{ok ? <Alert tone="ok">{ok}</Alert> : <Alert tone="danger">{err}</Alert>}</div>;
}
export type SP = Promise<Record<string, string | string[] | undefined>>;
