// Small, dependency-free chart pieces for the professor dashboard.
export function Panel({ title, subtitle, children, className = "" }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-stone-200 bg-white p-5 shadow-sm ${className}`}>
      <h2 className="font-serif text-lg font-bold leading-tight">{title}</h2>
      {subtitle && <p className="mt-0.5 text-xs text-stone-500">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function StatTile({ label, value, sub, hero, tone }: { label: string; value: string; sub?: string; hero?: boolean; tone?: "good" | "warn" }) {
  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${hero ? "border-[#00693e] fold text-white" : "border-stone-200 bg-white"}`}>
      <p className={`text-sm ${hero ? "text-[#e3f1eb]" : "text-stone-500"}`}>{label}</p>
      <p className={`mt-1 font-semibold tabular-nums leading-none ${hero ? "text-5xl" : "text-4xl"} ${!hero && tone === "warn" ? "text-amber-700" : ""}`}>{value}</p>
      {sub && <p className={`mt-2 text-xs ${hero ? "text-[#e3f1eb]" : "text-stone-500"}`}>{sub}</p>}
    </div>
  );
}

export type BarRow = {
  id: string;
  label: string;
  value: number; // 0..1, length of the bar
  display: string; // the number printed at the bar's tip
  detail?: string; // shown on hover/focus
  color?: string;
  muted?: boolean; // no data yet
  tag?: string; // short text flag (always paired with text, never colour alone)
};

const BANDS = "repeating-linear-gradient(110deg, #00693e 0.09rem, #00693e 0.81rem, #16895c 0.99rem, #16895c 1.71rem, #00693e 1.89rem)"; // the S recipe, sized for a bar (segment ~0.9rem)
const paint = (c: string) => (c === "fold" || c === "fold-soft" ? BANDS : c);

// Ranked horizontal bars: one baseline, thin bars, square at the baseline and rounded at the data end, value at the tip.
export function BarRows({ rows, color = "fold", label, empty }: { rows: BarRow[]; color?: string; label: string; empty?: string }) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-stone-400">{empty ?? "Nothing to show yet."}</p>;
  return (
    <ul aria-label={label} className="space-y-1">
      {rows.map((r) => (
        <li key={r.id} tabIndex={0} aria-label={`${r.label}: ${r.display}${r.tag ? `, ${r.tag}` : ""}`}
          className="group relative grid grid-cols-[minmax(0,10.5rem)_1fr_9rem] items-center gap-3 rounded-lg px-1 py-1.5 outline-none hover:bg-stone-50 focus-visible:bg-stone-50">
          <span className={`truncate text-sm ${r.muted ? "text-stone-400" : "text-stone-700"}`}>{r.label}</span>
          <span className="relative h-3.5 rounded-r bg-stone-100">
            {!r.muted && r.value > 0 && <span className="absolute inset-y-0 left-0 rounded-r-[4px]" style={{ width: `${Math.max(2, r.value * 100)}%`, background: paint(r.color ?? color), opacity: (r.color ?? color) === "fold-soft" ? 0.55 : 1 }} />}
          </span>
          <span className="flex items-center justify-end gap-1.5 text-right text-sm tabular-nums">
            <span className={r.muted ? "text-stone-400" : "font-semibold text-stone-800"}>{r.display}</span>
            {r.tag && <span className="whitespace-nowrap rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">⚠ {r.tag}</span>}
          </span>
          {r.detail && (
            <span role="tooltip" className="pointer-events-none absolute -top-7 left-24 z-10 hidden whitespace-nowrap rounded-md bg-stone-900 px-2.5 py-1 text-xs text-white shadow-lg group-hover:block group-focus-visible:block">{r.detail}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
