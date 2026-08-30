# Agent trajectories

Two agents, same 10 cases.

| File | Agent | Why judges should open it |
|---|---|---|
| [baseline_trajectory.md](./baseline_trajectory.md) | Text-only baseline | One prompt, no tools — Alex Rivera is `verified` because the resume reads well |
| [riveradevops_trajectory.md](./riveradevops_trajectory.md) | Tool-calling agent | Same Alex case: lists repos, reads files, marks `exaggerated` |
| [emilycodes_trajectory.md](./emilycodes_trajectory.md) | Tool-calling agent (Iter 1 failure) | Path guessing — `file not found` treated as fraud |

The other `*_trajectory.md` files are exports from the demo database. Prefer the three above for scoring.

Re-export after a live run: `make evaluate` writes from the `steps` table.
