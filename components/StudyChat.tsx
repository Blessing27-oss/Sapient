"use client";
import { useEffect, useId, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

/** `ask` lets the page send a question (e.g. "Explain X") by changing `n`. */
export default function StudyChat({ code, studentId, reviewConcepts, ask, collapsed, onCollapsedChange }: {
  code: string; studentId: string; reviewConcepts: string[]; ask?: { text: string; n: number } | null;
  collapsed: boolean; onCollapsedChange: (collapsed: boolean) => void;
}) {
  const setCollapsed = onCollapsedChange;
  const panelId = useId();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const lastAsk = useRef(0);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, collapsed]);

  const suggestions = [
    reviewConcepts[0] ? `Explain ${reviewConcepts[0]} to me` : "What should I review first?",
    "Why was my answer wrong?",
    "What should I study next?",
  ];

  async function send(text: string, base: Msg[] = messages) {
    const content = text.trim();
    if (!content) return;
    setCollapsed(false);
    const history: Msg[] = [...base, { role: "user", content }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setDraft("");
    setErr("");
    setBusy(true);
    try {
      const res = await fetch(`/api/rooms/${code}/chat`, { method: "POST", body: JSON.stringify({ studentId, messages: history }) });
      if (!res.ok || !res.body) {
        setMessages(history.slice(0, -1));
        setDraft(content);
        return setErr((await res.json().catch(() => ({}))).error ?? "Something went wrong. Try again.");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let reply = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        reply += decoder.decode(value, { stream: true });
        setMessages([...history, { role: "assistant", content: reply }]);
      }
    } catch {
      setErr("Connection lost. Try again.");
    } finally {
      setBusy(false);
    }
  }

  // Questions sent from elsewhere on the page start a fresh thread if the old one is long.
  useEffect(() => {
    if (!ask || ask.n === lastAsk.current || busy) return;
    lastAsk.current = ask.n;
    send(ask.text, messages.length > 12 ? [] : messages);
  }, [ask]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {collapsed && (
        <button type="button" aria-label="Open study helper" title="Open study helper"
          aria-expanded={false} aria-controls={panelId} onClick={() => setCollapsed(false)}
          className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--green-deep)] text-white shadow-lg transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--green)]">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" />
            <path d="M8 10h8M8 14h5" />
          </svg>
          {busy && <span className="absolute right-0 top-0 h-3 w-3 animate-pulse rounded-full border-2 border-white bg-amber-400" />}
        </button>
      )}
    <aside className={collapsed ? "hidden" : "flex h-full max-h-[calc(100dvh-2rem)] min-h-[min(30rem,calc(100dvh-2rem))] flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm"}>
      <div className="flex items-start justify-between gap-3 border-b border-stone-100 bg-[var(--green-deep)] px-5 py-4 text-white">
        <div>
          <h2 className="text-xl font-semibold">Study helper</h2>
          <p className="text-xs text-green-100/80">Knows your results. Can&apos;t change them.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
        {messages.length > 0 && (
          <button className="rounded-md border border-white/30 px-2.5 py-1 text-xs font-medium text-white/90 hover:bg-white/10 disabled:opacity-40" disabled={busy} onClick={() => { setMessages([]); setErr(""); }}>
            New chat
          </button>
        )}
          <button type="button" aria-expanded={!collapsed} aria-controls={panelId}
            className="rounded-md border border-white/30 px-2.5 py-1 text-xs font-medium text-white/90 hover:bg-white/10"
            onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? "Expand" : "Collapse"}
          </button>
        </div>
      </div>

      <div id={panelId} className={collapsed ? "hidden" : "flex min-h-0 flex-1 flex-col"}>
      <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="space-y-3">
            <p className="serif text-stone-600 italic">Ask about anything in this lesson, or start here:</p>
            {suggestions.map((s) => (
              <button key={s} className="block w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-left text-sm text-stone-700 transition hover:border-[var(--green)] hover:bg-green-50" onClick={() => send(s)}>
                {s} <span className="text-[var(--green)]">→</span>
              </button>
            ))}
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`rise flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${m.role === "user" ? "rounded-br-sm bg-[var(--green)] text-white" : "rounded-bl-sm bg-stone-100 text-stone-800"}`}>
                {m.content || <span className="inline-flex gap-1 py-1"><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-400" /><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-400 [animation-delay:120ms]" /><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-400 [animation-delay:240ms]" /></span>}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="space-y-2 border-t border-stone-100 p-3">
        {err && <p className="text-sm text-red-600">{err}</p>}
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!busy) send(draft); }}>
          <input className="input" placeholder="Ask a question…" value={draft} maxLength={2000} onChange={(e) => setDraft(e.target.value)} disabled={busy} />
          <button className="btn shrink-0" disabled={busy || !draft.trim()}>Send</button>
        </form>
        <p className="px-1 text-[11px] text-stone-400">AI-generated help can be wrong. Check against your lecture notes.</p>
      </div>
      </div>
    </aside>
    </>
  );
}
