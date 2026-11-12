<p align="center">
  <img src="docs/images/sapient-overview.svg" alt="Sapient — Every lecture, mapped. A lecture PDF becomes a professor-reviewed map, adaptive questions, and class insights." width="100%" />
</p>

<p align="center"><strong>Find what students don't know, before the exam.</strong><br />A professor-controlled, AI-assisted lecture mapping and adaptive diagnostic platform.</p>

<p align="center"><strong><a href="https://sapient-production.up.railway.app">Try the live app →</a></strong></p>

<p align="center">
  <a href="#hackathon">Dartmouth AI @ 70</a> ·
  <a href="#the-project">Project</a> ·
  <a href="#system-architecture">Architecture</a> ·
  <a href="#getting-started">Run locally</a> ·
  <a href="#deployment">Deployment</a> ·
  <a href="#team">Team</a>
</p>

## Hackathon

Sapient was built for **Dartmouth AI @ 70**, the **AI at 70 Student Hackathon**, held **October 30–31, 2026, in Hanover, New Hampshire**. The event brought students together to prototype solutions at the intersection of AI and human judgment, alongside Dartmouth's *What Must Remain Human?* conference. See the [hackathon website and schedule](https://dartmouth-ai-hackathon.vercel.app/#schedule) for event details, and Dartmouth’s [AI at 70 Student Hackathon overview](https://ai.dartmouth.edu/ai-70-events/what-must-remain-human-conference/ai-70-student-hackathon) for additional context.

Our answer to that theme is a classroom tool where AI drafts learning materials and helps surface possible gaps, while professors approve assessments, interpret the evidence, and resolve student challenges. Students can question an assessment rather than simply accept an automated result.

## The project

A lecture can cover dozens of connected ideas, but a final score rarely tells a professor which ideas need another explanation. Students also need a clearer starting point for revision than “study everything.”

**Sapient turns lecture PDFs into editable topic maps and short, adaptive diagnostics.** Professors review the generated material before publishing a room. Students join with a room code, answer three adaptive questions, and see concept-level evidence alongside a lecture map. Professors receive a class dashboard for follow-up teaching.

### What you can do

| For professors | For students |
| --- | --- |
| Upload a lecture PDF or reuse a saved source | Join a lecture room with a four-letter code |
| Edit lecture maps, concept connections, and questions | Complete a three-question adaptive diagnostic |
| Approve questions before students receive them | Explore demonstrated strengths, review areas, and tentative inferences |
| See class gaps, individual paths, and recurring study topics | Revisit lecture maps and ask a source-grounded study helper |
| Correct answer keys, invalidate questions, and resolve challenges | Generate practice questions and challenge an assessment |

### The classroom workflow

```mermaid
flowchart LR
    A[Upload lecture PDF] --> B[AI drafts map and questions]
    B --> C[Professor edits and approves]
    C --> D[Publish room code]
    D --> E[Student answers adaptive questions]
    E --> F[Personal concept diagnostic]
    F --> G[Study helper and practice]
    E --> H[Professor dashboard]
    F --> I[Student challenges a question]
    I --> J[Professor reviews and corrects]
    J --> H
```

*Figure 1. The learning loop keeps professor review before publication and supports corrections after assessment.*

## System architecture

Sapient is a single **Next.js App Router application**. React renders the professor, student, and dashboard interfaces; server route handlers manage authentication, generation, assessment, and persistence.

```mermaid
flowchart TB
    subgraph UI[Browser interfaces]
        P[Professor workspace]
        S[Student diagnostic and study helper]
        D[Class dashboard]
    end
    subgraph Server[Next.js server / Node.js]
        API[Route handlers and session checks]
        PDF[Local PDF text extraction]
        GEN[Structured draft generation and validation]
        ENG[Deterministic adaptive engine]
        RET[Keyword-ranked source retrieval]
    end
    AI[Anthropic API]
    DB[(PostgreSQL)]
    P --> API
    S --> API
    D --> API
    API --> PDF
    PDF --> GEN
    GEN <--> AI
    API --> ENG
    API --> RET
    API <--> DB
    RET --> DB
    API <-->|Study chat and practice| AI
```

*Figure 2. AI generates content and study support; the local engine computes diagnostic evidence and question selection.*

### Technology stack

| Layer | Implementation |
| --- | --- |
| Application | Next.js 15.5, React 19, TypeScript |
| Styling | Tailwind CSS 4 and custom CSS |
| AI integration | Anthropic SDK; model identifiers are configured in the server code |
| PDF extraction | `unpdf`, processed locally with original page boundaries |
| Graph visualization | SVG/React components and Dagre layout |
| Authentication | Salted scrypt password hashes and HMAC-signed session cookies |
| Persistence | PostgreSQL via `pg` in production; embedded [PGlite](https://pglite.dev) (Postgres compiled to WASM) for local development and tests |
| Hosting | [Railway](https://railway.com), single Node.js service |
| Tests | Node.js test runner with TypeScript stripping |

## Implementation

### 1. From PDF to reviewed assessment

`lib/pdf.ts` extracts readable text page by page. Uploads are limited to **20 MB** and **400,000 extracted characters**. The server saves extracted pages and overlapping text chunks before requesting AI generation, so a failed AI call still leaves a reusable lecture source.

`lib/extract.ts` generates structured concepts, assessment connections, questions, and lecture topic maps, with a server-side fallback for generation compatibility. Sanitization checks the output and omits source-page references outside the document. Generated material requires professor review; failed generation is reported explicitly rather than silently replaced with sample content.

The lecture's **topic map** and the engine's **assessment connections** are separate structures. Topic maps explain the lecture visually; weighted assessment connections support tentative evidence propagation. Existing rooms without a topic map fall back to their concept connections.

### 2. Adaptive question selection and evidence

`lib/engine.ts` implements a three-question budget. It selects from approved, valid, unanswered questions using the sum of each tagged concept's priority:

```text
question score = Σ [concept importance × evidence factor / (1 + direct answer count)]
```

The evidence factor increases attention to negative inferred evidence and conflicting direct answers, and reduces attention to positive inferred evidence. These weights are illustrative heuristics, not a validated learning model.

Each answer produces direct evidence for its tagged concepts. Evidence spreads **one hop, in either direction**, to connected concepts. An untested neighbor receives only the strongest connecting edge weight once per answer; evidence does not cascade through the graph.

| Diagnostic label | Evidence used |
| --- | --- |
| Demonstrated strength | Correct direct answers, with no incorrect direct answers |
| Needs review | Incorrect direct answers, with no correct direct answers |
| Mixed evidence | Both correct and incorrect direct answers |
| Tentative inference (+ / −) | Neighbor evidence only; the concept has not been tested directly |
| Unknown | No direct or inferred evidence |

Inference alone never becomes “Demonstrated strength.” The class dashboard's gap calculations use students with direct answers on a concept, keeping inferred evidence out of the denominator.

### 3. Professor moderation and corrections

Students can challenge a question from their results. Professors can revise it, correct the answer key, or invalidate it:

- **Keep choices and re-grade:** use for answer-key corrections while preserving option positions. Saved choices are graded again against the current key.
- **Clear answers:** use when rewriting a question so previous choices no longer apply.
- **Invalidate:** preserve the answer history but remove the question's contribution to evidence and the three-question budget.

Evidence is recomputed from valid saved responses, so removing a question removes its effect exactly. The dashboard retains crossed-out invalidated answers for context.

### 4. Lecture-grounded study support

After the diagnostic, the study helper receives concept descriptions, the student's diagnostic evidence, their own answered questions, and matching lecture excerpts with filenames and physical PDF page numbers. It is instructed to cite those excerpts and avoid inventing lecture citations. Unseen assessment questions are excluded from its prompt.

`lib/sources.ts` retrieves bounded, keyword-ranked chunks; it does not use embeddings or vector search. Rooms without saved lecture sources use concept descriptions and the student's own answered questions. Generated practice questions do not change diagnostic evidence.

The professor dashboard also summarizes recurring study-helper topics. Stored topic records use paraphrases and salted per-room student hashes; a topic is displayed only after at least two distinct students have asked about it.

### 5. Persistence and caching

`lib/db.ts` gives the stores one query and transaction interface over two drivers. When `DATABASE_URL` is set, it uses node-postgres. Otherwise it uses PGlite, an embedded Postgres stored in `.data/pglite`, so running locally or testing needs no database server. Schema changes are versioned migrations that run at startup under an advisory lock.

| Table | Contents |
| --- | --- |
| `rooms` | One JSONB document per room (concepts, questions, responses, challenges, insights), plus owner and title columns for lookups |
| `room_members` | Which accounts joined which rooms, so a student's room list is an indexed query |
| `users` | Accounts, password salts, and password hashes; `username` is `UNIQUE` |
| `sources` | Extracted lecture text, page boundaries, and overlapping chunks |

Every room change runs `withRoom(code, fn)`: a transaction that locks the room's row (`SELECT … FOR UPDATE`), applies the change, and writes the room back only if it changed. Concurrent answers to the same room are therefore applied one after another, even across several server instances. Room codes and usernames are claimed through primary-key and unique constraints, so concurrent requests cannot both get the same one.

Original PDF binaries are not retained. Identical extracted sources are deduplicated per professor.

Parsed PDFs and generated drafts each use an in-memory cache with a **30-minute lifetime** and a maximum of **8 documents**. Identical concurrent requests share work, failures can retry, and returned drafts are independent copies. Draft cache keys account for source, model, prompt, schema, and credentials. Restarting the server clears these caches; saved sources remain in the database.

## Getting started

### Prerequisites

- **Node.js 22.6+**, with support for `--experimental-strip-types` for the test command.
- **npm**.
- An **Anthropic API key** with access to the models configured in the code. The current model identifier is `claude-opus-5-5`; check `lib/extract.ts`, `lib/asked.ts`, and the chat/practice route handlers if your account requires a different model.
- A PDF containing readable lecture text. Image-only scans need text extraction before upload; an OCR pipeline is not implemented here.

### Install and configure

```bash
git clone https://github.com/Blessing27-oss/Sapient.git
cd Sapient
npm ci
```

Create or update your local `.env` with:

```dotenv
ANTHROPIC_API_KEY=your-anthropic-api-key
SESSION_SECRET=your-long-random-session-secret
# Optional: use a Postgres server instead of the embedded database in .data/pglite
# DATABASE_URL=postgres://user:password@localhost:5432/sapient
```

Generate a session secret with:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Keep these values local; `.env` files are excluded from Git. A configured `SESSION_SECRET` keeps session signing stable across server restarts. Without it, the application creates a process-local secret.

```bash
npm run dev
```

Open **http://localhost:3000**. Without `DATABASE_URL`, the embedded database is created in `.data/pglite` on first request and migrated automatically.

### Demo walkthrough

1. Sign up as a **Professor**. Your name is your login handle and must be unique, ignoring case.
2. Open `/professor`, upload a lecture PDF, and wait for generation.
3. Review the map, concepts, answer keys, and questions. Approve enough valid questions for a three-question diagnostic, then publish the room.
4. In a separate browser profile, sign up as a **Student**, open `/student`, and enter the room code.
5. Answer three questions and inspect the resulting concept map, evidence labels, study helper, and practice options.
6. Challenge an answer, then return to `/dashboard/<code>` as the professor to review the class results and resolve the challenge.

### Development commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm test` | Run engine, moderation, generation, graph, source, tutor, and related regression tests |
| `npm run lint` | Run ESLint |
| `npm run build` | Build the production application |
| `npm start` | Serve the production build |
| `npm run db:import` | One-time copy of legacy JSON data (`.data/users.json`, `db.json`, `sources/`) into the database; safe to re-run |

## Deployment

The live app runs at **https://sapient-production.up.railway.app**.

It is hosted on Railway as one service, `sapient`, in the project of the same name, built from the repository with Railway's default Node.js builder (`npm run build`, then `npm start`).

In production, Sapient stores its data in a Railway PostgreSQL database. The service reads it from `DATABASE_URL`, set as a reference variable to `${{Postgres.DATABASE_URL}}`. Migrations run automatically on the first request after each deploy. Because all state lives in Postgres, the service doesn't need a persistent disk and can run more than one replica.

| Setting | Value |
| --- | --- |
| Service URL | `https://sapient-production.up.railway.app` |
| Database | Railway PostgreSQL, connected via `DATABASE_URL` |
| Required variables | `ANTHROPIC_API_KEY`, `SESSION_SECRET`, `DATABASE_URL` |

Without `SESSION_SECRET`, the server generates a new signing secret on each start, which signs everyone out after every redeploy.

### Redeploying

Deploys are currently uploaded from a local checkout rather than triggered by GitHub pushes. To redeploy, run this from the project root:

```bash
npx @railway/cli login   # first time only
npx @railway/cli link    # first time only: choose the sapient project and service
npx @railway/cli up
```

`railway up` honors `.gitignore`, so your local `.env` and `.data/` are not uploaded. The production database starts separate from any local data.

Useful commands:

| Command | Purpose |
| --- | --- |
| `npx @railway/cli logs` | Show runtime logs |
| `npx @railway/cli variable list` | List environment variables |
| `npx @railway/cli variable set KEY --stdin` | Set a variable from standard input, keeping it out of shell history |
| `npx @railway/cli connect Postgres` | Open a `psql` shell on the production database |

### Moving existing data from the JSON volume

Deployments from before the Postgres migration kept data in JSON files on a volume mounted at `/app/.data`. To copy it over once, add the Postgres service and `DATABASE_URL`, deploy, then run the importer inside the service, where the volume is mounted:

```bash
npx @railway/cli ssh -- npm run db:import -- /app/.data
```

The import runs in one transaction and skips rows that already exist. After you've confirmed the data in Postgres, you can detach the volume.

## Repository guide

```text
app/
  professor/           PDF upload, map editing, and assessment review
  student/             Room joining, diagnostic results, and study support
  dashboard/[code]/    Professor class dashboard
  api/                 Authentication, rooms, sources, generation, and tutoring
components/            Graphs, topic maps, charts, practice, and chat UI
lib/
  engine.ts            Evidence updates, question selection, and class diagnostics
  extract.ts           Structured AI generation and output sanitization
  pdf.ts               PDF parsing and upload limits
  sources.ts           Lecture source storage and chunk retrieval
  moderate.ts          Question revision and correction logic
  tutor.ts             Study-helper prompts and practice validation
  asked.ts             Aggregated study-helper topic summaries
  auth.ts / users.ts   Sessions and account storage
  db.ts                Postgres/PGlite driver wrapper and schema migrations
  store.ts             Room storage with row-level locking
  importJson.ts        One-time import of the legacy JSON data
  *.test.ts            Regression tests
docs/images/           README figures
scripts/import-json.ts One-time legacy data import (npm run db:import)
```

Source retrieval is available through `GET /api/rooms/<code>/sources?q=<question>` to the room owner or enrolled students. Signed-in professors can list their saved source metadata through `GET /api/sources`.

## Team

| Member | Role | GitHub |
| --- | --- | --- |
| Godwin Kangor | Technical Lead, AI & Backend | [@GodwinKangor](https://github.com/GodwinKangor) |
| Blessing Ndeh | Assessment Engine & Student Experience | [@Blessing27-oss](https://github.com/Blessing27-oss) |
| Mitchellengare | Frontend & UI/UX Design | [@Mitchellengare](https://github.com/Mitchellengare) |

## Current limits and next steps

Sapient is a hackathon prototype. Three questions provide a small sample of understanding; the project has **not demonstrated that they accurately recover a student's knowledge state**. A useful next evaluation is a comparison against a fixed quiz, measuring gap detection and question efficiency.

Room data is stored as one JSONB document per room and locked as a whole while it's updated. That's simple and correct at classroom scale. For very large classes, splitting students and responses into their own tables would reduce lock contention. Older rooms without source IDs need a newly uploaded source and a newly published room for lecture-source retrieval.

Professor signup is self-selected without institutional verification. AI-generated questions, explanations, and citations can be wrong and require review. Next steps include validating the diagnostic heuristics, strengthening account provisioning, and normalizing high-write room data into separate tables.
