import "./globals.css";
import Link from "next/link";

export const metadata = { title: "KnowGap", description: "Find what students don't know, before the exam." };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link href="/" className="text-lg font-bold text-indigo-700">KnowGap</Link>
            <nav className="flex gap-4 text-sm"><Link href="/professor">Professor</Link><Link href="/student">Student</Link></nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
