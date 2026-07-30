# Claude Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a committed root-level Markdown handoff that allows Claude to resume the approved mobile PWA offline-sync implementation at Task 6 without the original conversation.

**Architecture:** Use one self-contained `CLAUDE_HANDOFF.md` as the entrypoint and link to the detailed design and implementation plan for depth. Ground every status claim in Git history, the SDD progress ledger, and the current plan so completed work and remaining work cannot be confused.

**Tech Stack:** Markdown, Git, PowerShell, ripgrep

## Global Constraints

- Create only `CLAUDE_HANDOFF.md`; do not change application code or GAS code.
- Work on branch `feat/mobile-pwa-offline-sync` in `D:\TEAM\Knowlegh\App\Tunnel Boring App - Copy\wt-mobile-pwa`.
- Treat `D:\TEAM\Knowlegh\App\Tunnel Boring App - Copy\gas-live\Code.js` as the authoritative GAS backend.
- Preserve unrelated changes in the original `TunnelBoringMonitoring` checkout.
- The detailed implementation plan remains authoritative if a future mismatch is discovered.
- The final handoff must contain no unfinished or undecided sections.

---

### Task 1: Create and verify the Claude handoff

**Files:**
- Create: `CLAUDE_HANDOFF.md`
- Reference: `docs/superpowers/specs/2026-07-29-mobile-pwa-offline-sync-design.md`
- Reference: `docs/superpowers/plans/2026-07-29-mobile-pwa-offline-sync.md`
- Reference: `.superpowers/sdd/2026-07-29-mobile-pwa-offline-sync/progress.md`

**Interfaces:**
- Consumes: Git history through `930b082`, the approved product constraints, and Tasks 1–12 from the implementation plan.
- Produces: A root-level onboarding document and a copy-ready Claude continuation prompt beginning with Task 6.

- [ ] **Step 1: Confirm the target does not already exist**

Run:

```powershell
Test-Path .\CLAUDE_HANDOFF.md
```

Expected: `False`. If it is `True`, stop and inspect the existing file before replacing it.

- [ ] **Step 2: Re-read the authoritative status**

Run:

```powershell
git branch --show-current
git log --oneline -12
Get-Content .superpowers\sdd\2026-07-29-mobile-pwa-offline-sync\progress.md
Select-String -Path docs\superpowers\plans\2026-07-29-mobile-pwa-offline-sync.md -Pattern '^### Task '
```

Expected: branch `feat/mobile-pwa-offline-sync`; Tasks 1–5 complete; Task 6 is the next task; latest implementation commit `930b082`.

- [ ] **Step 3: Write the handoff**

Create `CLAUDE_HANDOFF.md` with these exact top-level sections:

```markdown
# Claude Handoff — Mobile PWA Offline Sync
## Read This First
## Product Requirements
## Repository and Branch
## Source of Truth
## Architecture Implemented
## Completed Work: Tasks 1–5
## Verification Baseline
## Remaining Work: Tasks 6–12
## Critical Safety Notes
## How to Resume
## Copy-Ready Prompt for Claude
```

Include exact absolute Windows paths, commit SHAs, the verified `60` suites / `688` tests result, known Recharts and CRA deprecation warnings, and the clean-worktree expectation. In the continuation prompt, require test-first implementation, focused and full verification, independent spec/code-quality review, review-fix loops, and progress-ledger updates.

- [ ] **Step 4: Validate completeness and links**

Run:

```powershell
$handoff = Get-Content -Raw -Encoding UTF8 .\CLAUDE_HANDOFF.md
$required = @(
  '# Claude Handoff — Mobile PWA Offline Sync',
  '## Product Requirements',
  '## Repository and Branch',
  '## Completed Work: Tasks 1–5',
  '## Remaining Work: Tasks 6–12',
  '## Copy-Ready Prompt for Claude',
  'feat/mobile-pwa-offline-sync',
  'gas-live\Code.js',
  '930b082',
  '688'
)
$missing = $required | Where-Object { -not $handoff.Contains($_) }
if ($missing) { throw "Missing required handoff content: $($missing -join ', ')" }
```

Expected: exit code `0`.

- [ ] **Step 5: Scan for unfinished content and unintended changes**

Run:

```powershell
rg -n 'UNFINISHED|DECIDE_ME|\?\?\?' CLAUDE_HANDOFF.md
git diff --check
git status --short
```

Expected: `rg` has no matches, `git diff --check` succeeds, and only `CLAUDE_HANDOFF.md` is uncommitted.

- [ ] **Step 6: Commit**

Run:

```powershell
git add CLAUDE_HANDOFF.md
git commit -m "docs: add Claude mobile PWA handoff"
git status --short
```

Expected: commit succeeds and the feature worktree is clean.
