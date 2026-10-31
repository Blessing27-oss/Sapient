# Sapient

> Find what students don't know, before the exam.

A professor-controlled classroom diagnostic. Claude proposes concepts, relationships and questions from a lecture PDF; the professor edits and approves them; students answer three adaptive questions; the dashboard shows transparent, correctable evidence. Inspired by (not an implementation of) SAGE (Niyigaba et al., 2026).

## Run

```bash
npm install
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local   # optional: without it, use the sample notes
npm run dev
```

Open http://localhost:3000. Storage is in memory: restarting the server clears rooms.

## Demo script

1. **Professor** → `/professor` → *Use sample Fourier notes* (or upload a PDF). Edit concepts and relationships, approve questions, *Open room*.
2. **Students** → `/join` in two browser windows, enter the room code. Both get the same first question (convolution / LTI).
3. Answer it correctly in one window and incorrectly in the other: the correct student moves on to orthogonality, while the incorrect one is probed on the foundational complex-exponentials concept.
4. Dashboard (polls every 2 s) shows counts with denominators, per-student paths and a concept × student evidence grid.
5. A student clicks **I disagree with this assessment** → professor invalidates (or revises) the question → evidence is replayed without it everywhere.

## How it works

| File | Role |
|---|---|
| `src/lib/engine.ts` | Evidence propagation, question selection, labels, class summary |
| `src/lib/generate.ts` | One structured-output call to `claude-opus-5-5` (server-side refusal fallback enabled) |
| `src/lib/sample.ts` | Pre-generated fallback content |
| `src/lib/store.ts` | In-memory rooms |

- **Evidence:** correct = +1 and incorrect = −1 on tagged concepts (direct). Untagged neighbors get ±(strongest edge weight) once per response (inferred, one hop, no double counting). Nothing is cached: every read replays the immutable response log, so invalidations and answer-key revisions apply immediately.
- **Selection:** `Σ importance(c) / (1 + directCount(c))` over the question's concepts (foundational = 1.5), scaled by `clamp(1 − 3·inferred(c), 0.25, 3)`. Negative inferred evidence draws the next question toward related concepts; positive evidence moves it elsewhere. This is a heuristic, not an information-gain policy.
- **Labels:** Demonstrated strength / Needs review / Mixed evidence come only from direct answers; Tentative inference covers indirect-only evidence; anything else is Unknown.

## Limitations

Three questions cannot establish mastery. Edge weights are illustrative, not validated probabilities. This demonstrates an adaptive, contestable workflow, not scientifically validated precision.
