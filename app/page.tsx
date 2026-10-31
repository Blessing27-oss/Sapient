import Link from "next/link";
import LandingIntro from "@/components/LandingIntro";
import TwoTone from "@/components/TwoTone";
import { PALETTE } from "@/lib/ui";

// Decorative tree for the demo: [id, label, x, y, parent, palette index]
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

// Arc length of a cubic Bezier, sampled; used so the edge-drawing animation covers exactly the whole curve.
function cubicLength(p: [number, number][]) {
  let len = 0, prev = p[0];
  for (let i = 1; i <= 40; i++) {
    const t = i / 40, u = 1 - t;
    const x = u * u * u * p[0][0] + 3 * u * u * t * p[1][0] + 3 * u * t * t * p[2][0] + t * t * t * p[3][0];
    const y = u * u * u * p[0][1] + 3 * u * u * t * p[1][1] + 3 * u * t * t * p[2][1] + t * t * t * p[3][1];
    len += Math.hypot(x - prev[0], y - prev[1]); prev = [x, y];
  }
  return Math.ceil(len) + 1;
}

function HeroTree() {
  const at = Object.fromEntries(TREE.map(([id, , x, y]) => [id, { x, y }]));
  return (
    <svg viewBox="-30 -10 580 330" className="kg-float w-full" role="img" aria-label="Illustration of a concept map: a main topic branching into topics and ideas, with one idea highlighted as the class's weak spot">
      <defs>
        <linearGradient id="kg-root-fold" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="20" y2="9" spreadMethod="reflect">
          <stop offset="0" stopColor="#00693e" /><stop offset="0.4" stopColor="#00693e" /><stop offset="0.6" stopColor="#16895c" /><stop offset="1" stopColor="#16895c" />
        </linearGradient>
      </defs>
      {TREE.filter((t) => t[4]).map(([id, , , , parent, ci], i) => {
        const a = at[parent!], z = at[id], m = (z.y - a.y) / 2;
        const len = cubicLength([[a.x, a.y + 20], [a.x, a.y + 20 + m], [z.x, z.y - 20 - m], [z.x, z.y - 20]]);
        return <path key={id} className="kg-edge" style={{ animationDelay: `${0.3 + i * 0.12}s`, ["--len" as string]: len }} d={`M${a.x},${a.y + 20} C${a.x},${a.y + 20 + m} ${z.x},${z.y - 20 - m} ${z.x},${z.y - 20}`} fill="none" stroke={PALETTE[ci].accent} strokeWidth={2.5} strokeLinecap="round" />;
      })}
      {TREE.map(([id, label, x, y, , ci], i) => {
        const root = id === "r", weak = id === "c2", w = root ? 112 : label === "Idea" ? 64 : 86;
        const col = weak ? { fill: "#fde68a", accent: "#d97706" } : PALETTE[ci];
        return (
          <g key={id} transform={`translate(${x},${y})`}>
            <g className="kg-node" style={{ animationDelay: `${0.1 + i * 0.1}s`, filter: "drop-shadow(0 2px 3px rgba(28,25,23,.18))" }}>
              {weak && <circle className="kg-ring" r={30} fill="none" stroke="#d97706" strokeWidth={2} style={{ animationDelay: "1.6s" }} />}
              <rect x={-w / 2} y={-18} width={w} height={36} rx={18} fill={root ? "url(#kg-root-fold)" : col.fill} stroke={root ? "#00693e" : col.accent} strokeWidth={2} />
              <text textAnchor="middle" dy={4.5} fontSize={13} fontWeight={700} fill={root ? "#fff" : "#1c1917"}>{label}</text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}

// The logo plays its intro and flies into the corner (LandingIntro); this page content appears after it lands.
export default function Home() {
  return (
    <LandingIntro>
      <section className="relative mx-auto grid min-h-[calc(100vh-190px)] max-w-5xl items-center gap-8 lg:grid-cols-[1fr_1.05fr]">
        <div className="space-y-8">
          <h1 className="text-6xl font-bold leading-[1.02] tracking-tight sm:text-7xl">
            See where
            <br />
            your class
            <br />
            is{" "}
            <span className="relative">
              <TwoTone>stuck</TwoTone>
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
        <div className="relative">
          <div className="absolute -inset-6 -z-10 rounded-[3rem] bg-gradient-to-br from-[#e3f1eb]/70 via-transparent to-amber-100/60 blur-2xl" />
          <HeroTree />
        </div>
      </section>
    </LandingIntro>
  );
}
