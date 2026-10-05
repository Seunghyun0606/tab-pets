# Repository-local milestone transition

`projectctl` 0.2 currently has task completion commands but no milestone transition command. This repository therefore uses `scripts/project_os_transition.py` for the human-approved M0 → M1 transition. Do not directly edit `state/current.yaml`, `state/roadmap.yaml`, or `state/backlog.yaml` to advance a milestone.

The transition contract is `M0-to-M1.yaml`. It names the approved source and target, required evidence, and M1 task contracts. The script checks all M0 task evaluations, the approved six-animation asset evidence, the current/roadmap/backlog preconditions, contract IDs and dependencies, and `projectctl doctor`. It writes the three canonical state files only after all checks pass, then runs `projectctl doctor` again and restores the previous contents if the final check fails. Re-running an already applied transition is a no-op.

Run from the repository root:

```text
python scripts/project_os_transition.py --check
python scripts/project_os_transition.py --apply
projectctl next --role developer
```

This procedure is scoped to the recorded M0 → M1 approval. A later milestone needs its own transition contract and evidence review; do not silently reuse this approval.
