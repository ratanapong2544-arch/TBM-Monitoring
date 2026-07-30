# Claude Handoff Document Design

**Date:** 2026-07-30  
**Target:** `CLAUDE_HANDOFF.md` at the repository root  
**Audience:** Claude or another developer continuing the mobile PWA offline-sync implementation

## Purpose

Create one self-contained Markdown handoff that lets a new coding agent resume the approved mobile PWA work without relying on this conversation. The document must distinguish verified completed work from pending work and point to the authoritative design, implementation plan, code, and backend.

## Required content

The handoff will contain:

1. The product objective and agreed constraints: Android and iPhone, internal installation by link without public stores, all pages, Vercel hosting, approximately ten users, no login yet, offline access to the latest downloaded data, offline writes with later sync, and explicit conflict handling.
2. The exact repository, active worktree, branch, merge base, and authoritative GAS backend path.
3. A completed-work ledger for Tasks 1–5 with commit SHAs, review verdicts, and the latest verified test count.
4. A pending-work roadmap for Tasks 6–12, preserving the implementation order and pointing to the detailed plan rather than duplicating every code block.
5. Architecture and interface notes needed to continue safely, including PWA assets, service worker, IndexedDB schema, repository read contract, durable mutation queue, leases, FIFO ordering, typed failures, and conflict resolution.
6. Verification commands, known baseline warnings, and repository hygiene rules.
7. Explicit warnings not to edit the stale `TunnelBoringMonitoring/gas/` copy and not to overwrite unrelated user changes in the original checkout.
8. A ready-to-copy Claude continuation prompt beginning with Task 6 and requiring TDD, focused/full verification, independent review, and ledger updates.

## Source of truth

The handoff will be grounded in:

- `docs/superpowers/specs/2026-07-29-mobile-pwa-offline-sync-design.md`
- `docs/superpowers/plans/2026-07-29-mobile-pwa-offline-sync.md`
- `.superpowers/sdd/2026-07-29-mobile-pwa-offline-sync/progress.md`
- Git history through commit `930b082`
- The current clean feature worktree

The implementation plan remains authoritative when the handoff and plan differ.

## File and commit policy

Only the handoff document will be added after this design is approved. It will be committed on `feat/mobile-pwa-offline-sync`; no application or GAS code will be changed. The final document will contain no unfinished markers or undecided sections.

## Acceptance criteria

- A new Claude session can identify the correct worktree and branch immediately.
- It can verify Tasks 1–5 and start Task 6 without reading the original chat.
- Completed and pending work are unambiguous.
- Commands use Windows/PowerShell-compatible paths and syntax.
- Risks involving `gas-live`, generated build artifacts, and unrelated user files are explicit.
