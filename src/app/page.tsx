import Link from "next/link";
import { Header } from "@backend/components/ui";

export default function Home() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-4xl font-bold tracking-tight">Find what students don&apos;t know, before the exam.</h1>
        <p className="mt-4 text-lg text-slate-600">
          A professor-controlled classroom diagnostic. AI proposes a concept map and questions from your notes; you verify them.
          Students answer three adaptive questions, and you see transparent, correctable evidence of where the class is struggling.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <Link href="/professor" className="rounded-xl border border-indigo-200 bg-indigo-50 p-6 hover:border-indigo-400">
            <div className="text-lg font-semibold text-indigo-800">I&apos;m a professor →</div>
            <p className="mt-1 text-sm text-indigo-700">Upload a PDF, review concepts and questions, open a room.</p>
          </Link>
          <Link href="/join" className="rounded-xl border border-slate-200 bg-white p-6 hover:border-slate-400">
            <div className="text-lg font-semibold">I&apos;m a student →</div>
            <p className="mt-1 text-sm text-slate-600">Enter a room code and answer three questions.</p>
          </Link>
        </div>
        <p className="mt-10 text-xs text-slate-500">
          Three questions can&apos;t establish mastery of a course. Sapient shows an adaptive workflow, not validated precision:
          indirect evidence is always labeled tentative, and students can challenge any question.
        </p>
      </main>
    </>
  );
}
