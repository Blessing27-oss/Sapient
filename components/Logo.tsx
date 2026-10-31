// Sapient mark: an S folded from one sheet of paper, wearing a graduation cap, with a smile.
export default function Logo({ className = "h-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 82" className={className} role="img" aria-label="Sapient">

      {/* folded-paper S: one ribbon, with the two folds shaded */}
      <path d="M45 30 C45 20 19 20 19 33 C19 45 45 41 45 54 C45 66 17 65 17 54" fill="none" stroke="#00693e" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M19 28.5 L27 24 L25 31 Z" fill="#4ca87c"/>
      <path d="M45 38 L37 42.5 L39.5 35 Z" fill="#023f26"/>
      <path d="M45 49 L37 44.5 L38 52 Z" fill="#4ca87c"/>
      <path d="M17 59 L25 62.5 L24 56 Z" fill="#023f26"/>
      {/* graduation cap */}
      <path d="M21 14 v7 c0 4 22 4 22 0 v-7" fill="#292524"/>
      <path d="M32 3 L55 12 L32 21 L9 12 Z" fill="#1c1917"/>
      <path d="M32 3 L55 12 L32 21 Z" fill="#44403c"/>
      <path d="M52 13.5 V25" stroke="#d97706" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="52" cy="27" r="2.6" fill="#d97706"/>
      {/* smile */}
      <path d="M22 70 Q32 78 42 70" fill="none" stroke="#d97706" strokeWidth="3.5" strokeLinecap="round"/>

    </svg>
  );
}
