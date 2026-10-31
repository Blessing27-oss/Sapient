import Logo from "./Logo";

// The S mark is the first letter of "Sapient": mark + "apient". Sized in em (mark = 2em tall), so one font-size scales the whole piece.
// With `animated` (landing intro), "apient" starts collapsed and unfolds letter by letter, which slides the S to the left (see lg-apient in globals.css).
export default function Lockup({ animated = false, className = "" }: { animated?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-start ${className}`}>
      <Logo animated={animated} className="h-[2em] w-auto shrink-0" />
      <span className={`${animated ? "lg-apient" : ""} grid -ml-[0.42em] -mr-[0.3em]`} style={animated ? undefined : { gridTemplateColumns: "1fr" }}>
        <span className="-mb-[0.4em] min-w-0 overflow-hidden pb-[0.4em] pr-[0.3em] pt-[0.1em]">
          <span className="inline-block whitespace-nowrap font-serif font-bold leading-none" style={{ fontSize: "1.35em", marginTop: "0.343em" }} aria-label="apient">
            {"apient".split("").map((c, i) => (
              <span key={i} aria-hidden className={`fold-text ${animated ? "lg-letter" : "inline-block"}`} style={{ ["--i" as string]: i }}>{c}</span>
            ))}
          </span>
        </span>
      </span>
    </span>
  );
}
