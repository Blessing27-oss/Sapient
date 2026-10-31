# KnowGap

Find what students don't know, before the exam. A professor-controlled adaptive diagnostic.

    npm install && npm run dev      # http://localhost:3000
    npm test                        # engine tests

Optional: `ANTHROPIC_API_KEY=...` enables PDF -> concepts/questions extraction. Without it (or if the PDF
fails) the built-in Fourier sample lesson loads, so the demo always works.

Professor access: only `mitchelle.k.ngare.27@dartmouth.edu` (`lib/auth.ts`). Set `GOOGLE_CLIENT_ID` (a Google
OAuth web client with your origin authorised) for real Google sign-in, verified server-side. Also set
`SESSION_SECRET`. Without a client ID, a dev-only email login works outside production and is NOT secure.
Students need no account.

Flow: `/professor` (upload/edit/approve -> room code) -> `/student` (join, 3 adaptive questions, diagnostic,
"I disagree" challenge) -> `/dashboard/<code>` (class diagnostic, challenged questions, per-student map).

Design notes
- Store: JSON file in `.data/` (swap for Supabase later). Students join by 4-letter room code; professor routes are session-protected.
- Engine (`lib/engine.ts`): one-hop undirected propagation; evidence is recomputed from valid responses, so
  invalidating a question exactly removes its effect. Inferred evidence never becomes "Demonstrated strength".
- Selection deviates from the spec formula: importance/(1+directCount) ignores correctness, so all students
  would get the same sequence. We adjust by evidence (probe suspected gaps/conflicts, deprioritise
  plausible-by-inference concepts). Weights are illustrative, not validated.
- Not demonstrated: that 3 questions accurately recover a knowledge state. That needs a fixed-quiz comparison.
