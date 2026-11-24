# Local testing

This is the executable local runbook. [Environment](environment.md) owns device,
browser, secrets and permission rules; do not duplicate those tool instructions here.

## Prepare

- Install dependencies with the configured package manager: Use the commands documented by the relevant scaffold PR.
- Create ignored local environment files from: The scaffold PR establishes environment configuration, if needed.
- Start dependencies and apply local migrations/seeds: Use the sample room and lamp fixture from the issue.
- Check existing processes and ports against Environment's project-level table.

Keep local configuration pointed at isolated development services.
Never copy production data into a local fixture without explicit authorization.

## Run the stack

Start from your own worktree using: the startup commands documented by the scaffold PR.
Confirm readiness using: a loaded editor and a successful layout round trip against the issue’s target adapter.
Record which process serves which worktree; a running server may serve another checkout.
Use background execution supported by the harness and keep logs under `/tmp`.

## Sign in

Local test account roles and safe provisioning: The initial editor probe uses synthetic layout data.
Sign-in flow and local-only code/credential retrieval: Sign-in behavior is outside the editor probe.
Admin or privileged test flow: No privileged flow in the editor probe.
Describe secret retrieval, never secret values. Use synthetic accounts.
Keep sessions when safe instead of repeatedly consuming rate-limited sign-in codes.

## Simulator or emulator flow

Preferred platform, target and app identifier come from Environment's device setup.
Build/install and development-server connection: Use the browser startup path.
Navigation to the test surface: Open the editor in Chrome or Edge.
Native rebuild triggers for this stack: No native client.
Mark this section not used when there is no native app.

## Proof

The [delivery workflow](coding-workflow.md#prove) owns required evidence.
Project-specific acceptance checks and runtime proof: Record clean checkout commands and results, then show the issue’s browser acceptance flow. Identify the mock or real API used for the run.
Include accessibility, error recovery and target platform coverage where applicable.
For documentation-only changes, check links, placeholders and independence.
Report unavailable environments and exactly which behavior remains unobserved.

## Finish

Project cleanup and generated-file caveats: Keep dependency directories, local database files, and generated evidence out of the diff.
Stop only processes started by your session and release only your device/browser sessions.
Inspect `git diff` for generated noise before committing.
Leave shared services in their previous state unless the task authorized a change.
