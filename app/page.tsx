import Link from "next/link";
import { PALETTE } from "@/lib/ui";

// Decorative tree for the hero: [id, label, x, y, parent, palette index]
const TREE: [string, string, number, number, string | null, number][] = [
  ["r", "Main topic", 260, 46, null, 1],
  ["a", "Topic A", 100, 150, "r", 0],
  ["b", "Topic B", 260, 150, "r", 4],
  ["c", "Topic C", 420, 150, "r", 6],
  ["a1", "Idea", 50, 262, "a", 0],
  ["a2", "Idea", 160, 262, "a", 0],
  ["b1", "Idea", 260, 262, "b", 4],
  ["c1", "Idea", 370, 262, "c", 6],
  ["c2", "Idea", 470, 262, "c", 6],
];

function HeroTree() {
  const at = Object.fromEntries(TREE.map(([id, , x, y]) => [id, { x, y }]));
  return (
    <svg viewBox="-30 -10 580 330" className="kg-float w-full" role="img" aria-label="Illustration of a concept map: a main topic branching into topics and ideas, with one idea highlighted as the class's weak spot">
      {TREE.filter((t) => t[4]).map(([id, , , , parent, ci], i) => {
        const a = at[parent!], z = at[id], m = (z.y - a.y) / 2;
        return <path key={id} pathLength={1} className="kg-edge" style={{ animationDelay: `${0.5 + i * 0.12}s` }} d={`M${a.x},${a.y + 20} C${a.x},${a.y + 20 + m} ${z.x},${z.y - 20 - m} ${z.x},${z.y - 20}`} fill="none" stroke={PALETTE[ci].accent} strokeWidth={2.5} strokeLinecap="round" />;
      })}
      {TREE.map(([id, label, x, y, , ci], i) => {
        const root = id === "r", weak = id === "c2", w = root ? 112 : label === "Idea" ? 64 : 86;
        const col = weak ? { fill: "#fde68a", accent: "#d97706" } : PALETTE[ci];
        return (
          <g key={id} transform={`translate(${x},${y})`}>
            <g className="kg-node" style={{ animationDelay: `${0.15 + i * 0.1}s`, filter: "drop-shadow(0 2px 3px rgba(28,25,23,.18))" }}>
              {weak && <circle className="kg-ring" r={30} fill="none" stroke="#d97706" strokeWidth={2} style={{ animationDelay: "2.2s" }} />}
              <rect x={-w / 2} y={-18} width={w} height={36} rx={18} fill={root ? "#00693e" : col.fill} stroke={root ? "#00693e" : col.accent} strokeWidth={2} />
              <text textAnchor="middle" dy={4.5} fontSize={13} fontWeight={700} fill={root ? "#fff" : "#1c1917"}>{label}</text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}

export default function Home() {
  return (
    <section className="relative mx-auto grid min-h-[calc(100vh-190px)] max-w-5xl items-center gap-8 lg:grid-cols-[1fr_1.05fr]">
      <div className="space-y-8">
        <h1 className="text-6xl font-bold leading-[1.02] tracking-tight sm:text-7xl">
          See where
          <br />
          your class
          <br />
          is{" "}
          <span className="relative text-[#00693e]">
            stuck
            <svg aria-hidden viewBox="0 0 200 12" className="absolute -bottom-1 left-0 w-full" preserveAspectRatio="none">
              <path d="M2 8 Q50 1 100 6 T198 5" fill="none" stroke="#d97706" strokeWidth="4" strokeLinecap="round" />
            </svg>
          </span>
          .
        </h1>
        <p className="text-xl text-stone-500">Upload a lecture. Share a code. See the gaps.</p>
        <div className="flex flex-wrap gap-3">
          <Link href="/professor" className="btn !px-7 !py-3.5 !text-base">I’m a professor →</Link>
          <Link href="/student" className="btn-ghost !px-7 !py-3.5 !text-base">I’m a student</Link>
        </div>
      </div>
      <div aria-hidden={false} className="relative">
        <div className="absolute -inset-6 -z-10 rounded-[3rem] bg-gradient-to-br from-green-100/70 via-transparent to-amber-100/60 blur-2xl" />
        <HeroTree />
      </div>
    </section>
  );
}
