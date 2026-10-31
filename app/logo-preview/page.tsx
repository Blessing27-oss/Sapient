// TEMPORARY: logo options for review. Delete this folder once one is chosen.
const SPINE = "M57 30 C57 12 24 12 24 31 C24 48 59 40 59 61 C59 80 23 78 21 63";

// Folded-paper ribbon: a thick S whose bands alternate in tone like an accordion fold.
function Ribbon({ dark, light, w = 16 }: { dark: string; light: string; w?: number }) {
  return (
    <>
      <path d={SPINE} fill="none" stroke={dark} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
      <path d={SPINE} pathLength={100} fill="none" stroke={light} strokeWidth={w} strokeDasharray="11 11" strokeDashoffset={-5} strokeLinecap="butt" />
    </>
  );
}

// Mortarboard centred on its own origin so it can be tilted about its middle.
function Cap({ x, y, tilt = -30, s = 0.8 }: { x: number; y: number; tilt?: number; s?: number }) {
  return (
    <g transform={`translate(${x},${y}) rotate(${tilt}) scale(${s})`}>
      <path d="M-13 3 v9 c0 6 26 6 26 0 v-9" fill="#292524" />
      <path d="M0 -11 L28 0 L0 11 L-28 0 Z" fill="#1c1917" />
      <path d="M0 -11 L28 0 L0 11 Z" fill="#44403c" />
      <path d="M24 1.5 V17" stroke="#d97706" strokeWidth={2.4} strokeLinecap="round" />
      <circle cx={24} cy={19.5} r={3.2} fill="#d97706" />
    </g>
  );
}

const Sparkle = ({ x, y, r = 8 }: { x: number; y: number; r?: number }) => (
  <path d={`M${x},${y - r} Q${x},${y} ${x + r},${y} Q${x},${y} ${x},${y + r} Q${x},${y} ${x - r},${y} Q${x},${y} ${x},${y - r}Z`} fill="#d97706" />
);

const Plane = ({ x, y }: { x: number; y: number }) => (
  <g transform={`translate(${x},${y}) rotate(-18)`}>
    <path d="M-14 -3 L16 -9 L-2 12 L-5 3 Z" fill="#f59e0b" />
    <path d="M-14 -3 L16 -9 L-5 3 Z" fill="#fbbf24" />
    <path d="M-5 3 L-2 12 L2 6 Z" fill="#b45309" />
  </g>
);

const VARIANTS: { key: string; name: string; note: string; vb: string; badge?: boolean; art: React.ReactNode }[] = [
  {
    key: "A", name: "Folded S + sparkle", note: "Thick accordion-fold ribbon, cap tilted on the left, a sparkle for “aha”.", vb: "-8 -20 104 120",
    art: <><Ribbon dark="#00693e" light="#16895c" /><Cap x={20} y={7} /><Sparkle x={77} y={74} r={9} /><Sparkle x={70} y={52} r={4.5} /></>,
  },
  {
    key: "B", name: "Folded S + paper plane", note: "The S is folded paper, and a folded-paper plane takes off from it.", vb: "-8 -20 112 120",
    art: <><Ribbon dark="#00693e" light="#16895c" /><Cap x={20} y={7} /><Plane x={80} y={62} /></>,
  },
  {
    key: "C", name: "Folded S + correct tick", note: "A quiz “correct” check in amber, bottom right.", vb: "-8 -20 112 120",
    art: <><Ribbon dark="#00693e" light="#16895c" /><Cap x={20} y={7} /><circle cx={80} cy={78} r={13} fill="#d97706" /><path d="M73.5 78.5 L78.5 83.5 L87 73" fill="none" stroke="#fff" strokeWidth={3.6} strokeLinecap="round" strokeLinejoin="round" /></>,
  },
  {
    key: "D", name: "App-icon badge", note: "White folded S on a green tile, cap hanging off the corner. Best when tiny.", vb: "-8 -20 112 120", badge: true,
    art: <>
      <rect x={6} y={10} width={88} height={88} rx={22} fill="#00693e" />
      <g transform="translate(6,8) scale(.9)"><Ribbon dark="#ffffff" light="#b7e4cf" w={17} /></g>
      <Cap x={26} y={12} s={0.85} /><Sparkle x={82} y={30} r={8} />
    </>,
  },
];

export default function LogoPreview() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Logo options</h1>
        <p className="text-stone-500">Temporary page. Tell me a letter (or what to change) and I’ll wire it in and delete this page.</p>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        {VARIANTS.map((v) => (
          <div key={v.key} className="card space-y-5">
            <div className="flex items-baseline gap-3"><span className="font-serif text-3xl font-bold text-[#00693e]">{v.key}</span><div><p className="font-semibold">{v.name}</p><p className="text-sm text-stone-500">{v.note}</p></div></div>
            <div className="flex items-end gap-8">
              <svg viewBox={v.vb} className="h-44">{v.art}</svg>
              <svg viewBox={v.vb} className="h-16">{v.art}</svg>
              <svg viewBox={v.vb} className="h-9">{v.art}</svg>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-4 py-2 font-serif text-xl font-bold text-[#00693e]">
              <svg viewBox={v.vb} className="h-10">{v.art}</svg>Sapient
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
