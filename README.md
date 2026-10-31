# Sapient

Find what students don't know, before the exam. A professor-controlled adaptive diagnostic.

    npm install && npm run dev      # http://localhost:3000
    npm test                        # engine tests

Set `ANTHROPIC_API_KEY=...` to enable PDF -> concepts/questions extraction. The professor workspace requires a PDF upload. PDF generation reports errors explicitly and never silently substitutes sample content. PDF text is extracted page by page, so source citations retain the original page numbers.

Professor access: `mitchelle.k.ngare.27@dartmouth.edu` and `kangorgodwin@gmail.com` (`lib/auth.ts`). Set `GOOGLE_CLIENT_ID` (a Google
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

- Generation (`lib/extract.ts`): structured-output generation with server-side fallback; generated concepts and questions require professor review. Source pages outside the document are omitted.
- Evidence spread: directly tested concepts count once per answer. Each untested neighbor receives only the strongest connecting edge weight, once per answer and one hop only.
- Revisions: choose **Keep choices and re-grade** for answer-key corrections (option positions must remain the same), or **Clear answers** when rewriting a question. Re-grading recomputes all evidence from saved choices. Invalidation retains the answer history but excludes it from evidence and the three-question budget.
- Dashboard: student paths retain crossed-out invalidated answers; the concept grid distinguishes direct answer counts from tentative inference and unknown concepts.

The root `app/`, `components/`, and `lib/` directories contain the single application. Run `npm test` for the engine, moderation, and generation regression tests.

### PDF generation efficiency

PDF parsing runs locally with original page boundaries. Formatting-only trailing spaces and excess blank lines are removed before generation; lecture content and equations are retained. Successful parsed PDFs and generated drafts are cached in process memory for 30 minutes (at most 8 documents per cache). Identical concurrent requests share work, failed requests can retry, and each returned draft is an independent copy. Restarting the server clears these caches. The draft cache key includes source, model, prompt, schema, and credentials. No lecture content is written to a new disk cache.

Uploads are limited to 20 MB and 400,000 extracted characters. The current model and topic-map output budget are retained; savings come from avoiding repeated parsing and AI requests rather than dropping material or switching models without evaluation.
