# Sapient

Find what students don't know, before the exam. A professor-controlled adaptive diagnostic.

    npm install && npm run dev      # http://localhost:3000
    npm test                        # engine tests

Set `ANTHROPIC_API_KEY=...` to enable PDF -> concepts/questions extraction. The professor workspace requires a PDF upload. PDF generation reports errors explicitly and never silently substitutes sample content. PDF text is extracted page by page, so source citations retain the original page numbers.

Accounts: people sign up with a name and password and choose Professor or Student. Names are unique and double as the
login. There is no professor verification, so anyone can create a professor account. Set `SESSION_SECRET` for
stable sessions.

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

## Topic maps and PDF generation

Lecture topic maps remain separate from editable assessment connections. The professor workspace keeps the editable lecture topic map; student diagnostics and dashboard retain the detailed lecture maps. Existing rooms without topic maps use their concept connections as a fallback.

### PDF generation efficiency

PDF parsing runs locally with original page boundaries. Formatting-only trailing spaces and excess blank lines are removed before generation; lecture content and equations are retained. Successful parsed PDFs and generated drafts are cached in process memory for 30 minutes (at most 8 documents per cache). Identical concurrent requests share work, failed requests can retry, and each returned draft is an independent copy. Restarting the server clears these caches. The draft cache key includes source, model, prompt, schema, and credentials. No lecture content is written to a new disk cache.

Uploads are limited to 20 MB and 400,000 extracted characters. The current model and topic-map output budget are retained; savings come from avoiding repeated parsing and AI requests rather than dropping material or switching models without evaluation.

### Persistent lecture sources

Readable PDF text is now saved before AI generation to `.data/sources/<source-id>.json`, including filename, original page boundaries, and overlapping text chunks. Original PDF binaries are not retained. Identical extracted content is deduplicated per professor; source files survive process restarts and are excluded from Git. The professor workspace lists saved sources and can generate from them without re-uploading. A failed AI request still leaves the source saved.

Published rooms retain `sourceIds`. Server-side bot code can call `getRoomSources(room, user)` followed by `retrieveSourceChunks(sources, question)` from `lib/sources.ts` to obtain bounded, keyword-ranked excerpts with source ids, filenames, and physical PDF page numbers. This is a retrieval interface, not a chatbot implementation or semantic/vector search. `GET /api/rooms/<code>/sources?q=<question>` exposes the same excerpts only to the room owner or enrolled students. `GET /api/sources` lists the signed-in professor's source metadata.

These files are persistent on this machine's disk. Hosting on ephemeral or serverless filesystems requires moving the source store to durable database/object storage before relying on cross-deployment persistence. Existing rooms without `sourceIds` need a newly uploaded source and a newly published room to gain source-grounded retrieval.

The student study-helper chat retrieves matching saved source excerpts for each question and receives their filenames and physical PDF page numbers for citations. Rooms without saved sources continue to use concept descriptions and the student’s own answered questions.
