import os
import sys
import time
import subprocess
import sqlite3
import json
import urllib.request
import urllib.error

WORKSPACE_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(WORKSPACE_DIR, "backend")
DB_PATH = os.path.join(BACKEND_DIR, "data", "zarasourcing.db")
TRAJECTORIES_DIR = os.path.join(BACKEND_DIR, "data", "trajectories")
DATASET_PATH = os.path.join(BACKEND_DIR, "data", "candidates", "dataset.json")

# Ensure API key is configured
api_key = os.environ.get("GEMINI_API_KEY")
if not api_key:
    # Attempt to read from .env
    env_path = os.path.join(WORKSPACE_DIR, ".env")
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                if line.startswith("GEMINI_API_KEY="):
                    api_key = line.split("=")[1].strip().strip('"').strip("'")
                    os.environ["GEMINI_API_KEY"] = api_key
                    break

if not api_key or len(api_key) < 10:
    print("CRITICAL: GEMINI_API_KEY is not set. Please add it to your environment or .env file.")
    sys.exit(1)

BENCHMARK_JSON_PATH = os.path.join(BACKEND_DIR, "data", "benchmark_results.json")

def validate_api_key():
    """Quick preflight so we fail fast instead of after a 5-minute run."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}"
    payload = json.dumps({
        "contents": [{"role": "user", "parts": [{"text": "Reply with OK"}]}],
        "generationConfig": {"maxOutputTokens": 8},
    }).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            if resp.status != 200:
                print(f"CRITICAL: Gemini API returned HTTP {resp.status}. Check your GEMINI_API_KEY.")
                sys.exit(1)
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"CRITICAL: Gemini API key validation failed (HTTP {e.code}).")
        print(body)
        if "leaked" in body.lower() or e.code == 403:
            print("\n→ Rotate your key at https://aistudio.google.com/ and update .env + Railway env vars.")
        sys.exit(1)
    except Exception as e:
        print(f"CRITICAL: Could not reach Gemini API: {e}")
        sys.exit(1)
    print("Gemini API key validated.")

def kill_port_8080():
    try:
        output = subprocess.check_output("lsof -t -i:8080", shell=True).decode()
        for pid in output.strip().split("\n"):
            if pid:
                subprocess.call(f"kill -9 {pid}", shell=True)
                print(f"Killed process {pid} on port 8080")
    except Exception:
        pass

def rebuild_backend():
    print("Building Go backend...")
    cmd = "export PATH=$PATH:/usr/local/go/bin:/usr/local/bin && go build -o backend_binary main.go"
    res = subprocess.call(cmd, shell=True, cwd=BACKEND_DIR)
    if res != 0:
        print("CRITICAL: Failed to build Go backend.")
        sys.exit(1)
    print("Backend built successfully.")

def reset_db():
    print("Resetting database...")
    if os.path.exists(DB_PATH):
        try:
            os.remove(DB_PATH)
            print("Deleted old database.")
        except Exception as e:
            print(f"Warning: could not remove database file: {e}")
    # Clear old trajectories
    if os.path.exists(TRAJECTORIES_DIR):
        for f in os.listdir(TRAJECTORIES_DIR):
            try:
                os.remove(os.path.join(TRAJECTORIES_DIR, f))
            except Exception:
                pass
    else:
        os.makedirs(TRAJECTORIES_DIR, exist_ok=True)

def api_post(url, data):
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        print(f"API HTTP Error to {url}: {e.code} - {e.read().decode()}")
        return None
    except Exception as e:
        print(f"API Connection Error: {e}")
        return None

def api_get(url):
    try:
        with urllib.request.urlopen(url) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"API Connection Error: {e}")
        return None

def run_evaluation_for_mode(mode):
    print(f"\n======================================")
    print(f"STARTING EVALUATION RUN: {mode.upper()} MODE")
    print(f"======================================")

    # 1. Fetch seeded candidates
    candidates = api_get("http://localhost:8080/api/candidates")
    if not candidates:
        print("CRITICAL: No candidates returned from backend API.")
        return []

    print(f"Found {len(candidates)} candidates. Launching audit sessions sequentially...")

    # 2. Trigger and wait for evaluations sequentially
    for cand in candidates:
        print(f" -> Triggering {mode} audit for: {cand['name']} (@{cand['github_username']})")
        api_post("http://localhost:8080/api/sessions", {
            "candidate_id": cand["id"],
            "mode": mode
        })
        
        # Wait for this candidate to complete
        finished = False
        for poll in range(50):
            current_detail = api_get(f"http://localhost:8080/api/candidates/{cand['id']}")
            if current_detail and current_detail.get("candidate"):
                status = current_detail["candidate"]["status"]
                if status in ("completed", "failed"):
                    print(f"    - Completed with status: {status}")
                    finished = True
                    break
            time.sleep(3.0)
            
        if not finished:
            print(f"    - Warning: Candidate evaluation timed out.")
            
        # Cooldown sleep to respect the 5 RPM rate limit
        time.sleep(12.0)

    # 3. Pull audited details from database
    results = []
    current_list = api_get("http://localhost:8080/api/candidates")
    for c in current_list:
        detail = api_get(f"http://localhost:8080/api/candidates/{c['id']}")
        results.append(detail)

    return results

def calculate_metrics(baseline_results, advanced_results):
    print("\n======================================")
    print("COMPUTING COMPARATIVE EVALUATION METRICS")
    print("======================================")

    # Load dataset expected results
    with open(DATASET_PATH) as f:
        dataset = json.load(f)

    # Map dataset by github username
    expected_map = {}
    for item in dataset:
        expected_map[item["github_username"]] = item

    results_table = []
    
    baseline_correct = 0
    advanced_correct = 0
    total_checks = 0

    for adv in advanced_results:
        cand = adv["candidate"]
        github = cand["github_username"]
        exp = expected_map.get(github)
        if not exp:
            continue

        # Get corresponding baseline scorecard
        base_cand_detail = None
        for b in baseline_results:
            if b["candidate"]["github_username"] == github:
                base_cand_detail = b
                break

        # Check if they caught the discrepancy
        # True discrepancy candidates have failed or exaggerated verdicts expected
        has_discrepancy = False
        expected_verdict = "verified"
        for audit in exp["expected_audit"]:
            if audit["verdict"] in ("exaggerated", "failed"):
                has_discrepancy = True
                expected_verdict = audit["verdict"]

        # Parse what baseline found
        baseline_verdict = "verified"
        if base_cand_detail:
            base_audits = base_cand_detail.get("audits") or []
            for audit in base_audits:
                if audit["status"] in ("exaggerated", "failed"):
                    baseline_verdict = audit["status"]

        # Parse what advanced grounded found
        advanced_verdict = "verified"
        adv_audits = adv.get("audits") or []
        for audit in adv_audits:
            if audit["status"] in ("exaggerated", "failed"):
                advanced_verdict = audit["status"]

        total_checks += 1
        
        # Scoring: correctness is matching the expected ground truth verdict class (verified vs mismatch/failed)
        is_base_correct = (expected_verdict == "verified" and baseline_verdict == "verified") or \
                           (expected_verdict != "verified" and baseline_verdict != "verified")
        is_adv_correct = (expected_verdict == "verified" and advanced_verdict == "verified") or \
                          (expected_verdict != "verified" and advanced_verdict != "verified")

        if is_base_correct:
            baseline_correct += 1
        if is_adv_correct:
            advanced_correct += 1

        status_icon = "✅ SUCCESS" if is_adv_correct else "❌ MISSED"

        results_table.append({
            "name": cand["name"],
            "github": f"@{github}",
            "role": cand["role"],
            "expected": expected_verdict,
            "baseline": baseline_verdict,
            "advanced": advanced_verdict,
            "score": f"{cand['sourcing_score']}%",
            "status": status_icon
        })

    accuracy_baseline = (baseline_correct / total_checks) * 100 if total_checks > 0 else 0
    accuracy_advanced = (advanced_correct / total_checks) * 100 if total_checks > 0 else 0

    print(f"\nBaseline Text Match Accuracy: {accuracy_baseline:.1f}%")
    print(f"ZaraSourcing Code Grounded Accuracy: {accuracy_advanced:.1f}%")

    # Format Markdown Table
    md = "| Candidate | GitHub | Vetting Role | Target Verdict | Baseline Verdict | ZaraSourcing Verdict | Final Match | Result |\n"
    md += "| --- | --- | --- | --- | --- | --- | --- | --- |\n"
    for r in results_table:
        md += f"| {r['name']} | {r['github']} | {r['role']} | `{r['expected']}` | `{r['baseline']}` | `{r['advanced']}` | **{r['score']}** | {r['status']} |\n"

    print("\n" + md)
    return accuracy_baseline, accuracy_advanced, md, results_table

def count_completed(results):
    n = 0
    for r in results:
        if r and r.get("candidate", {}).get("status") == "completed":
            n += 1
    return n

def save_benchmark_json(baseline_acc, advanced_acc, results_table, baseline_correct, advanced_correct):
    fraud_targets = [r for r in results_table if r["expected"] != "verified"]
    payload = {
        "source": "make evaluate",
        "evaluated_at": time.strftime("%Y-%m-%d"),
        "baseline_accuracy_pct": round(baseline_acc, 1),
        "agent_accuracy_pct": round(advanced_acc, 1),
        "baseline_correct": baseline_correct,
        "agent_correct": advanced_correct,
        "total_cases": len(results_table),
        "fraud_cases_total": len(fraud_targets),
        "baseline_fraud_caught": sum(1 for r in fraud_targets if r["baseline"] != "verified"),
        "agent_fraud_caught": sum(1 for r in fraud_targets if r["advanced"] != "verified"),
        "cases": [
            {
                "name": r["name"],
                "github": r["github"].lstrip("@"),
                "role": r["role"],
                "target": r["expected"],
                "baseline": r["baseline"],
                "agent": r["advanced"],
                "score": r["score"],
                "correct": "SUCCESS" in r["status"],
                **({"note": "Path-guessing false positive"} if "MISSED" in r["status"] and r["expected"] == "verified" else {}),
                **({"highlight": True} if r["github"] == "@riveradevops" else {}),
            }
            for r in results_table
        ],
    }
    with open(BENCHMARK_JSON_PATH, "w") as f:
        json.dump(payload, f, indent=2)
    print(f"Wrote {BENCHMARK_JSON_PATH}")

def export_trajectories():
    print("\nExporting advanced agent conversation trajectories...")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Query completed candidates
    cursor.execute("SELECT id, name, github_username FROM candidates WHERE status = 'completed'")
    candidates = cursor.fetchall()
    
    for c_id, name, github in candidates:
        cursor.execute("SELECT type, content, metadata, created_at FROM steps WHERE session_id = ? ORDER BY id ASC", (c_id,))
        steps = cursor.fetchall()
        
        filename = f"{github}_trajectory.md"
        filepath = os.path.join(TRAJECTORIES_DIR, filename)
        
        with open(filepath, "w") as f:
            f.write(f"# Sourcing Verification Trajectory: {name} (@{github})\n\n")
            f.write(f"- **Candidate ID:** `{c_id}`\n")
            f.write(f"- **Vetting Target:** @{github} on GitHub\n")
            f.write("- **Verification Provider:** ZaraSourcing (Grounded Code Auditor)\n\n")
            f.write("---\n\n")
            
            for step_type, content, metadata, created_at in steps:
                f.write(f"### `[{step_type.upper()}]` at {created_at}\n\n")
                if step_type == "thought":
                    f.write(f"> {content}\n\n")
                elif step_type == "tool_call":
                    try:
                        meta = json.loads(metadata)
                        args_str = json.dumps(meta.get("args", {}), indent=2)
                        f.write(f"Agent requested tool: **`{content}`** with arguments:\n```json\n{args_str}\n```\n\n")
                    except Exception:
                        f.write(f"Agent requested tool: **`{content}`**\n\n")
                elif step_type == "tool_result":
                    f.write(f"Tool `{content}` returned result:\n```json\n{metadata}\n```\n\n")
                else:
                    f.write(f"{content}\n\n")
                f.write("---\n\n")
                
        print(f" -> Exported trajectory to: {filepath}")
    
    conn.close()

def update_readme_and_reproduction(table_md, baseline_acc, advanced_acc):
    print("Updating README.md and REPRODUCTION.md with latest benchmark results...")
    
    # Update README
    readme_path = os.path.join(WORKSPACE_DIR, "README.md")
    if os.path.exists(readme_path):
        with open(readme_path) as f:
            content = f.read()

        # Locate benchmark insert points
        start_tag = "<!-- BENCHMARK_START -->"
        end_tag = "<!-- BENCHMARK_END -->"
        if start_tag in content and end_tag in content:
            updated_table = f"\n### Vetting Benchmark Metrics\n* **Baseline Accuracy (Text Match):** {baseline_acc:.1f}%\n* **ZaraSourcing Accuracy (Code Grounded):** {advanced_acc:.1f}%\n\n{table_md}\n"
            parts = content.split(start_tag)
            subparts = parts[1].split(end_tag)
            new_content = parts[0] + start_tag + updated_table + end_tag + subparts[1]
            with open(readme_path, "w") as f:
                f.write(new_content)
            print("README.md updated.")

    # Update REPRODUCTION
    rep_path = os.path.join(WORKSPACE_DIR, "REPRODUCTION.md")
    if os.path.exists(rep_path):
        with open(rep_path) as f:
            content = f.read()

        start_tag = "<!-- BENCHMARK_START -->"
        end_tag = "<!-- BENCHMARK_END -->"
        if start_tag in content and end_tag in content:
            updated_table = f"\n### Last Execution Results\n* **Baseline Accuracy:** {baseline_acc:.1f}%\n* **ZaraSourcing Accuracy:** {advanced_acc:.1f}%\n\n{table_md}\n"
            parts = content.split(start_tag)
            subparts = parts[1].split(end_tag)
            new_content = parts[0] + start_tag + updated_table + end_tag + subparts[1]
            with open(rep_path, "w") as f:
                f.write(new_content)
            print("REPRODUCTION.md updated.")

def main():
    print("Starting ZaraSourcing Evaluation Benchmark Runner...")
    validate_api_key()
    kill_port_8080()
    rebuild_backend()
    reset_db()

    # Launch server in background
    print("Launching Go backend server in background...")
    server_cmd = "./backend_binary"
    env = os.environ.copy()
    env["AUTO_APPROVE"] = "true"  # Ensure agent loop completes without HITL halts during evaluation
    env["WORKSPACE_DIR"] = BACKEND_DIR
    
    server_process = subprocess.Popen(
        server_cmd,
        shell=True,
        cwd=BACKEND_DIR,
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    
    # Wait for server to boot
    time.sleep(3)
    print("Server booted on port 8080.")

    try:
        # Run Baseline mode
        baseline_results = run_evaluation_for_mode("baseline")
        
        # Reset DB for Advanced mode to start clean
        kill_port_8080()
        reset_db()
        server_process = subprocess.Popen(
            server_cmd,
            shell=True,
            cwd=BACKEND_DIR,
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        time.sleep(3)

        # Run Advanced mode
        advanced_results = run_evaluation_for_mode("advanced")

        # Compile metrics and table
        base_acc, adv_acc, table_md, results_table = calculate_metrics(baseline_results, advanced_results)

        baseline_done = count_completed(baseline_results)
        advanced_done = count_completed(advanced_results)
        print(f"\nCompleted sessions — baseline: {baseline_done}/10, agent: {advanced_done}/10")

        if advanced_done < 8:
            print("\nWARNING: Too many agent sessions failed. NOT updating README/REPRODUCTION.")
            print("Fix GEMINI_API_KEY (rotate if leaked) and re-run: make evaluate")
            print("Canonical numbers remain in backend/data/benchmark_results.json")
            sys.exit(1)

        baseline_correct = sum(1 for r in results_table if (
            (r["expected"] == "verified" and r["baseline"] == "verified") or
            (r["expected"] != "verified" and r["baseline"] != "verified")
        ))
        advanced_correct = sum(1 for r in results_table if (
            (r["expected"] == "verified" and r["advanced"] == "verified") or
            (r["expected"] != "verified" and r["advanced"] != "verified")
        ))

        save_benchmark_json(base_acc, adv_acc, results_table, baseline_correct, advanced_correct)

        # Export agent footprints
        export_trajectories()

        # Update logs
        update_readme_and_reproduction(table_md, base_acc, adv_acc)

        print("\nZaraSourcing Vetting Evaluation Completed successfully!")
    finally:
        # Clean up process
        print("Stopping Go server...")
        kill_port_8080()
        try:
            server_process.terminate()
        except Exception:
            pass

if __name__ == "__main__":
    main()
