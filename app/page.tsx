import Link from "next/link";

export default function Home() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 py-12 text-center">
      <h1 className="text-5xl font-bold leading-tight">Find what students don’t know, <span className="text-[#00693e]">before the exam.</span></h1>
      <p className="mx-auto max-w-xl text-lg text-stone-600">
        Upload a lecture. Get an editable concept map. Share one code. Three adaptive questions per student show you where the class is struggling.
      </p>
      <div className="flex justify-center gap-3">
        <Link href="/professor" className="btn">Professor workspace</Link>
        <Link href="/student" className="btn-ghost !px-5 !py-2.5">Join with a code</Link>
      </div>
    </div>
  );
}
