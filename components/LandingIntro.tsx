"use client";
import { useEffect, useRef, useState } from "react";
import Lockup from "./Lockup";

// Plays the logo intro on the landing page: the S draws itself, smiles, slides left as "apient" unfolds to spell Sapient, then the whole word flies into the nav corner.
// Only after it lands does the rest of the page (children) appear. Plays on every fresh page load.
// Lives in memory, not storage: a refresh or a new visit replays the intro, but clicking the logo to come back to "/" inside the site does not.
let introPlayed = false;
const FLY_AT = 3500; // ms into the intro when "Sapient" leaves for the corner (after "apient" has unfolded)

export default function LandingIntro({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<"intro" | "landed" | "done">("intro");
  const box = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    if (introPlayed || matchMedia("(prefers-reduced-motion: reduce)").matches) { setPhase("done"); return; }
    introPlayed = true;

    // The CSS beats run from first paint, but this effect only runs after hydration. Count the flight delay from the S's own
    // animation clock so the two never drift apart.
    const elapsed = document.querySelector(".lg-draw")?.getAnimations()[0]?.currentTime;
    const wait = Math.max(0, FLY_AT - (typeof elapsed === "number" ? elapsed : 0));
    timers.current.push(window.setTimeout(() => {
      const target = document.querySelector("[data-nav-brand]")?.getBoundingClientRect();
      const el = box.current;
      if (!el || !target) { setPhase("done"); return; }
      const from = el.getBoundingClientRect();
      const scale = target.width / from.width;
      el.animate(
        [{ transform: "translate(0,0) scale(1)" }, { transform: `translate(${target.left - from.left}px, ${target.top - from.top}px) scale(${scale})` }],
        { duration: 900, easing: "cubic-bezier(.6,0,.2,1)", fill: "forwards" },
      ).onfinish = () => {
        setPhase("landed"); // nav logo fades in under the flying one...
        timers.current.push(window.setTimeout(() => setPhase("done"), 450)); // ...then the flying one is removed
      };
    }, wait));
    return () => timers.current.forEach(clearTimeout);
  }, []);

  return (
    <>
      {phase === "intro" && <style>{"[data-nav-brand]{opacity:0}"}</style>}
      {phase !== "done" && (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-50 grid place-items-center">
          <div ref={box} className="inline-block" style={{ transformOrigin: "0 0" }}>
            <Lockup animated className="[font-size:min(150px,12.5vw)]" />
          </div>
        </div>
      )}
      <div className={`lg-rest ${phase === "intro" ? "" : "lg-go"}`}>{children}</div>
    </>
  );
}
