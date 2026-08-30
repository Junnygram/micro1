'use client';
import { getApiBase } from '@/lib/api';
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
	const [shortlist, setShortlist] = useState<string[]>([]);
	const [showCriteria, setShowCriteria] = useState(false);
	const [showRecruiterChat, setShowRecruiterChat] = useState(false);
	const [chatQuestion, setChatQuestion] = useState('');
	const [chatAnswer, setChatAnswer] = useState('');
	const [chatLoading, setChatLoading] = useState(false);
	const [compareA, setCompareA] = useState('');
	const [compareB, setCompareB] = useState('');
	const [compareResult, setCompareResult] = useState<Record<string, unknown> | null>(null);
	const [compareLoading, setCompareLoading] = useState(false);
	const [criteria, setCriteria] = useState({ weight_open_source: 33, weight_code_quality: 34, weight_experience: 33, llm_model: 'bedrock' });
	const apiBase = getApiBase();

	useEffect(() => {
		try {
			const stored = localStorage.getItem('zarasourcing_shortlist');
			if (stored) setShortlist(JSON.parse(stored));
		} catch { /* ignore */ }
	}, []);

	const toggleShortlist = (id: string) => {
		setShortlist(prev => {
			const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
			localStorage.setItem('zarasourcing_shortlist', JSON.stringify(next));
			return next;
		});
	};

	const compositeScore = (c: Candidate, session?: InterviewSession) => {
		const audit = c.sourcing_score || 0;
		const interview = session?.status === 'completed' ? session.interview_score : 0;
		if (audit > 0 && interview > 0) return Math.round(audit * 0.55 + interview * 0.45);
		return audit || interview;
	};

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
		fetch(`${apiBase}/api/criteria?company_id=${company.id}`)
			.then(r => (r.ok ? r.json() : null))
			.then(c => { if (c) setCriteria(c); })
			.catch(() => {});
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

	const saveCriteria = async () => {
		if (!company) return;
		setSaving(true);
		await fetch(`${apiBase}/api/criteria`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ...criteria, company_id: company.id }),
		});
		setSaving(false);
		setShowCriteria(false);
	};

	const copyApplyLink = () => {
		if (!selectedJob) return;
		const link = `${window.location.origin}/apply/${selectedJob.id}`;
		navigator.clipboard.writeText(link);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	const askRecruiter = async (question?: string) => {
		if (!company) return;
		const q = (question || chatQuestion).trim();
		if (!q) return;
		setChatLoading(true);
		setChatAnswer('');
		try {
			const res = await fetch(`${apiBase}/api/recruiter/chat`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ company_id: company.id, job_id: selectedJob?.id, question: q }),
			});
			if (!res.ok) throw new Error('Chat failed');
			const data = await res.json();
			setChatAnswer(data.answer || 'No answer returned.');
			if (!question) setChatQuestion(q);
		} catch {
			setChatAnswer('Could not reach AI copilot. Check backend keys or try again.');
		} finally {
			setChatLoading(false);
		}
	};

	const runCompare = async () => {
		if (!company || !compareA || !compareB || compareA === compareB) return;
		setCompareLoading(true);
		setCompareResult(null);
		try {
			const res = await fetch(`${apiBase}/api/recruiter/compare`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ company_id: company.id, candidate_id_a: compareA, candidate_id_b: compareB }),
			});
			if (!res.ok) throw new Error('Compare failed');
			const data = await res.json();
			setCompareResult(data.comparison || null);
		} catch {
			setCompareResult({ summary: 'Comparison unavailable — check backend AI configuration.' });
		} finally {
			setCompareLoading(false);
		}
	};

	const fraudRiskColor = (risk?: string) => risk === 'high' ? '#ef4444' : risk === 'medium' ? '#f59e0b' : '#10b981';

	const getScoreColor = (score: number) => score >= 75 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';

	const fileUrl = (path?: string, candidateId?: string) => {
		if (!path || !company) return '';
		if (path.startsWith('http')) return path;
		if (path.startsWith('s3://')) {
			const filename = path.split('/').pop();
			return filename ? `${apiBase}/resumes/${filename}` : '';
		}
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
					<Link href="/demo" className="btn btn-secondary" style={{ fontSize: '0.75rem' }}>Demo guide</Link>
					<Link href="/benchmark" className="btn btn-secondary" style={{ fontSize: '0.75rem' }}>Benchmark</Link>
					<button className="btn btn-secondary" style={{ fontSize: '0.75rem' }} onClick={() => setShowRecruiterChat(!showRecruiterChat)}>
						{showRecruiterChat ? 'Close AI' : '🤖 Recruiter AI'}
					</button>
					<button className="btn btn-secondary" style={{ fontSize: '0.8rem' }} onClick={() => { localStorage.removeItem('company'); router.push('/company/login'); }}>
						Sign Out
					</button>
				</div>
			</header>

			{showRecruiterChat && (
				<div className="panel" style={{ padding: '1.25rem', marginBottom: '1rem', border: '1px solid rgba(168,85,247,0.3)' }}>
					<p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#e9d5ff', textTransform: 'uppercase', marginBottom: '0.75rem' }}>Recruiter AI Copilot</p>
					<div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
						{[
							'Why is Alex ranked below Emily?',
							'Who has the highest fraud risk?',
							'Summarize top 3 candidates for this role',
						].map(q => (
							<button key={q} type="button" className="btn btn-secondary" style={{ fontSize: '0.7rem', padding: '0.35rem 0.6rem' }}
								onClick={() => askRecruiter(q)} disabled={chatLoading}>
								{q}
							</button>
						))}
					</div>
					<div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
						<input value={chatQuestion} onChange={e => setChatQuestion(e.target.value)} placeholder="Ask about your applicants…"
							onKeyDown={e => { if (e.key === 'Enter') askRecruiter(); }}
							style={{ flex: 1, padding: '0.65rem 0.85rem', background: '#09070a', border: '1px solid var(--border-color)', borderRadius: '0.5rem', color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }} />
						<button className="btn btn-primary" style={{ fontSize: '0.8rem' }} onClick={() => askRecruiter()} disabled={chatLoading}>
							{chatLoading ? '…' : 'Ask'}
						</button>
					</div>
					{chatAnswer && (
						<div style={{ padding: '0.85rem', background: 'rgba(168,85,247,0.08)', borderRadius: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
							{chatAnswer}
						</div>
					)}

					<div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
						<p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.65rem' }}>Compare candidates</p>
						<div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.75rem' }}>
							<select value={compareA} onChange={e => setCompareA(e.target.value)} style={{ flex: 1, minWidth: '140px', padding: '0.5rem', background: '#09070a', border: '1px solid var(--border-color)', borderRadius: '0.35rem', color: 'var(--text-primary)', fontSize: '0.8rem' }}>
								<option value="">Candidate A…</option>
								{candidates.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
							</select>
							<span style={{ color: 'var(--text-muted)' }}>vs</span>
							<select value={compareB} onChange={e => setCompareB(e.target.value)} style={{ flex: 1, minWidth: '140px', padding: '0.5rem', background: '#09070a', border: '1px solid var(--border-color)', borderRadius: '0.35rem', color: 'var(--text-primary)', fontSize: '0.8rem' }}>
								<option value="">Candidate B…</option>
								{candidates.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
							</select>
							<button className="btn btn-primary" style={{ fontSize: '0.8rem' }} onClick={runCompare} disabled={compareLoading || !compareA || !compareB || compareA === compareB}>
								{compareLoading ? '…' : 'Compare'}
							</button>
						</div>
						{compareResult && (
							<div style={{ padding: '0.85rem', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: '0.5rem', fontSize: '0.85rem' }}>
								{typeof compareResult.recommendation === 'string' && (
									<p style={{ fontWeight: 700, color: '#10b981', marginBottom: '0.65rem' }}>{compareResult.recommendation}</p>
								)}
								{typeof compareResult.summary === 'string' && (
									<p style={{ color: 'var(--text-secondary)', marginBottom: '0.75rem', lineHeight: 1.5 }}>{compareResult.summary}</p>
								)}
								<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
									{(['candidate_a', 'candidate_b'] as const).map(key => {
										const card = compareResult[key] as { name?: string; strengths?: string; risks?: string; fraud_risk?: string } | undefined;
										if (!card?.name) return null;
										return (
											<div key={key} style={{ padding: '0.65rem', background: 'rgba(0,0,0,0.25)', borderRadius: '0.35rem' }}>
												<p style={{ fontWeight: 700, marginBottom: '0.35rem' }}>{card.name}</p>
												<p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.15rem 0' }}><strong>Strengths:</strong> {card.strengths}</p>
												<p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.15rem 0' }}><strong>Risks:</strong> {card.risks}</p>
												<p style={{ fontSize: '0.75rem', color: fraudRiskColor(card.fraud_risk), margin: '0.15rem 0 0', fontWeight: 700 }}>Fraud risk: {card.fraud_risk || '—'}</p>
											</div>
										);
									})}
								</div>
							</div>
						)}
					</div>
				</div>
			)}

			{shortlist.length > 0 && (
				<div className="panel" style={{ padding: '1rem 1.25rem', marginBottom: '1rem', border: '1px solid rgba(16,185,129,0.3)' }}>
					<p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#10b981', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
						Shortlist ({shortlist.length})
					</p>
					<div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
						{shortlist.map(id => {
							const c = allCandidates.find(x => x.id === id);
							if (!c) return null;
							return (
								<Link key={id} href={`/candidate/${id}`} style={{ fontSize: '0.8rem', padding: '0.35rem 0.65rem', background: 'rgba(16,185,129,0.1)', borderRadius: '0.35rem', color: '#10b981', textDecoration: 'none', fontWeight: 600 }}>
									{c.name} ({c.sourcing_score}%)
								</Link>
							);
						})}
					</div>
				</div>
			)}

			{showCriteria && (
				<div className="panel" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
					<p style={{ fontWeight: 700, marginBottom: '0.75rem' }}>Scoring preferences</p>
					{[
						{ key: 'weight_code_quality', label: 'Code quality' },
						{ key: 'weight_open_source', label: 'Open source' },
						{ key: 'weight_experience', label: 'Experience' },
					].map(row => (
						<div key={row.key} style={{ marginBottom: '0.75rem' }}>
							<div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
								<span>{row.label}</span>
								<span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-accent)' }}>{criteria[row.key as keyof typeof criteria]}%</span>
							</div>
							<input type="range" min={0} max={100} value={Number(criteria[row.key as keyof typeof criteria])}
								onChange={e => setCriteria({ ...criteria, [row.key]: Number(e.target.value) })}
								style={{ width: '100%' }} />
						</div>
					))}
					<button className="btn btn-primary" style={{ fontSize: '0.8rem' }} onClick={saveCriteria} disabled={saving}>Save weights</button>
				</div>
			)}

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
										<button className="btn btn-secondary" style={{ fontSize: '0.8rem' }} onClick={() => setShowCriteria(!showCriteria)}>
											{showCriteria ? 'Close' : '⚖ Scoring Weights'}
										</button>
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
										{[...candidates].sort((a, b) => {
											const sa = sessions.find(s => s.candidate_id === a.id);
											const sb = sessions.find(s => s.candidate_id === b.id);
											return compositeScore(b, sb) - compositeScore(a, sa);
										}).map(c => {
											const session = sessions.find(s => s.candidate_id === c.id);
											const isDemoHighlight = c.github_username === 'riveradevops';
											const overall = compositeScore(c, session);
											const isShortlisted = shortlist.includes(c.id);
											return (
												<div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.85rem 1rem', background: isDemoHighlight ? 'rgba(16,185,129,0.05)' : isShortlisted ? 'rgba(16,185,129,0.03)' : 'rgba(255,255,255,0.02)', border: `1px solid ${isDemoHighlight ? 'rgba(16,185,129,0.35)' : isShortlisted ? 'rgba(16,185,129,0.2)' : 'var(--border-color)'}`, borderRadius: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
													<div>
														<p style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)', margin: 0 }}>
															{c.name}
															{isDemoHighlight && <span style={{ marginLeft: '0.5rem', fontSize: '0.65rem', padding: '0.15rem 0.4rem', borderRadius: '0.25rem', background: 'rgba(16,185,129,0.2)', color: '#10b981', fontWeight: 700 }}>DEMO WOW</span>}
															{isShortlisted && <span style={{ marginLeft: '0.5rem', fontSize: '0.65rem', padding: '0.15rem 0.4rem', borderRadius: '0.25rem', background: 'rgba(16,185,129,0.15)', color: '#10b981', fontWeight: 700 }}>SHORTLISTED</span>}
														</p>
														<p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.15rem 0 0 0' }}>{c.email} · @{c.github_username}</p>
														<div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
															{c.resume_s3_url && (
																<a href={fileUrl(c.resume_s3_url)} target="_blank" rel="noreferrer" style={{ fontSize: '0.7rem', color: 'var(--color-accent)', textDecoration: 'none' }}>Resume ↗</a>
															)}
															{c.recording_s3_url && (
																<a href={fileUrl(c.recording_s3_url, c.id)} target="_blank" rel="noreferrer" style={{ fontSize: '0.7rem', color: 'var(--color-accent)', textDecoration: 'none' }}>Interview video ↗</a>
															)}
															<Link href={`/candidate/${c.id}`} style={{ fontSize: '0.7rem', color: isDemoHighlight ? '#10b981' : 'var(--text-muted)', textDecoration: 'none', fontWeight: isDemoHighlight ? 700 : 400 }}>{isDemoHighlight ? 'View audit replay →' : 'Audit workspace →'}</Link>
															<Link href={`/report/${c.github_username}`} style={{ fontSize: '0.7rem', color: 'var(--color-accent)', textDecoration: 'none' }}>Public report</Link>
														</div>
													</div>
													<div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
														<div style={{ textAlign: 'right' }}>
															<p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', margin: 0 }}>Overall fit</p>
															<span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: getScoreColor(overall), fontSize: '1rem' }}>{overall > 0 ? `${overall}%` : '—'}</span>
															<p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', margin: '0.1rem 0 0' }}>
																Audit {c.sourcing_score || '—'} · Interview {session?.status === 'completed' ? `${session.interview_score}%` : '—'}
															</p>
														</div>
														<button
															onClick={() => toggleShortlist(c.id)}
															style={{ fontSize: '0.7rem', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', border: '1px solid var(--border-color)', background: isShortlisted ? 'rgba(16,185,129,0.15)' : 'transparent', color: isShortlisted ? '#10b981' : 'var(--text-muted)', cursor: 'pointer', fontWeight: 600 }}
														>
															{isShortlisted ? '★ Shortlisted' : '☆ Shortlist'}
														</button>
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
