# Agent trajectory — Alex Rivera (@riveradevops)

**Agent:** ZaraSourcing tool loop (`backend/pkg/agent/agent.go`)  
**Case:** `dataset.json` → Alex Rivera  
**Target:** `exaggerated`  
**Agent verdict:** `exaggerated` (correct)  
**Score used on the demo desk:** 45%

Representative trace from the agent instructions and the files in the case. This is the realistic execution to show in the video.

---

### `[SYSTEM]`

Audit each resume claim against code. For every repo: `list_repo_files` before `get_repo_file`. Do not mark exaggerated until source files have been read. Save claims with `save_claim_audit`, then `complete_audit`. A recruiter makes the hire.

---

### `[USER]`

Candidate: Alex Rivera · `@riveradevops`  
Resume claims Docker, Helm, Terraform SRE workspaces.  
JD requires Dockerfiles, Kubernetes manifests, Terraform.

---

### `[TOOL_CALL]`

`list_github_repos` `{"username":"riveradevops"}`

### `[TOOL_RESULT]`

```json
[{ "name": "terraform-templates", "stars": 1, "languages": [] }]
```

---

### `[TOOL_CALL]`

`list_repo_files` `{"username":"riveradevops","repo":"terraform-templates"}`

### `[TOOL_RESULT]`

```json
["README.md"]
```

---

### `[TOOL_CALL]`

`get_repo_file` `{"username":"riveradevops","repo":"terraform-templates","filepath":"README.md"}`

### `[TOOL_RESULT]`

```
# Terraform Templates
Custom workspaces for SRE. TODO: add tf files.
```

---

### `[THOUGHT]`

Only file is a README with a TODO. No Dockerfile, no Helm chart, no `.tf`. The claim “expert in multi-stage Docker builds and Helm charts” is not in this account. Absence is the evidence.

---

### `[TOOL_CALL]`

`get_proctoring_logs` `{"candidate_id":"…"}`

### `[TOOL_RESULT]`

Look-away 22s while discussing Helm manifests (seeded integrity event). Logged for the recruiter; not used as proof the code exists.

---

### `[TOOL_CALL]`

`save_claim_audit`

```json
{
  "claim_text": "Expert in writing multi-stage Docker builds and Helm charts",
  "status": "exaggerated",
  "file_path": "terraform-templates/README.md",
  "evidence_text": "No Dockerfiles or Helm templates in the account. Only README.md: 'TODO: add tf files.'"
}
```

---

### `[TOOL_CALL]`

`complete_audit` → composite **45%**, status `exaggerated`

---

### `[HUMAN]`

Recruiter opens `/candidate/{id}` or `/report/riveradevops`, reads the citation, decides. The agent does not hire.

Baseline on this case said `verified`. See [baseline_trajectory.md](./baseline_trajectory.md).
