"""Guarded repository-local milestone transition until projectctl supports milestones.

Run `python scripts/project_os_transition.py --check` first, then `--apply`.
Requires PyYAML, which is installed alongside projectctl in the project environment.
"""

from __future__ import annotations

import argparse
from datetime import date
import os
from pathlib import Path
import re
import subprocess
import tempfile

import yaml


ROOT = Path(__file__).resolve().parent.parent
STATE = ROOT / ".project-os" / "state"
CURRENT = STATE / "current.yaml"
ROADMAP = STATE / "roadmap.yaml"
BACKLOG = STATE / "backlog.yaml"
CONFIG = ROOT / ".project-os" / "transitions" / "M0-to-M1.yaml"
STATE_FILES = (CURRENT, ROADMAP, BACKLOG)


def read_yaml(path: Path) -> dict:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def one(items: list[dict], item_id: str, label: str) -> dict:
    matches = [item for item in items if item.get("id") == item_id]
    if len(matches) != 1:
        raise ValueError(f"Expected exactly one {label} {item_id}; found {len(matches)}")
    return matches[0]


def change_milestone(text: str, item_id: str, old_status: str, new_status: str, tasks: list[str] | None = None) -> str:
    markers = list(re.finditer(r"(?m)^  - id: (M\d+)\s*$", text))
    matches = [index for index, match in enumerate(markers) if match.group(1) == item_id]
    if len(matches) != 1:
        raise ValueError(f"Expected one roadmap section for {item_id}")
    index = matches[0]
    start = markers[index].start()
    end = markers[index + 1].start() if index + 1 < len(markers) else len(text)
    section = text[start:end]
    old_line = f"    status: {old_status}"
    if section.count(old_line) != 1:
        raise ValueError(f"Unexpected status line in {item_id}")
    section = section.replace(old_line, f"    status: {new_status}", 1)
    if tasks is not None:
        if section.count("    tasks: []") != 1:
            raise ValueError(f"Expected empty task list in {item_id}")
        section = section.replace("    tasks: []", f"    tasks: [{', '.join(tasks)}]", 1)
    return text[:start] + section + text[end:]


def atomic_write(path: Path, content: str) -> None:
    temporary: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", newline="\n", dir=path.parent, prefix=f".{path.name}.", delete=False) as file:
            file.write(content)
            temporary = Path(file.name)
        os.replace(temporary, path)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def doctor() -> None:
    result = subprocess.run(["projectctl", "doctor"], cwd=ROOT, text=True, encoding="utf-8", capture_output=True, check=False)
    if result.returncode != 0:
        raise RuntimeError(f"projectctl doctor failed:\n{result.stdout}{result.stderr}")


def main(apply: bool) -> None:
    transition = read_yaml(CONFIG)
    source_id = transition["from"]
    target_id = transition["to"]
    task_ids = transition["tasks"]
    if transition.get("id") != f"{source_id}-to-{target_id}" or not transition.get("approval"):
        raise ValueError("Transition id or human approval record is missing")
    if len(task_ids) != len(set(task_ids)) or not task_ids:
        raise ValueError("Transition tasks must be non-empty and unique")

    current = read_yaml(CURRENT)
    roadmap = read_yaml(ROADMAP)
    backlog = read_yaml(BACKLOG)
    source = one(roadmap["milestones"], source_id, "milestone")
    target = one(roadmap["milestones"], target_id, "milestone")
    existing_ids = {task["id"] for task in backlog["tasks"]}

    if current["current_milestone"] == target_id and source["status"] == "done" and target["status"] == "active":
        if target["tasks"] != task_ids or not set(task_ids).issubset(existing_ids):
            raise ValueError("Transition appears partially applied")
        print(f"NOOP: {source_id} -> {target_id} already applied")
        return

    if current["current_milestone"] != source_id or current["current_tasks"] or current["blocked_tasks"] or current["human_gate"]:
        raise ValueError("Current state is not idle at the expected source milestone")
    if source["status"] != "active" or target["status"] != "planned" or target["tasks"]:
        raise ValueError("Roadmap does not match the expected pre-transition state")
    if any(item["status"] == "active" for item in roadmap["milestones"] if item["id"] != source_id):
        raise ValueError("Another milestone is already active")
    if set(source["tasks"]) != {task["id"] for task in backlog["tasks"] if task["milestone"] == source_id}:
        raise ValueError("Source milestone and backlog task sets differ")

    for task_id in source["tasks"]:
        task = one(backlog["tasks"], task_id, "backlog task")
        evaluation_path = ROOT / ".project-os" / "tasks" / "results" / f"{task_id}.evaluation.yaml"
        evaluation = read_yaml(evaluation_path)
        if task["status"] != "done" or evaluation.get("decision") != "PASS" or evaluation.get("quality", {}).get("passed") is not True:
            raise ValueError(f"{task_id} lacks a passing completion evaluation")

    for evidence in transition["evidence"]:
        if not (ROOT / evidence).is_file():
            raise ValueError(f"Missing entry evidence: {evidence}")
    # JSON is YAML-compatible, so the same safe loader validates this evidence.
    asset_manifest = read_yaml(ROOT / "art/exports/m1-momo/manifest.json")
    chrome_qa = read_yaml(ROOT / "art/exports/m1-momo/chrome-qa.json")
    if [animation["id"] for animation in asset_manifest["animations"]] != ["idle", "walk", "sit", "look", "sleep", "groom"]:
        raise ValueError("The six approved Browser animation candidates are incomplete")
    if chrome_qa["errors"] or any(not row["loaded"] or row["ticks"] < 4 for row in chrome_qa["afterFullCycle"]):
        raise ValueError("Chrome asset playback evidence is not passing")
    if "approved" not in (ROOT / "art/exports/m1-momo/README.md").read_text(encoding="utf-8").lower():
        raise ValueError("Human visual concept approval is not recorded")

    new_tasks = []
    for task_id in task_ids:
        if task_id in existing_ids:
            raise ValueError(f"Duplicate task id: {task_id}")
        contract_path = Path(".project-os/tasks/ready") / f"{task_id}.yaml"
        contract = read_yaml(ROOT / contract_path)
        if contract["id"] != task_id or contract["milestone"] != target_id or contract["status"] != "ready":
            raise ValueError(f"Invalid task contract: {task_id}")
        if not set(contract["depends_on"]).issubset(existing_ids | set(task_ids)):
            raise ValueError(f"Unknown dependency in {task_id}")
        new_tasks.append({
            "id": task_id,
            "title": contract["title"],
            "role": contract["role"],
            "milestone": target_id,
            "priority": contract["priority"],
            "status": "ready",
            "depends_on": contract["depends_on"],
            "human_gate": contract["human_gate"],
            "contract": contract_path.as_posix(),
        })

    originals = {path: path.read_text(encoding="utf-8") for path in STATE_FILES}
    current["current_milestone"] = target_id
    current["updated_at"] = date.today().isoformat()
    backlog["tasks"].extend(new_tasks)
    roadmap_text = change_milestone(originals[ROADMAP], source_id, "active", "done")
    roadmap_text = change_milestone(roadmap_text, target_id, "planned", "active", task_ids)
    proposed = {
        CURRENT: yaml.safe_dump(current, allow_unicode=True, sort_keys=False),
        ROADMAP: roadmap_text,
        BACKLOG: yaml.safe_dump(backlog, allow_unicode=True, sort_keys=False),
    }
    updated_roadmap = yaml.safe_load(roadmap_text)
    if one(updated_roadmap["milestones"], source_id, "milestone")["status"] != "done" or one(updated_roadmap["milestones"], target_id, "milestone")["tasks"] != task_ids:
        raise ValueError("Generated roadmap did not parse as expected")
    doctor()
    print(f"READY: {source_id} done, {target_id} active, {len(new_tasks)} ready tasks")
    if not apply:
        return

    dirty = subprocess.run(["git", "diff", "--quiet", "--", *(str(path.relative_to(ROOT)) for path in STATE_FILES)], cwd=ROOT, check=False)
    if dirty.returncode != 0:
        raise ValueError("Canonical state files have local changes; refusing to overwrite")
    try:
        for path, content in proposed.items():
            atomic_write(path, content)
        doctor()
    except Exception:
        for path, content in originals.items():
            atomic_write(path, content)
        raise
    print(f"APPLIED: {source_id} -> {target_id}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true", help="Validate transition without changing files")
    mode.add_argument("--apply", action="store_true", help="Apply validated transition")
    args = parser.parse_args()
    main(apply=args.apply)
