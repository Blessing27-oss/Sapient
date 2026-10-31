import Link from "next/link";

export default function Home() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Find what students don’t know, before the exam.</h1>
      <p className="max-w-2xl text-slate-600">
        A professor-controlled diagnostic: three adaptive questions per student, an editable concept map, and a dashboard
        that separates what was directly answered from what is only inferred.
      </p>
      <div className="flex gap-3">
        <Link href="/professor" className="btn">I’m a professor</Link>
        <Link href="/student" className="btn-ghost">I’m a student</Link>
      </div>
    </div>
  );
}
