import Link from "next/link";
import type { DiagnosticLabel } from "@/lib/types";

export function Header({ subtitle, right }: { subtitle?: string; right?: React.ReactNode }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-baseline gap-3">
          <Link href="/" className="text-lg font-bold tracking-tight text-indigo-700">
            Sapient
          </Link>
          {subtitle && <span className="text-sm text-slate-500">{subtitle}</span>}
        </div>
        {right}
      </div>
    </header>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>{children}</div>;
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost" }) {
  const styles = {
    primary: "bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-indigo-300",
    secondary: "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:text-slate-400",
    danger: "bg-rose-600 text-white hover:bg-rose-700 disabled:bg-rose-300",
    ghost: "text-slate-600 hover:bg-slate-100",
  }[variant];
  return <button className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${styles} ${className}`} {...props} />;
}

export const LABEL_STYLES: Record<DiagnosticLabel, string> = {
  "Demonstrated strength": "bg-emerald-100 text-emerald-800 border-emerald-200",
  "Needs review": "bg-rose-100 text-rose-800 border-rose-200",
  "Mixed evidence": "bg-amber-100 text-amber-800 border-amber-200",
  "Tentative inference": "bg-sky-50 text-sky-700 border-sky-200 border-dashed",
  Unknown: "bg-slate-100 text-slate-500 border-slate-200",
};

export function LabelBadge({ label }: { label: DiagnosticLabel }) {
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${LABEL_STYLES[label]}`}>{label}</span>;
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{message}</p>;
}
