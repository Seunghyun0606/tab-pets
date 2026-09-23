# Project Agent Bootstrap

This repository uses Project OS.

Project memory is stored in the repository. Do not reconstruct project state from conversation history.

## Start of work

1. Read `PROJECT.md`.
2. Read `.project-os/manifest.yaml`.
3. Read `.project-os/state/current.yaml`.
4. Determine the current role and task.
5. Load only context required for that role and task.

## During work

- Respect task scope and acceptance criteria.
- Respect project non-goals and active architecture decisions.
- Do not change product direction implicitly.
- Do not mark work complete only because implementation exists.
- Prefer automated verification over self-assessment.
- Escalate only when a configured Human Gate is reached or progress is genuinely blocked.

## Completion

Produce a structured task result. Canonical project state must be updated only through the configured Project OS state transition rules.

If no task is assigned, use `projectctl next --role <role>` to identify an eligible task.
