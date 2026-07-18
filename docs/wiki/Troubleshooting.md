# Troubleshooting

## Darwin API shows offline

1. Open `/api/health` directly.
2. Check the Worker deployment and Wrangler tail.
3. Confirm `VITE_API_BASE_URL` points to the expected Worker.
4. Confirm the browser origin is in `ALLOWED_ORIGINS`.
5. Verify D1 migrations and binding name.

## Target verification fails

Check:

- repository is exactly the configured owner/name;
- branch matches Worker configuration;
- production and study URLs normalize to configured URLs;
- `darwin.target.json` exists at the resolved commit;
- all context paths exist and contain no unsafe path components;
- target HTML contains the ProjectFlow title;
- GitHub token can read the repository when required.

## No telemetry appears

1. Confirm ProjectFlow was opened with `?study=true`.
2. Inspect browser Network for `POST /api/telemetry/events`.
3. Verify event receipt is 202 and inspect accepted/rejected/duplicate counts.
4. Confirm ProjectFlow origin is allowed by Worker CORS.
5. Check the event study ID is `projectflow-baseline-study`.
6. Wait for the two-second control-room poll or click the Live refresh control.
7. Inspect local storage key `darwin:telemetry-outbox:*` for queued events without exposing its contents in public logs.

## Evidence generation says insufficient evidence

- Ensure at least one current-cycle event exists with `real_user` provenance.
- Complete or explicitly abandon a task attempt to create stronger task evidence.
- Check that the evidence cycle did not advance after a release.
- Do not try to use synthetic simulator events as measured evidence.

## GPT invocation fails

Check Worker secrets and variables:

```powershell
npx wrangler secret list --config workers/api/wrangler.toml
```

Verify:

- `DARWIN_AI_MODE=live`;
- `OPENAI_API_KEY` is present;
- configured model is available;
- timeout is sufficient;
- repository snapshot can be captured;
- evidence contains at least one friction signal.

Darwin intentionally returns no recommendation on model, timeout, JSON, citation, or scope failure.

## Manifest button appears to do nothing

The controlled evolution call has two phases: manifest creation and GitHub workflow dispatch. Inspect the visible error band, Network responses, and execution panel. Confirm at least one candidate checkbox is selected.

## GitHub execution remains queued

1. Open the workflow URL when available.
2. Check ProjectFlow Actions permissions and concurrency.
3. Verify `darwin-evolve.yml` exists on the tracked branch.
4. Verify callback URL is reachable from GitHub.
5. Confirm matching `DARWIN_CALLBACK_TOKEN` values.
6. Compare workflow execution/manifest IDs with Darwin.

## Execution reaches failed

Expand each validation check. Darwin preserves actual command output. Fix the target workflow, infrastructure, or requested change and use **Retry repository run**. Do not edit the stored patch or mark the execution passed manually.

## Release fails

Confirm:

- execution is `preview_ready`;
- PR is open and its head SHA matches the callback;
- GitHub token can merge that repository;
- branch protection requirements are satisfied;
- another request did not already merge the PR.

Concurrent release hardening is tracked in issue #5.

## Reset appears complete but ProjectFlow is unchanged

The current endpoint confirms dispatch, not finished deployment. Open the ProjectFlow reset workflow and wait for production Pages deployment. Verified reset state is tracked in issue #10.

## UI looks stale in another tab

The current manual refresh does not reload every derived artifact. Reload the page as a temporary workaround. Full hydration is tracked in issue #17.

## Tooltip is clipped

Current explanatory tooltips use a body-level portal and viewport clamping. If clipping recurs, record the view, element, viewport dimensions, zoom, theme, and screenshot, then extend the focused Playwright edge-position regression case.

## Safe diagnostics

Useful non-secret diagnostics:

- Worker health JSON;
- request route/status and request ID when available;
- execution/manifest/evidence IDs and hashes;
- short commit SHA;
- validation command name/status/duration;
- browser viewport/zoom/theme;
- sanitized console error.

Never paste API keys, GitHub tokens, callback tokens, full environment output, or raw participant traces into public issues.
