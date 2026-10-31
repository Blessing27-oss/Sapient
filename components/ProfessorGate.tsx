"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type User = { id: string; name: string; role: "professor" | "student" };

function Gate({ role, children }: { role: User["role"]; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((m) => {
      setUser(m.user);
      if (!m.user) router.replace(`/login?role=${role}&next=${encodeURIComponent(pathname + location.search)}`);
    });
  }, [role, pathname, router]);

  if (user === undefined || user === null) return <p className="text-stone-500">Loading…</p>;
  if (user.role !== role)
    return (
      <div className="mx-auto mt-10 max-w-md rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold">This page is for {role}s</h1>
        <p className="mt-2 text-sm text-stone-500">You’re signed in as a {user.role} ({user.name}). Sign out to use a {role} account.</p>
        <button className="btn mt-5" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); router.replace(`/login?role=${role}`); }}>Sign out</button>
      </div>
    );
  return <>{children}</>;
}

export default function ProfessorGate({ children }: { children: React.ReactNode }) {
  return <Gate role="professor">{children}</Gate>;
}
export function StudentGate({ children }: { children: React.ReactNode }) {
  return <Gate role="student">{children}</Gate>;
}
