# Demo Runbook

> Canonical three-minute sequence: [`docs/DEMO_SCRIPT.md`](https://github.com/sjohnston1972/darwin/blob/main/docs/DEMO_SCRIPT.md). This runbook adds preparation, recovery, and narration details without changing the proof claims.

## Goal

Demonstrate that a real ProjectFlow interaction can become inspectable evidence, a GPT-selected product mutation, a real Codex repository change, and a retained or reverted Genome record without editing source during the presentation.

## Preflight

Run this at least 15 minutes before presenting:

```powershell
cd C:\codex\darwin
git status --short
npm run typecheck
npm run test
npm run build
npm run smoke:production
```

Confirm:

- Darwin API reports online and GPT available;
- Target application verification shows the expected ProjectFlow commit;
- ProjectFlow study opens in a separate window;
- GitHub Actions and Cloudflare secrets are present;
- no unrelated ProjectFlow workflow is running;
- browser zoom is 100% and light theme is selected;
- popup/new-window behavior is allowed.

## Reset

Use **Reset evolution demo** only when you are prepared to clear Darwin telemetry, evidence, analyses, manifests, and execution history and dispatch the ProjectFlow baseline-reset workflow.

The current reset endpoint reports after dispatch rather than verified deployment completion. Wait for the ProjectFlow reset workflow and production deployment before starting measured interaction. This gap is tracked in issue [#10](https://github.com/sjohnston1972/darwin/issues/10).

## Three-minute choreography

### 0:00-0:25 - Connect the genome

1. Open **Target application**.
2. Show repository, branch, production URL, and study URL.
3. Point out active commit and source fingerprint.
4. Explain that `darwin.target.json` bounds source paths and checks.

### 0:25-0:55 - Generate measured behavior

1. Open the measured study in a new window.
2. Interact with dashboard/project/task surfaces naturally.
3. Include one clear friction journey: route loop, inert affordance, browser Back, hover hesitation, drag expectation, or readability zoom.
4. Complete or explicitly abandon the task attempt.

### 0:55-1:25 - Inspect evidence

1. Return to **Observations**.
2. Show raw event count, sessions, participant count, and behavior signals.
3. Select the session and inspect an ordered event.
4. Generate the evidence pack.
5. Expand one `EV-nnn` signal and show its trace/provenance.

### 1:25-1:55 - Invoke GPT-5.6

1. Open **Mutations**.
2. Point to the explicit OpenAI reasoning boundary and supplied context chips.
3. Click **Ask GPT-5.6**.
4. Expand the top pressure cluster and one alternative.
5. Compare evidence citations, competing explanation, change, tradeoffs, and validation plan.

### 1:55-2:35 - Execute with Codex

1. Select the supported mutation bundle.
2. Start controlled evolution.
3. Show the immutable manifest hash/base SHA.
4. Open the live GitHub Actions run.
5. Review the real diff, checks, changed files, Codex report, PR, and preview.

### 2:35-3:00 - Select and retain

1. Release the reviewed mutation.
2. Open **Genome**.
3. Expand the archived repository mutation and evidence record.
4. Explain that post-release fitness requires a new measured cohort.
5. Optionally show the separately reviewed rollback path.

Closing line:

> Darwin observed real behavior, reasoned over the exact source, and evolved the application through a controlled repository change.

## Failure branches

### GPT fails

- Keep the evidence pack visible.
- Read the returned error in the control room.
- Confirm System status reports the live model configuration.
- Do not present a cached or invented mutation as a new result.

### GitHub dispatch fails

- Preserve the manifest and execution error.
- Verify Worker `GITHUB_TOKEN`, target workflow name, and repository permissions.
- Retry only after the cause is corrected.

### Callback stalls

- Open the linked workflow.
- Compare execution ID and callback step.
- Verify `DARWIN_CALLBACK_TOKEN` is identical in Worker and ProjectFlow Actions.

### Preview fails

- Keep the candidate unreleased.
- Expand the failed validation output.
- Explain that failed selection is a valid controlled outcome.

## Recording guidance

- Capture at 1440x900 or 1920x1080.
- Keep browser chrome visible when showing the separate target and GitHub workflow.
- Do not hide errors or claim a predicted outcome as measured.
- Use the Genome expansion to prove provenance instead of narrating invisible backend work.
