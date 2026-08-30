'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Job { id: string; title: string; description: string; created_at: string; }
interface Candidate { id: string; name: string; email: string; role: string; github_username: string; sourcing_score: number; status: string; job_id: string; resume_s3_url?: string; recording_s3_url?: string; }
interface InterviewSession { id: string; candidate_id: string; token: string; status: string; interview_score: number; fit_summary: string; created_at: string; }
interface Analytics { total_applicants: number; pending_review: number; audits_completed: number; interviews_completed: number; avg_audit_score: number; avg_interview_score: number; }

export default function CompanyDashboard() {
	const router = useRouter();
	const [company, setCompany] = useState<{ id: string; name: string; email: string } | null>(null);
	const [jobs, setJobs] = useState<Job[]>([]);
	const [selectedJob, setSelectedJob] = useState<Job | null>(null);
	const [candidates, setCandidates] = useState<Candidate[]>([]);
	const [sessions, setSessions] = useState<InterviewSession[]>([]);
	const [questions, setQuestions] = useState<string[]>(['', '', '']);
	const [showNewJob, setShowNewJob] = useState(false);
	const [showQuestions, setShowQuestions] = useState(false);
	const [newTitle, setNewTitle] = useState('');
	const [newDesc, setNewDesc] = useState('');
	const [saving, setSaving] = useState(false);
	const [copied, setCopied] = useState(false);
	const [allCandidates, setAllCandidates] = useState<Candidate[]>([]);
	const [analytics, setAnalytics] = useState<Analytics | null>(null);
	const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

	useEffect(() => {
		try {
			const stored = localStorage.getItem('company');
			if (!stored) { router.push('/company/login'); return; }
			const c = JSON.parse(stored);
			setCompany(c);
		} catch { router.push('/company/login'); }
	}, [router]);

	useEffect(() => {
		if (!company) return;
		const refresh = () => {
			fetchJobs();
			fetchAllCandidates();
			fetchAnalytics();
		};
		refresh();
		const interval = setInterval(refresh, 12000);
		return () => clearInterval(interval);
	}, [company]);

	const fetchAnalytics = async () => {
		if (!company) return;
		try {
			const res = await fetch(`${apiBase}/api/companies/analytics?company_id=${company.id}`);
			if (res.ok) setAnalytics(await res.json());
		} catch { /* ignore */ }
	};

	useEffect(() => {
		if (!selectedJob) return;
		fetchCandidates();
		fetchSessions();
		fetchQuestions();
	}, [selectedJob]);

	const fetchJobs = async () => {
		if (!company) return;
		const res = await fetch(`${apiBase}/api/jobs?company_id=${company.id}`);
		const data = await res.json();
		const list = data || [];
		setJobs(list);
		if (list.length > 0 && !selectedJob) {
			const devops = list.find((j: Job) => j.id === 'devops_job') || list[0];
			setSelectedJob(devops);
		}
	};

	const fetchAllCandidates = async () => {
		if (!company) return;
		try {
			const res = await fetch(`${apiBase}/api/candidates?company_id=${company.id}`);
			if (res.ok) setAllCandidates(await res.json() || []);
		} catch { }
	};

	const fetchCandidates = async () => {
		if (!company || !selectedJob) return;
		const res = await fetch(`${apiBase}/api/candidates?company_id=${company.id}&job_id=${selectedJob.id}`);
		const data = await res.json();
		setCandidates(data || []);
	};

	const fetchSessions = async () => {
		if (!selectedJob) return;
		try {
			const res = await fetch(`${apiBase}/api/interview/sessions?job_id=${selectedJob.id}`);
			if (res.ok) setSessions(await res.json() || []);
		} catch { setSessions([]); }
	};

	const fetchQuestions = async () => {
		if (!selectedJob) return;
		const res = await fetch(`${apiBase}/api/interview/questions?job_id=${selectedJob.id}`);
		if (res.ok) {
			const data = await res.json();
			if (data && data.length > 0) setQuestions(data.map((q: { question: string }) => q.question));
			else setQuestions(['', '', '']);
		}
	};

	const createJob = async () => {
		if (!newTitle || !newDesc || !company) return;
		setSaving(true);
		const res = await fetch(`${apiBase}/api/jobs`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ title: newTitle, description: newDesc, company_id: company.id }),
		});
		if (res.ok) {
			setNewTitle(''); setNewDesc(''); setShowNewJob(false);
			await fetchJobs();
		}
		setSaving(false);
	};

	const saveQuestions = async () => {
		if (!selectedJob) return;
		setSaving(true);
		await fetch(`${apiBase}/api/interview/questions`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ job_id: selectedJob.id, questions: questions.filter(q => q.trim()) }),
		});
		setSaving(false);
		setShowQuestions(false);
	};

	const copyApplyLink = () => {
		if (!selectedJob) return;
		const link = `${window.location.origin}/apply/${selectedJob.id}`;
		navigator.clipboard.writeText(link);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	const getScoreColor = (score: number) => score >= 75 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';

	const fileUrl = (path?: string, candidateId?: string) => {
		if (!path || !company) return '';
		if (path.startsWith('http')) return path;
		if (path.includes('interview') || path.includes('recordumes')) {
			return `${apiBase}/api/recordings/${candidateId}?company_id=${company.id}`;
		}
		return `${apiBase}${path.startsWith('/') ? '' : '/'}${path}`;
	};

	const completedSessions = sessions.filter(s => s.status === 'completed').sort((a, b) => b.interview_score - a.interview_score);

	if (!company) return null;

	return (
		<div className="app-container" style={{ paddingBottom: '4rem' }}>
			{/* Header */}
			<header className="header">
				<div className="header-title-wrapper">
					<Link href="/" style={{ textDecoration: 'none' }}>
						<div className="logo-icon" style={{ background: 'linear-gradient(135deg, var(--color-accent) 0%, #a855f7 100%)' }}>ZS</div>
					</Link>
					<div>
						<h1 style={{ fontSize: '1.5rem' }}>{company.name}</h1>
						<p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Hiring Dashboard</p>
					</div>
				</div>
				<div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
					<Link href="/benchmark" className="btn btn-secondary" style={{ fontSize: '0.75rem' }}>Benchmark</Link>
					<button className="btn btn-secondary" style={{ fontSize: '0.8rem' }} onClick={() => { localStorage.removeItem('company'); router.push('/company/login'); }}>
						Sign Out
					</button>
				</div>
			</header>

			{analytics && (
				<div className="stats-grid" style={{ marginBottom: '1rem' }}>
					<div className="stat-card">
						<span className="stat-label">Total applicants</span>
						<span className="stat-value" style={{ color: 'var(--color-accent)' }}>{analytics.total_applicants}</span>
						<span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Auto-refreshes every 12s</span>
					</div>
					<div className="stat-card">
						<span className="stat-label">Interviews done</span>
						<span className="stat-value passed">{analytics.interviews_completed}</span>
						<span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Avg score: {analytics.avg_interview_score}%</span>
					</div>
					<div className="stat-card">
						<span className="stat-label">Audits completed</span>
						<span className="stat-value passed">{analytics.audits_completed}</span>
						<span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Avg score: {analytics.avg_audit_score}%</span>
					</div>
					<div className="stat-card">
						<span className="stat-label">Pending review</span>
						<span className="stat-value" style={{ color: '#f59e0b' }}>{analytics.pending_review}</span>
						<span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>New applies awaiting audit</span>
					</div>
				</div>
			)}

			{analytics && (
				<div className="panel" style={{ padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
					<p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.75rem' }}>Hiring pipeline</p>
					<div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
						{[
							{ label: 'Applied', count: analytics.total_applicants, color: 'var(--color-accent)' },
							{ label: 'Interviewed', count: analytics.interviews_completed, color: '#a855f7' },
							{ label: 'Audited', count: analytics.audits_completed, color: '#10b981' },
							{ label: 'Pending', count: analytics.pending_review, color: '#f59e0b' },
						].map((stage, i, arr) => (
							<div key={stage.label} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
								<div style={{ textAlign: 'center', padding: '0.5rem 0.85rem', background: 'rgba(255,255,255,0.03)', borderRadius: '0.5rem', border: '1px solid var(--border-color)', minWidth: '90px' }}>
									<p style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '1.25rem', color: stage.color, margin: 0 }}>{stage.count}</p>
									<p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '0.15rem 0 0' }}>{stage.label}</p>
								</div>
								{i < arr.length - 1 && <span style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>→</span>}
							</div>
						))}
					</div>
				</div>
			)}

			<div className="dashboard-grid">
				{/* Sidebar — Jobs */}
				<aside style={{ minWidth: 0 }}>
					<div className="panel" style={{ padding: '1rem' }}>
						<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
							<span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>Your Jobs</span>
							<button className="btn btn-primary" style={{ fontSize: '0.75rem', padding: '0.3rem 0.65rem' }} onClick={() => setShowNewJob(!showNewJob)}>
								{showNewJob ? 'Cancel' : '+ New'}
							</button>
						</div>

						{showNewJob && (
							<div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem', padding: '0.75rem', background: 'rgba(99,102,241,0.05)', borderRadius: '0.5rem', border: '1px solid var(--border-color)' }}>
								<input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Job title" style={{ padding: '0.5rem 0.75rem', background: '#09070a', border: '1px solid var(--border-color)', borderRadius: '0.35rem', color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }} />
								<textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Job description & requirements..." rows={3} style={{ padding: '0.5rem 0.75rem', background: '#09070a', border: '1px solid var(--border-color)', borderRadius: '0.35rem', color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none', resize: 'none', fontFamily: 'inherit' }} />
								<button className="btn btn-primary" style={{ fontSize: '0.8rem' }} onClick={createJob} disabled={saving}>{saving ? 'Creating...' : 'Create Job'}</button>
							</div>
						)}

						<div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
							{jobs.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '1rem 0' }}>No jobs yet. Create one above.</p>}
							{jobs.map(j => {
								const count = allCandidates.filter(c => c.job_id === j.id).length;
								return (
									<button key={j.id} onClick={() => setSelectedJob(j)} style={{ textAlign: 'left', padding: '0.75rem', borderRadius: '0.5rem', border: `1px solid ${selectedJob?.id === j.id ? 'var(--color-accent)' : 'var(--border-color)'}`, background: selectedJob?.id === j.id ? 'rgba(6,182,212,0.08)' : 'rgba(255,255,255,0.02)', cursor: 'pointer', transition: 'all 0.2s' }}>
										<p style={{ fontWeight: 600, fontSize: '0.85rem', color: selectedJob?.id === j.id ? 'var(--color-accent)' : 'var(--text-primary)', margin: 0 }}>{j.title}</p>
										<p style={{ fontSize: '0.75rem', color: count > 0 ? 'var(--color-accent)' : 'var(--text-muted)', fontWeight: count > 0 ? 700 : 400, margin: '0.2rem 0 0 0' }}>{count} applicant{count !== 1 ? 's' : ''}</p>
									</button>
								);
							})}
						</div>
					</div>
				</aside>

				{/* Main content */}
				<main style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', minWidth: 0 }}>
					{!selectedJob ? (
						<div className="panel" style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
							<p style={{ fontSize: '1.1rem' }}>Create a job to get started</p>
						</div>
					) : (
						<>
							{/* Job header */}
							<div className="panel" style={{ padding: '1.5rem' }}>
								<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
									<div>
										<h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>{selectedJob.title}</h2>
										<p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.35rem', maxWidth: '600px' }}>{selectedJob.description}</p>
									</div>
									<div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', flexShrink: 0 }}>
										<button className="btn btn-secondary" style={{ fontSize: '0.8rem' }} onClick={() => setShowQuestions(!showQuestions)}>
											{showQuestions ? 'Close' : '⚙ Interview Questions'}
										</button>
										<button className="btn btn-primary" style={{ fontSize: '0.8rem' }} onClick={copyApplyLink}>
											{copied ? '✓ Copied!' : '🔗 Copy Apply Link'}
										</button>
									</div>
								</div>

								{/* Apply link display */}
								<div style={{ marginTop: '1rem', padding: '0.65rem 1rem', background: 'rgba(6,182,212,0.05)', border: '1px solid rgba(6,182,212,0.2)', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
									<span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
										{typeof window !== 'undefined' ? `${window.location.origin}/apply/${selectedJob.id}` : `/apply/${selectedJob.id}`}
									</span>
									<span style={{ fontSize: '0.75rem', color: 'var(--color-accent)', fontWeight: 600, flexShrink: 0 }}>Share with candidates</span>
								</div>

								{/* Interview questions editor */}
								{showQuestions && (
									<div style={{ marginTop: '1.25rem', padding: '1.25rem', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: '0.5rem' }}>
										<p style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '0.75rem' }}>AI Interview Questions for this role</p>
										<p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>The AI will ask these questions verbally. Candidates respond by speaking — their answers are transcribed and scored automatically.</p>
										{questions.map((q, i) => (
											<div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
												<span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', width: '20px', flexShrink: 0 }}>Q{i + 1}</span>
												<input value={q} onChange={e => { const next = [...questions]; next[i] = e.target.value; setQuestions(next); }}
													placeholder={`Question ${i + 1}...`}
													style={{ flex: 1, padding: '0.6rem 0.75rem', background: '#09070a', border: '1px solid var(--border-color)', borderRadius: '0.35rem', color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }} />
											</div>
										))}
										<div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
											<button className="btn btn-secondary" style={{ fontSize: '0.8rem' }} onClick={() => setQuestions([...questions, ''])}>+ Add Question</button>
											<button className="btn btn-primary" style={{ fontSize: '0.8rem' }} onClick={saveQuestions} disabled={saving}>{saving ? 'Saving...' : 'Save Questions'}</button>
										</div>
									</div>
								)}
							</div>

							{/* AI Interview Leaderboard */}
							{completedSessions.length > 0 && (
								<div className="panel" style={{ padding: '1.5rem' }}>
									<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
										<div>
											<h3 style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-primary)', margin: 0 }}>AI Interview Rankings</h3>
											<p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{completedSessions.length} candidates interviewed — ranked by AI fit score</p>
										</div>
									</div>
									{completedSessions.map((s, idx) => {
										const cand = candidates.find(c => c.id === s.candidate_id);
										return (
											<div key={s.id} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', padding: '1rem', background: idx === 0 ? 'rgba(16,185,129,0.05)' : 'rgba(255,255,255,0.02)', border: `1px solid ${idx === 0 ? 'rgba(16,185,129,0.2)' : 'var(--border-color)'}`, borderRadius: '0.5rem', marginBottom: '0.75rem' }}>
												<div style={{ width: '36px', height: '36px', borderRadius: '50%', background: idx === 0 ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.9rem', color: idx === 0 ? '#10b981' : 'var(--text-muted)', flexShrink: 0 }}>
													#{idx + 1}
												</div>
												<div style={{ flex: 1, minWidth: 0 }}>
													<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
														<p style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', margin: 0 }}>{cand?.name || 'Candidate'}</p>
														<div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
															<span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '1.1rem', color: getScoreColor(s.interview_score) }}>{s.interview_score}%</span>
															<span style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: '0.25rem', background: s.interview_score >= 75 ? 'rgba(16,185,129,0.15)' : s.interview_score >= 50 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)', color: getScoreColor(s.interview_score), fontWeight: 700 }}>
																{s.interview_score >= 75 ? 'STRONG FIT' : s.interview_score >= 50 ? 'POSSIBLE FIT' : 'NOT A FIT'}
															</span>
															{cand && (
																<Link href={`/candidate/${cand.id}`} className="btn btn-secondary" style={{ fontSize: '0.7rem', padding: '0.2rem 0.6rem' }}>🔍 Quick Audit</Link>
															)}
														</div>
													</div>
													<p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.35rem 0 0 0', lineHeight: '1.5' }}>{s.fit_summary}</p>
												</div>
											</div>
										);
									})}
								</div>
							)}

							{/* Applicants table */}
							<div className="panel" style={{ padding: '1.5rem' }}>
								<h3 style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '1rem' }}>
									All Applicants <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.85rem' }}>({candidates.length})</span>
								</h3>
								{candidates.length === 0 ? (
									<p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '2rem 0' }}>
										No applicants yet. Share the apply link above to start receiving applications.
									</p>
								) : (
									<div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
										{candidates.map(c => {
											const session = sessions.find(s => s.candidate_id === c.id);
											const isDemoHighlight = c.github_username === 'riveradevops';
											return (
												<div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.85rem 1rem', background: isDemoHighlight ? 'rgba(16,185,129,0.05)' : 'rgba(255,255,255,0.02)', border: `1px solid ${isDemoHighlight ? 'rgba(16,185,129,0.35)' : 'var(--border-color)'}`, borderRadius: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
													<div>
														<p style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)', margin: 0 }}>
															{c.name}
															{isDemoHighlight && <span style={{ marginLeft: '0.5rem', fontSize: '0.65rem', padding: '0.15rem 0.4rem', borderRadius: '0.25rem', background: 'rgba(16,185,129,0.2)', color: '#10b981', fontWeight: 700 }}>DEMO WOW</span>}
														</p>
														<p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.15rem 0 0 0' }}>{c.email} · @{c.github_username}</p>
														<div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
															{c.resume_s3_url && (
																<a href={fileUrl(c.resume_s3_url)} target="_blank" rel="noreferrer" style={{ fontSize: '0.7rem', color: 'var(--color-accent)', textDecoration: 'none' }}>Resume ↗</a>
															)}
															{c.recording_s3_url && (
																<a href={fileUrl(c.recording_s3_url, c.id)} target="_blank" rel="noreferrer" style={{ fontSize: '0.7rem', color: 'var(--color-accent)', textDecoration: 'none' }}>Interview video ↗</a>
															)}
															<Link href={`/candidate/${c.id}`} style={{ fontSize: '0.7rem', color: isDemoHighlight ? '#10b981' : 'var(--text-muted)', textDecoration: 'none', fontWeight: isDemoHighlight ? 700 : 400 }}>{isDemoHighlight ? 'Run GitHub audit →' : 'Audit workspace →'}</Link>
														</div>
													</div>
													<div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
														{session?.status === 'completed' ? (
															<span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: getScoreColor(session.interview_score), fontSize: '0.9rem' }}>{session.interview_score}%</span>
														) : (
															<span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{session ? 'In Progress' : 'Not Interviewed'}</span>
														)}
														<span style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: '0.25rem', background: c.status === 'completed' ? 'rgba(16,185,129,0.1)' : 'rgba(99,102,241,0.1)', color: c.status === 'completed' ? '#10b981' : 'var(--color-accent)', fontWeight: 600 }}>
															{c.status.toUpperCase()}
														</span>
													</div>
												</div>
											);
										})}
									</div>
								)}
							</div>
						</>
					)}
				</main>
			</div>
		</div>
	);
}
