import "./globals.css";
import Link from "next/link";

export const metadata = { title: "KnowGap", description: "Find what students don't know, before the exam." };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-stone-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <Link href="/" className="flex items-center gap-2 font-serif text-xl font-bold text-[#00693e]">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#00693e] text-sm text-white">K</span>KnowGap
            </Link>
            <nav className="flex gap-5 text-sm font-medium text-stone-600">
              <Link href="/professor" className="hover:text-[#00693e]">Professor</Link>
              <Link href="/student" className="hover:text-[#00693e]">Join a room</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
