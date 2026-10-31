"use client";
import { useEffect, useState } from "react";

export default function ShareCard({ code }: { code: string }) {
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState("");
  useEffect(() => { setLink(`${location.origin}/student?code=${code}`); }, [code]);
  const copy = async (what: string, v: string) => { await navigator.clipboard.writeText(v); setCopied(what); setTimeout(() => setCopied(""), 1500); };
  return (
    <div className="rounded-2xl bg-[#00693e] p-6 text-white shadow-sm">
      <p className="text-xs uppercase tracking-widest text-green-100">Students join with</p>
      <div className="mt-2 flex flex-wrap items-center gap-4">
        <span className="font-mono text-5xl font-bold tracking-[0.25em]">{code}</span>
        <button className="rounded-md bg-white/15 px-3 py-1.5 text-sm hover:bg-white/25" onClick={() => copy("code", code)}>{copied === "code" ? "Copied ✓" : "Copy code"}</button>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <code className="max-w-full truncate rounded-md bg-black/20 px-3 py-1.5">{link}</code>
        <button className="rounded-md bg-white px-3 py-1.5 font-medium text-[#00693e] hover:bg-green-50" onClick={() => copy("link", link)}>{copied === "link" ? "Copied ✓" : "Copy link"}</button>
      </div>
    </div>
  );
}
