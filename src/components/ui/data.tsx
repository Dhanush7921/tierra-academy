import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { cx, EmptyState } from "@/components/ui/primitives";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
}

/** Accessible, responsive table (cards on mobile). Server-rendered; pagination via search params. */
export function DataTable<T>({ rows, columns, empty, caption, rowKey }: { rows: T[]; columns: Column<T>[]; empty?: { title: string; description?: string; action?: ReactNode }; caption?: string; rowKey: (r: T) => string }) {
  if (!rows.length) return <EmptyState title={empty?.title ?? "Nothing here yet"} description={empty?.description} action={empty?.action} />;
  return (
    <div className="glass overflow-hidden rounded-2xl">
      <table className="hidden w-full text-sm md:table">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-line text-left">
            {columns.map((c) => <th key={c.key} scope="col" className={cx("px-4 py-3 font-mono text-[11px] font-medium uppercase tracking-widest text-muted", c.className)}>{c.header}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)} className="border-b border-line last:border-0 transition hover:bg-[color-mix(in_srgb,var(--fg)_3%,transparent)]">
              {columns.map((c) => <td key={c.key} className={cx("px-4 py-3 align-middle", c.className)}>{c.cell(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="divide-y divide-line md:hidden">
        {rows.map((r) => (
          <li key={rowKey(r)} className="space-y-1.5 p-4 text-sm">
            {columns.map((c) => (
              <div key={c.key} className="flex justify-between gap-4">
                <span className="text-xs text-muted">{c.header}</span>
                <span className="text-right">{c.cell(r)}</span>
              </div>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Pagination({ page, pages, basePath, params }: { page: number; pages: number; basePath: string; params?: Record<string, string | undefined> }) {
  if (pages <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams(Object.entries(params ?? {}).filter(([, v]) => v) as [string, string][]);
    sp.set("page", String(p));
    return `${basePath}?${sp.toString()}`;
  };
  const nums = Array.from({ length: pages }, (_, i) => i + 1).filter((p) => p === 1 || p === pages || Math.abs(p - page) <= 1);
  return (
    <nav aria-label="Pagination" className="mt-6 flex items-center justify-center gap-1.5">
      {page > 1 && <Link className="grid size-9 place-items-center rounded-lg hover:bg-surface-2" href={href(page - 1)} aria-label="Previous page"><Icon name="arrowLeft" size={16} /></Link>}
      {nums.map((p, i) => (
        <span key={p} className="flex items-center">
          {i > 0 && nums[i - 1] !== p - 1 && <span className="px-1 text-muted">…</span>}
          <Link href={href(p)} aria-current={p === page ? "page" : undefined}
            className={cx("grid h-9 min-w-9 place-items-center rounded-lg px-2 text-sm", p === page ? "bg-brand font-semibold text-on-brand" : "hover:bg-surface-2")}>{p}</Link>
        </span>
      ))}
      {page < pages && <Link className="grid size-9 place-items-center rounded-lg hover:bg-surface-2" href={href(page + 1)} aria-label="Next page"><Icon name="arrow" size={16} /></Link>}
    </nav>
  );
}

export function FilterBar({ action, children }: { action: string; children: ReactNode }) {
  return (
    <form action={action} method="get" role="search" className="glass mb-4 flex flex-wrap items-end gap-3 rounded-2xl p-3">
      {children}
      <button type="submit" className="h-10 rounded-xl bg-surface-2 px-4 text-sm font-semibold hover:bg-[color-mix(in_srgb,var(--brand)_18%,var(--surface-2))]">Apply</button>
    </form>
  );
}

export const pageParam = (v: string | string[] | undefined) => Math.max(1, Number(Array.isArray(v) ? v[0] : v) || 1);
export const strParam = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
