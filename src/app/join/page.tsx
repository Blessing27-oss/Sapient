"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button, Card, ErrorNote, Header } from "@backend/components/ui";

function JoinForm() {
  const router = useRouter();
  const [code, setCode] = useState(useSearchParams().get("code") ?? "");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/rooms/${code.trim().toUpperCase()}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setError(data.error);
    router.push(`/r/${data.code}/student/${data.studentId}`);
  }

  return (
    <Card>
      <form onSubmit={join} className="space-y-4">
        <h1 className="text-xl font-semibold">Join a room</h1>
        <label className="block text-sm">
          Room code
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-lg uppercase tracking-widest"
            placeholder="ABCD"
            maxLength={4}
            required
          />
        </label>
        <label className="block text-sm">
          Display name (temporary, for this session only)
          <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" required />
        </label>
        <ErrorNote message={error} />
        <Button type="submit" disabled={busy} className="w-full py-2">
          {busy ? "Joining…" : "Join"}
        </Button>
      </form>
    </Card>
  );
}

export default function JoinPage() {
  return (
    <>
      <Header subtitle="Student" />
      <main className="mx-auto max-w-md px-4 py-12">
        <Suspense>
          <JoinForm />
        </Suspense>
      </main>
    </>
  );
}
