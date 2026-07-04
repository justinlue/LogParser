# SN / VIN Search History Dropdowns — Progress Ledger

Base: 6d526d6 (branch feature/sn-vin-history-dropdown)
Plan: docs/superpowers/plans/2026-07-04-sn-vin-history-dropdown.md

Task 1: complete (commits 6d526d6..69205b6, review clean) — history storage module
  MINOR (final review): `history` object shadows window.history (no live collision; name is plan-mandated). Redundant double-cap in add()/save().
Task 2: complete (commits 69205b6..2ec1824, review clean) — record on successful fetch
Task 3: complete (commits 2ec1824..1ae96a3, review clean) — combo markup + styles
  MINOR (final review): stale `#snInput { flex: 1 }` rule now dead (input no longer direct flex child); harmless. combo-toggle keyboard reach deferred to Task 4.
Task 4: complete (commits 1ae96a3..ea2037b, review clean) — combo behavior wiring
  Fix applied: ArrowUp wrap-around off-by-one (Important) -> ea2037b, re-reviewed clean.
  MINOR (final review): redundant double-open when clicking ▼ (idempotent, harmless); inert stopPropagation in delete handler; no blur-to-non-combo dismiss (UX gap, not required).

Final whole-branch review (opus): READY TO MERGE — no Critical/Important; XSS-safe (textContent); all 6 minors confirmed non-blocking. Only gate = manual browser click-through (no code changes needed). Server smoke test passed (page+app.js serve 200, both combos + initCombos present).
