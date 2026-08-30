# Baseline trajectory — Alex Rivera (@riveradevops)

**Agent:** text-only Gemini (no tools)  
**Case:** `backend/data/candidates/dataset.json` → Alex Rivera  
**Target:** `exaggerated`  
**Baseline verdict:** `verified` (miss)

This is the simple baseline from the brief: one direct prompt, basic instructions.

---

### `[SYSTEM]`

You are screening a candidate. You receive a job description and a resume. You do not have GitHub tools. If claims sound consistent with the role, mark them verified.

---

### `[USER]`

**Role:** DevOps & SRE Engineer  
**JD:** Multi-stage Dockerfiles. Kubernetes manifests. Terraform.

**Resume:** DevOps Engineer with 5 years experience specializing in cloud infrastructure automation. Expert in writing multi-stage Docker builds, Kubernetes Helm charts, and automated Terraform workspaces for SRE pipelines.

---

### `[THOUGHT]`

Resume names Docker, Helm, Terraform, and SRE pipelines. Language matches the JD. No contradictory text in the packet. Default to verified.

---

### `[RESULT]`

| Claim | Verdict | Evidence |
|---|---|---|
| Multi-stage Docker builds and Helm charts | `verified` | Wording aligns with the job description |

**Composite:** would pass a keyword ATS.  
**Why this fails the user:** the real repo (`terraform-templates`) is an empty README. The baseline never opened it.

Compare the agent on the same case: [riveradevops_trajectory.md](./riveradevops_trajectory.md).
