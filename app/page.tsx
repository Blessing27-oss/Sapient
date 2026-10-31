import Link from "next/link";

export default function Home() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 py-16 text-center">
      <h1 className="text-5xl font-bold leading-tight text-[#00693e]">Sapient</h1>
      <p className="text-xl text-stone-600">See where your class is stuck.</p>
      <p className="text-stone-500">Upload a lecture, review the concept map, and share a code. Each student answers three questions.</p>
      <div className="flex justify-center gap-3 pt-2">
        <Link href="/professor" className="btn">Professor workspace</Link>
        <Link href="/student" className="btn-ghost !px-5 !py-2.5">Join with a code</Link>
      </div>
    </div>
  );
}
