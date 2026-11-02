/** Lightweight SVG charts (no chart library → small bundles, SSR-friendly, theme-aware via CSS vars). */

export function BarChart({ data, height = 180, format = (n: number) => String(n), label }: { data: { label: string; value: number }[]; height?: number; format?: (n: number) => string; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const w = 100 / Math.max(1, data.length);
  return (
    <figure aria-label={label} className="w-full">
      <svg viewBox={`0 0 100 ${height / 3}`} preserveAspectRatio="none" className="h-[var(--h)] w-full" style={{ ["--h" as string]: `${height}px` }} role="img">
        <title>{label}</title>
        <defs>
          <linearGradient id="bar-g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--brand-3)" />
            <stop offset="1" stopColor="var(--brand)" stopOpacity="0.55" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((g) => <line key={g} x1="0" x2="100" y1={(height / 3) * g} y2={(height / 3) * g} stroke="var(--line)" strokeWidth="0.15" />)}
        {data.map((d, i) => {
          const h = (d.value / max) * (height / 3 - 2);
          return (
            <rect key={d.label} x={i * w + w * 0.18} y={height / 3 - h} width={w * 0.64} height={Math.max(h, 0.4)} rx={Math.min(1.2, w * 0.2)} fill="url(#bar-g)">
              <title>{`${d.label}: ${format(d.value)}`}</title>
            </rect>
          );
        })}
      </svg>
      <figcaption className="mt-2 flex justify-between font-mono text-[10px] text-muted">
        <span>{data[0]?.label}</span><span>{data[Math.floor(data.length / 2)]?.label}</span><span>{data[data.length - 1]?.label}</span>
      </figcaption>
    </figure>
  );
}

export function AreaChart({ data, height = 160, label }: { data: { label: string; value: number }[]; height?: number; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const H = 50;
  const pts = data.map((d, i) => [(i / Math.max(1, data.length - 1)) * 100, H - (d.value / max) * (H - 4) - 2] as const);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" ");
  return (
    <figure aria-label={label}>
      <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="w-full" style={{ height }} role="img">
        <title>{label}</title>
        <defs>
          <linearGradient id="area-g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--brand)" stopOpacity="0.45" />
            <stop offset="1" stopColor="var(--brand)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${line} L100,${H} L0,${H} Z`} fill="url(#area-g)" />
        <path d={line} fill="none" stroke="var(--brand-2)" strokeWidth="0.6" vectorEffect="non-scaling-stroke" style={{ strokeWidth: 2 }} />
      </svg>
    </figure>
  );
}

export function Donut({ data, size = 150, label, center }: { data: { label: string; value: number; color: string }[]; size?: number; label: string; center?: string }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = 40, c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={label}>
        <title>{label}</title>
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="11" />
        {data.map((d) => {
          const len = (d.value / total) * c;
          const el = <circle key={d.label} cx="50" cy="50" r={r} fill="none" stroke={d.color} strokeWidth="11" strokeDasharray={`${Math.max(0, len - 1.5)} ${c}`} strokeDashoffset={-acc} transform="rotate(-90 50 50)" strokeLinecap="round"><title>{`${d.label}: ${d.value}`}</title></circle>;
          acc += len;
          return el;
        })}
        <text x="50" y="54" textAnchor="middle" className="fill-[var(--fg)] font-display" fontSize="14" fontWeight="600">{center ?? total}</text>
      </svg>
      <ul className="space-y-1.5 text-xs">
        {data.map((d) => <li key={d.label} className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: d.color }} />{d.label}<span className="text-muted">{d.value}</span></li>)}
      </ul>
    </div>
  );
}

export function Sparkbars({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex h-10 items-end gap-[3px]" aria-hidden="true">
      {values.map((v, i) => <span key={i} className="w-1.5 rounded-full bg-[linear-gradient(var(--brand-3),var(--brand))]" style={{ height: `${Math.max(8, (v / max) * 100)}%`, opacity: 0.35 + (i / values.length) * 0.65 }} />)}
    </div>
  );
}
