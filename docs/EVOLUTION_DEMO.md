# Darwin evolution demo — runbook

A concrete, repeatable demo of the full loop: **real behaviour → cited evidence →
AI-interpreted friction → human-approved, repo-backed mutation → validated release
→ measured fitness.**

The target app (ProjectFlow) is deliberately polished, so the demo relies on a
small number of **known, un-fixed friction points** plus a way to **manufacture
session volume** (a single interaction is intentionally discounted by the engine).

---

## 0. One-time setup

1. **Seed the friction.** Merge `sjohnston1972/projectflow#19` (the status-filter
   plant) to `main` and let ProjectFlow deploy. This is the "before" state.
   - Result: on the Dashboard, **"At risk / On track / Overdue"** render as
     filter pills above the project list, but they do nothing when clicked.
2. **(Re)connect the target** in Rosalind → *Target application* → verify. This
   pins Darwin to the new baseline commit so its telemetry cohort matches.
   > If evidence generation returns **409 `telemetry_version_mismatch`**, the
   > connected commit and the telemetry's app version disagree — reconnect so the
   > cohort matches the deployed commit. This is the integrity gate, not a bug.

---

## 1. The friction points (what the engine will actually detect)

| Element | How to trigger | Detector that fires | AI's likely reading | Fix Codex ships |
| --- | --- | --- | --- | --- |
| **Status-filter chips** (planted) | Click "At risk" / "Overdue" | `false_affordance` (medium) | "chips look interactive but aren't; users expect to filter" | wire them to filter the project list |
| **Metric cards** ("My workload 2", etc.) — *already latent* | Click a metric card | `false_affordance` | "users click the card expecting to drill into those items" | make the card open the filtered view |
| **Account icon** (top-right) — *already latent* | Hover ≥2s / click | `hover_hesitation` + `false_affordance` | "icon's purpose is unclear / not actionable" | add a menu + tooltip/label |
| **Detail pages** | Open a project, use the browser Back button | `browser_back_dependency` | "wants clearer in-app return nav" | add a breadcrumb / back button |
| **Notification bell** | Click it (does nothing) | (interactive → no signal) | — | *not a good demo target; needs planting* |

**Hero for the demo: the planted status-filter chips.** Cleanest narrative,
obvious before/after, high-confidence detection.

---

## 2. Manufacture the evidence (pick ONE)

A single hover/click is deliberately ignored — the reasoning prompt *"never turns
a single hover, drag, or click into a product-wide claim"*, and evidence must clear
a volume/diversity/completion quality gate. So produce a **population**:

### Option A — Darwin Labs (recommended, self-contained)
1. Rosalind → **Darwin Labs** → goal box → e.g.
   *"Filter the dashboard to the projects that are at risk."*
2. **Send agents.** A population of browser agents attempts it on the real app,
   repeatedly clicking the dead status chips → `false_affordance` at scale.
3. Watch the population fill in; when done, **Changes ready** shows the mutation
   portfolio. Click **Use this change** → hands off to **Mutations**.

### Option B — Real users / you
1. Open the deployed **study** ProjectFlow in several browser sessions.
2. In each, click the status chips (and a metric card) a few times.
3. Rosalind → **Mutations** → **Analyse latest behaviour** (one button now builds
   the evidence pack *and* runs GPT — no need to visit Observations).

### Option C — Synthetic replay (fastest, no browsers)
Rosalind → run the deterministic 10,000-event synthetic replay, then **Analyse
latest behaviour**.

---

## 3. Drive the loop (what to show on screen)

1. **Observations** — point out the live **Session evidence** panel capturing
   semantic events, then the **top-pressure** overview. Expand *Full signal
   inspector* only if someone asks (it's collapsed by default now).
2. **Mutations** — the ranked, **evidence-cited** portfolio. Open a candidate:
   hypothesis, the exact cited `EV-###` signals, scorecard, validation plan.
   Emphasise: *it cites evidence and requires human approval — it is not vibes.*
3. **Approve** the "make status chips filter" candidate → **Start controlled
   evolution.** Codex opens a **real PR** on ProjectFlow, repository policy +
   `npm run verify` run as **checks**, and a **preview deploy** appears.
4. **Release** the reviewed PR. ProjectFlow redeploys; the chips now filter.
   Show the **before/after** live.
5. **Genome** — the released mutation is retained with its evidence + PR +
   checks. (Fitness delta stays `PENDING` until a post-release cohort is
   measured on the evolved commit — see caveats.)

---

## 4. Expected model output for the hero friction

> **Cluster:** users repeatedly click the dashboard status chips (`At risk`,
> `Overdue`) that present as interactive filter controls but take no action —
> `false_affordance`, medium severity, N sessions.
> **Mutation:** *Make the status chips filter the project list.* Wire each chip
> to filter `project-health-list` by status; keep the existing project buttons.
> **Validation:** reduced `false_affordance` on `dashboard-status-filter-*`;
> fewer full project-list scans per task.

---

## 5. Caveats to pre-empt on stage

- **409 version mismatch** → reconnect the target so the cohort matches the
  deployed commit (see setup).
- **"Insufficient" evidence** → not enough volume/diversity; run a bigger Labs
  population or the synthetic replay.
- **Fitness delta = PENDING/`--`** → needs real post-release traffic on the
  evolved variant; expected in a fresh demo, not a failure.
- **Change budget** → Codex is bounded to 4 files / 1,200 lines and the
  allow-listed paths (`App.tsx`, `App.test.tsx`, `data.ts`, `styles.css`).

---

## 6. Adding more friction later

Plant in ProjectFlow's mutable paths only, keep `npm run verify` green, and make
the element *look* actionable while emitting the right signal:
- dead-click → non-interactive element with `data-darwin-id` + `cursor: pointer`
  (→ `false_affordance`);
- unclear affordance → icon-only control with no tooltip/label (→ `hover_hesitation`);
- return-nav gap → detail view with no in-app back (→ `browser_back_dependency`);
- drag expectation → reorderable-looking card that isn't draggable (→ `drag_expectation`).
