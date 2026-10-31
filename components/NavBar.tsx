"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type User = { name: string; role: "professor" | "student" };

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const onLogin = pathname.startsWith("/login"); // the page already offers both roles, so keep the bar quiet there
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => { fetch("/api/auth/me").then((r) => r.json()).then((m) => setUser(m.user)); }, [pathname]);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    router.push("/");
  }
  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2 font-serif text-xl font-bold text-[#00693e]">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#00693e] text-sm text-white">S</span>Sapient
        </Link>
        <nav className="flex items-center gap-5 text-sm font-medium text-stone-600">
          {user ? (
            <>
              <Link href={user.role === "professor" ? "/professor" : "/student"} className="hover:text-[#00693e]">
                {user.role === "professor" ? "My rooms" : "Join a room"}
              </Link>
              <span className="flex items-center gap-2 text-stone-800">
                <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white ${user.role === "professor" ? "bg-[#00693e]" : "bg-sky-600"}`}>{user.name.charAt(0).toUpperCase()}</span>
                {user.name}
              </span>
              <button onClick={signOut} className="text-stone-500 hover:text-[#00693e]">Sign out</button>
            </>
          ) : !onLogin && (
            <>
              <Link href="/professor" className="hover:text-[#00693e]">Professor</Link>
              <Link href="/student" className="hover:text-[#00693e]">Student</Link>
              <Link href="/login" className="btn !py-1.5">Sign in</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
