// Sapient mark: an S folded from one sheet of paper, with a face and a tilted graduation cap.
// With `animated`, it plays the landing intro: the S draws in, a frowning face appears, the cap drops on, then it smiles (see the lg-* timeline in globals.css).
// The spine is 148.85 units long (hence 149 in .lg-draw and the 11% band length of 16.4). Real units, not `pathLength`, so every browser draws the whole S.
const SPINE = "M57 30 C57 12 24 12 24 31 C24 48 59 40 59 61 C59 80 23 78 21 63";

export default function Logo({ className = "h-10", animated = false, sparkle = false }: { className?: string; animated?: boolean; sparkle?: boolean }) {
  const a = (cls: string) => (animated ? cls : undefined);
  const spark = (x: number, y: number, r: number, cls: string) => (
    <path className={a(cls)} d={`M${x},${y - r} Q${x},${y} ${x + r},${y} Q${x},${y} ${x},${y + r} Q${x},${y} ${x - r},${y} Q${x},${y} ${x},${y - r}Z`} fill="#d97706" />
  );
  return (
    <svg viewBox="-8 -20 104 120" className={`overflow-visible ${className}`} role="img" aria-label="Sapient">
      <path className={a("lg-draw")} d={SPINE} fill="none" stroke="#00693e" strokeWidth={16} strokeLinecap="round" strokeLinejoin="round" />
      <path className={a("lg-bands")} d={SPINE} fill="none" stroke="#16895c" strokeWidth={16} strokeDasharray="16.4 16.4" strokeDashoffset={-7.5} />

      {/* face: upright, centred on the S's middle stroke */}
      <g transform="translate(41.5,44.5)">
        <circle className={a("lg-eye")} cx={-6.5} cy={-2.8} r={2.2} fill="#fff" />
        <circle className={a("lg-eye")} cx={6.5} cy={-2.8} r={2.2} fill="#fff" />
        <path className={a("lg-mouth")} d="M-5 3 Q0 8 5 3" fill="none" stroke="#fff" strokeWidth={1.9} strokeLinecap="round" />
      </g>

      {/* cap: tilted 30 degrees and perched on the S's top-left shoulder. Its rim touches the outer edge of the curve at (26.9, 12.2), where the curve is also tilted 30 degrees, so the whole top of the S stays visible. */}
      <g className={a("lg-hat")}>
        <ellipse cx={26.9} cy={13} rx={12} ry={3.2} transform="rotate(-30 26.9 13)" fill="#000" opacity={0.25} />
        <g transform="translate(18.9,-1.7) rotate(-30) scale(0.8)">
          <path d="M-14 4 L-14 15 C-14 23 14 23 14 15 L14 4 Z" fill="#292524" />
          <path d="M-14 15 C-14 23 14 23 14 15" fill="none" stroke="#44403c" strokeWidth={1.2} />
          <path d="M0 -12 L30 0 L0 12 L-30 0 Z" fill="#1c1917" />
          <path d="M0 -12 L30 0 L0 12 Z" fill="#3b3633" />
          <path d="M0 0 Q15 -2.5 30 0" fill="none" stroke="#d97706" strokeWidth={1.6} strokeLinecap="round" />
          <circle cx={0} cy={0} r={2.4} fill="#d97706" />
        </g>
        {/* tassel: hangs straight down from the board's left corner, in the free space beside the S; cord and fringe sway as a linked pair */}
        <g transform="translate(-1.9,10.3)">
          <g className={a("lg-cord")}>
            <path d="M0 0 C3.5 5 -3.5 10 0.5 15 S-1 21 0 25" fill="none" stroke="#d97706" strokeWidth={1.7} strokeLinecap="round" />
            <g transform="translate(0,25)">
              <g className={a("lg-fringe")}>
                <circle r={2.6} fill="#d97706" />
                <g fill="none" stroke="#f59e0b" strokeWidth={1.5} strokeLinecap="round">
                  <path d="M0 2 Q-4 8 -5.5 14" /><path d="M0 2 Q-2 9 -2.6 16" /><path d="M0 2 L0 17" /><path d="M0 2 Q2 9 2.6 16" /><path d="M0 2 Q4 8 5.5 14" />
                </g>
              </g>
            </g>
          </g>
        </g>
      </g>

      {sparkle && <>{spark(80, 70, 9, "lg-spark")}{spark(72, 48, 4.5, "lg-spark lg-spark2")}</>}
    </svg>
  );
}
