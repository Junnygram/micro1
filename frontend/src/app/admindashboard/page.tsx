'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

interface Job {
	id: string;
	title: string;
	description: string;
	created_at: string;
}

interface Candidate {
	id: string;
	name: string;
	email: string;
	role: string;
	github_username: string;
	sourcing_score: number;
	status: 'completed' | 'evaluating' | 'failed' | 'pending';
	job_id: string;
	resume_s3_url: string;
	recording_s3_url: string;
	created_at: string;
	updated_at: string;
}

interface SourcingCriteria {
	weight_open_source: number;
	weight_code_quality: number;
	weight_experience: number;
	llm_model?: string;
}

export default function AdminDashboard() {
	const [isAuthenticated, setIsAuthenticated] = useState(false);
	const [companyID, setCompanyID] = useState('');
	const [companyName, setCompanyName] = useState('');

	const [candidates, setCandidates] = useState<Candidate[]>([]);
	const [jobs, setJobs] = useState<Job[]>([]);
	const [selectedJobID, setSelectedJobID] = useState<string>('');
	const [criteria, setCriteria] = useState<SourcingCriteria>({
		weight_open_source: 33,
		weight_code_quality: 33,
		weight_experience: 34,
		llm_model: 'gemini'
	});
	const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
	const [loadingCandidates, setLoadingCandidates] = useState(true);
	const [actionLoading, setActionLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Create Job form state
	const [showCreateJob, setShowCreateJob] = useState(false);
	const [newJobTitle, setNewJobTitle] = useState('');
	const [newJobDesc, setNewJobDesc] = useState('');

	const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

	// Check local storage session on mount
	useEffect(() => {
		if (typeof window !== 'undefined') {
			try {
				const auth = localStorage.getItem('company');
				if (auth) {
					const c = JSON.parse(auth);
					setCompanyID(c.id);
					setCompanyName(c.name);
					setIsAuthenticated(true);
				} else {
					window.location.href = '/login';
				}
			} catch {
				localStorage.removeItem('company');
				window.location.href = '/login';
			}
		}
	}, []);

	const handleLogout = () => {
		localStorage.removeItem('company');
		setIsAuthenticated(false);
		window.location.href = '/login';
	};

	const fetchJobs = async () => {
		if (!companyID) return;
		try {
			const res = await fetch(`${apiBase}/api/jobs?company_id=${companyID}`);
			if (!res.ok) throw new Error('Failed to fetch jobs');
			const data = await res.json();
			setJobs(data || []);
			if (data && data.length > 0 && !selectedJobID) {
				setSelectedJobID(data[0].id);
				fetchCandidates(data[0].id);
			}
		} catch (err) {
			console.error(err);
		}
	};

	const fetchCandidates = async (jobFilter?: string) => {
		if (!isAuthenticated || !companyID) return;
		try {
			const filterID = jobFilter !== undefined ? jobFilter : selectedJobID;
			const url = filterID ? `${apiBase}/api/candidates?company_id=${companyID}&job_id=${filterID}` : `${apiBase}/api/candidates?company_id=${companyID}`;
			const res = await fetch(url);
			if (!res.ok) throw new Error('Failed to fetch candidates list');
			const data = await res.json();
			setCandidates(data || []);
			setError(null);
		} catch (err) {
			setError('Could not connect to backend server. Make sure the Go server is running on port 8080.');
			console.error(err);
		} finally {
			setLoadingCandidates(false);
		}
	};

	const fetchCriteria = async () => {
		if (!companyID) return;
		try {
			const res = await fetch(`${apiBase}/api/criteria?company_id=${companyID}`);
			if (!res.ok) throw new Error('Failed to fetch criteria weights');
			const data = await res.json();
			setCriteria(data);
		} catch (err) {
			console.error(err);
		}
	};

	useEffect(() => {
		if (isAuthenticated && companyID) {
			fetchJobs();
			fetchCriteria();
			const timer = setInterval(() => {
				fetchCandidates();
			}, 2500);
			return () => clearInterval(timer);
		}
	}, [selectedJobID, isAuthenticated, companyID]);

	const handleJobFilter = (jobID: string) => {
		setSelectedJobID(jobID);
		setSelectedCandidate(null);
		setLoadingCandidates(true);
		fetchCandidates(jobID);
	};

	const handleCreateJob = async () => {
		if (!newJobTitle || !newJobDesc) return;
		try {
			const res = await fetch(`${apiBase}/api/jobs`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: newJobTitle, description: newJobDesc, company_id: companyID }),
			});
			if (!res.ok) throw new Error('Failed to create job');
			setNewJobTitle('');
			setNewJobDesc('');
			setShowCreateJob(false);
			fetchJobs();
		} catch (err) {
			alert((err as Error).message);
		}
	};

	const handleCriteriaChange = async (key: keyof SourcingCriteria, value: number | string) => {
		const updated = { ...criteria, [key]: value, company_id: companyID };
		setCriteria(updated);
		try {
			const res = await fetch(`${apiBase}/api/criteria`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(updated),
			});
			if (!res.ok) throw new Error('Failed to update criteria weights');
			fetchCandidates();
		} catch (err) {
			console.error(err);
		}
	};

	const handleStartAudit = async (mode: 'baseline' | 'advanced') => {
		if (!selectedCandidate) return;
		setActionLoading(true);
		try {
			const res = await fetch(`${apiBase}/api/sessions`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					candidate_id: selectedCandidate.id,
					mode: mode,
				}),
			});
			if (!res.ok) throw new Error('Failed to start candidate audit session');
			window.location.href = `/candidate/${selectedCandidate.id}`;
		} catch (err) {
			alert((err as Error).message);
			setActionLoading(false);
		}
	};

	const getStatusBadge = (status: string, score: number) => {
		switch (status) {
			case 'completed':
				if (score >= 80) return <span className="badge passed">Verified (High)</span>;
				if (score >= 50) return <span className="badge wait-hitl">Mismatch (Medium)</span>;
				return <span className="badge failed">Flagged (Risk)</span>;
			case 'evaluating':
				return <span className="badge running">● Auditing</span>;
			case 'failed':
				return <span className="badge failed">Audit Failed</span>;
			case 'pending':
				return <span className="badge" style={{ background: 'rgba(99,102,241,0.1)', color: 'var(--color-accent)' }}>Applied</span>;
			default:
				return <span className="badge">Pending</span>;
		}
	};

	const selectedJobObj = jobs.find(j => j.id === selectedJobID);

	// LOGIN CARD - Now Handled by /login, but keeping fallback wrapper
	if (!isAuthenticated) {
		return null; // The useEffect will redirect to /login
	}

	return (
		<div className="app-container">
			{/* Header Navigation */}
			<header className="header" style={{ marginBottom: '1.5rem' }}>
				<div className="header-title-wrapper">
					<div className="logo-icon" style={{ background: 'linear-gradient(135deg, var(--color-accent) 0%, #a855f7 100%)' }}>ZS</div>
					<div>
						<h1>{companyName} Dashboard</h1>
						<p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
							AI Sourcing &amp; Vetting Pipeline Analytics
						</p>
					</div>
				</div>
				<div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
					<Link href="/troubleshooting" className="btn btn-secondary" style={{ fontSize: '0.85rem', padding: '0.5rem 1rem', background: 'rgba(99,102,241,0.1)', color: 'var(--color-accent)' }}>
						System Analytics
					</Link>
					<Link href="/" className="btn btn-secondary" style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}>
						Home Page
					</Link>
					<button
						className="btn btn-secondary"
						onClick={handleLogout}
						style={{ fontSize: '0.85rem', padding: '0.5rem 1rem', background: 'rgba(239, 68, 68, 0.1)', color: '#fca5a5', border: '1px solid rgba(239, 68, 68, 0.2)' }}
					>
						Logout
					</button>
				</div>
			</header>

			{error && (
				<div style={{ padding: '1rem', background: 'rgba(244,63,94,0.1)', border: '1px solid var(--color-failure)', borderRadius: '0.5rem', marginBottom: '2rem', color: '#fca5a5' }}>
					{error}
				</div>
			)}

			{/* ========== ADMIN DASHBOARD ========== */}
			<>
				{/* Hero banner */}
				<section style={{
					background: 'radial-gradient(ellipse at top right, rgba(99, 102, 241, 0.15), transparent 50%), linear-gradient(135deg, rgba(30, 27, 75, 0.4) 0%, rgba(15, 12, 21, 0.4) 100%)',
					border: '1px solid rgba(255, 255, 255, 0.05)',
					padding: '2.5rem',
					borderRadius: '1rem',
					marginBottom: '2rem',
					boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)'
				}}>
					<h2 style={{
						fontSize: '2rem', fontWeight: 900,
						background: 'linear-gradient(135deg, #ffffff 40%, var(--color-accent) 100%)',
						WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
						marginBottom: '0.75rem'
					}}>
						Candidate Vetting Grounded directly in Code
					</h2>
					<p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', lineHeight: '1.6', maxWidth: '780px' }}>
						Reconcile developer resume claims directly with public GitHub footprints, code syntax quality, and camera-tracked proctoring timelines. Prevent code plagiarism and look-away anomalies during live technical sessions.
					</p>
				</section>

				{/* Job Openings Bar */}
				<section className="panel" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
					<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
						<div className="panel-header" style={{ margin: 0 }}>
							<span>Job Openings Pipeline</span>
						</div>
						<button className="btn btn-primary" style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }} onClick={() => setShowCreateJob(!showCreateJob)}>
							{showCreateJob ? 'Cancel' : '+ New Job Opening'}
						</button>
					</div>

					{/* Create Job Form */}
					{showCreateJob && (
						<div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem', padding: '1rem', background: 'rgba(99,102,241,0.03)', border: '1px solid var(--border-color)', borderRadius: '0.5rem' }}>
							<input type="text" value={newJobTitle} onChange={e => setNewJobTitle(e.target.value)} placeholder="Job Title (e.g. Senior Go/React Engineer)"
								style={{ padding: '0.65rem 0.75rem', background: '#09070a', border: '1px solid var(--border-color)', borderRadius: '0.35rem', color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }}
							/>
							<textarea value={newJobDesc} onChange={e => setNewJobDesc(e.target.value)} placeholder="Job Description requirements..."
								rows={3}
								style={{ padding: '0.65rem 0.75rem', background: '#09070a', border: '1px solid var(--border-color)', borderRadius: '0.35rem', color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
							/>
							<button className="btn btn-primary" style={{ fontSize: '0.85rem', alignSelf: 'flex-start' }} onClick={handleCreateJob}>
								Create Job Opening
							</button>
						</div>
					)}

					{/* Job Tabs */}
					<div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
						<button
							onClick={() => handleJobFilter('')}
							className={`btn ${selectedJobID === '' ? 'btn-primary' : 'btn-secondary'}`}
							style={{ fontSize: '0.8rem', padding: '0.4rem 0.85rem' }}
						>
							All Candidates
						</button>
						{jobs.map(j => (
							<button
								key={j.id}
								onClick={() => handleJobFilter(j.id)}
								className={`btn ${selectedJobID === j.id ? 'btn-primary' : 'btn-secondary'}`}
								style={{ fontSize: '0.8rem', padding: '0.4rem 0.85rem' }}
							>
								{j.title}
							</button>
						))}
					</div>

					{selectedJobObj && (
						<div style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--text-muted)', padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '0.35rem', border: '1px solid var(--border-color)' }}>
							<strong style={{ color: 'var(--text-secondary)' }}>JD:</strong> {selectedJobObj.description}
						</div>
					)}
				</section>

				{/* Telemetry Metrics cards */}
				<div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.25rem', marginBottom: '1.5rem' }}>
					<div className="stat-card" style={{ background: 'rgba(255,255,255,0.02)', padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid var(--border-color)' }}>
						<span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Open Jobs</span>
						<div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '0.25rem', color: '#f8fafc' }}>
							{jobs.length}
						</div>
					</div>
					<div className="stat-card" style={{ background: 'rgba(255,255,255,0.02)', padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid var(--border-color)' }}>
						<span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Active Audits</span>
						<div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '0.25rem', color: '#f8fafc' }}>
							{candidates.filter(c => c.status === 'evaluating').length} / {candidates.length}
						</div>
					</div>
					<div className="stat-card" style={{ background: 'rgba(255,255,255,0.02)', padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid var(--border-color)' }}>
						<span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Avg Score</span>
						<div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--color-success)' }}>
							{candidates.filter(c => c.status === 'completed').length > 0
								? Math.round(candidates.filter(c => c.status === 'completed').reduce((sum, c) => sum + c.sourcing_score, 0) / candidates.filter(c => c.status === 'completed').length)
								: '—'}%
						</div>
					</div>
					<div className="stat-card" style={{ background: 'rgba(255,255,255,0.02)', padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid var(--border-color)' }}>
						<span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Vetting Model</span>
						<div style={{ fontSize: '1.1rem', fontWeight: 800, marginTop: '0.5rem', color: 'var(--color-accent)' }}>
							{criteria.llm_model === 'bedrock' ? 'AWS Bedrock Claude' : 'Google Gemini Flash'}
						</div>
					</div>
				</div>

				{/* Sourcing Weight Criteria Levers */}
				<section className="panel" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
					<div className="panel-header" style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>
						<span>Dynamic Sourcing Criteria Weights</span>
					</div>
					<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2rem' }}>
						{([
							['weight_open_source', 'Open Source (Stars)', criteria.weight_open_source],
							['weight_code_quality', 'Code Quality (Risk)', criteria.weight_code_quality],
							['weight_experience', 'Resume Match', criteria.weight_experience],
						] as [keyof SourcingCriteria, string, number][]).map(([key, label, val]) => (
							<div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
								<div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 600 }}>
									<span>{label}</span>
									<span style={{ color: 'var(--color-accent)' }}>{val}%</span>
								</div>
								<input
									type="range" min="0" max="100" value={val}
									onChange={(e) => handleCriteriaChange(key, Number(e.target.value))}
									style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', cursor: 'pointer', outline: 'none' }}
								/>
							</div>
						))}
					</div>

					{/* LLM Engine Selection */}
					<div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
						<div>
							<h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>Vetting Agent Engine</h4>
							<p style={{ margin: '0.2rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Choose the underlying LLM model for dynamic repository source code claim auditing.</p>
						</div>
						<div style={{ display: 'flex', gap: '0.5rem' }}>
							<button
								onClick={() => handleCriteriaChange('llm_model', 'gemini')}
								className={`btn ${criteria.llm_model !== 'bedrock' ? 'btn-primary' : 'btn-secondary'}`}
								style={{ fontSize: '0.8rem', padding: '0.4rem 0.85rem' }}
							>
								Google Gemini (Default)
							</button>
							<button
								onClick={() => handleCriteriaChange('llm_model', 'bedrock')}
								className={`btn ${criteria.llm_model === 'bedrock' ? 'btn-primary' : 'btn-secondary'}`}
								style={{ fontSize: '0.8rem', padding: '0.4rem 0.85rem' }}
							>
								AWS Bedrock (Claude 3.5 Sonnet)
							</button>
						</div>
					</div>
				</section>

				{/* Main Grid */}
				<div className="main-grid">
					{/* Sidebar - Candidate List */}
					<aside className="panel">
						<div className="panel-header">
							<span>Candidates Pipeline {selectedJobObj ? `— ${selectedJobObj.title}` : ''}</span>
						</div>
						{loadingCandidates ? (
							<p style={{ color: 'var(--text-secondary)', padding: '1rem' }}>Loading candidate records...</p>
						) : candidates.length === 0 ? (
							<p style={{ color: 'var(--text-muted)', padding: '1rem', textAlign: 'center' }}>
								No candidates found{selectedJobObj ? ` for "${selectedJobObj.title}"` : ''}.
							</p>
						) : (
							<div className="test-list">
								{candidates.map((c, idx) => (
									<div
										key={c.id}
										className={`test-item fade-in-up ${selectedCandidate?.id === c.id ? 'selected' : ''}`}
										style={{ animationDelay: `${idx * 0.05}s` }}
										onClick={() => setSelectedCandidate(c)}
									>
										<div className="test-info" style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
											<span className="test-name">{c.name}</span>
											<div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
												<span className="test-class">@{c.github_username}</span>
												{c.resume_s3_url && (
													<span style={{ fontSize: '0.7rem', color: 'var(--color-accent)', background: 'rgba(99,102,241,0.1)', padding: '0.05rem 0.35rem', borderRadius: '0.25rem' }}>
														📄 CV
													</span>
												)}
											</div>
										</div>
										<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
											<span style={{ fontFamily: 'var(--font-mono)', fontWeight: 'bold', color: c.status === 'completed' ? (c.sourcing_score >= 80 ? 'var(--color-success)' : c.sourcing_score >= 50 ? 'var(--color-warning)' : 'var(--color-failure)') : 'var(--text-secondary)' }}>
												{c.status === 'completed' ? `${c.sourcing_score}%` : '—'}
											</span>
											{getStatusBadge(c.status, c.sourcing_score)}
										</div>
									</div>
								))}
							</div>
						)}
					</aside>

					{/* Center Content - Candidate Diagnostic Workspace */}
					<main style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
						{selectedCandidate ? (
							<div className="panel" style={{ flex: 1 }}>
								<div className="panel-header">
									<span>Vetting Workspace: {selectedCandidate.name}</span>
									{getStatusBadge(selectedCandidate.status, selectedCandidate.sourcing_score)}
								</div>
								
								<div className="detail-view">
									<div className="detail-header-info">
										<p style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--color-accent)' }}>{selectedCandidate.role}</p>
										<p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
											Email: {selectedCandidate.email} | GitHub: @{selectedCandidate.github_username}
										</p>
										{selectedCandidate.resume_s3_url && (
											<p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
												📄 Resume: <span style={{ color: 'var(--color-accent)' }}>{selectedCandidate.resume_s3_url}</span>
											</p>
										)}
									</div>

									{selectedCandidate.status === 'completed' ? (
										<div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
											<div style={{ padding: '1.5rem', background: 'rgba(99,102,241,0.05)', borderRadius: '0.5rem', border: '1px solid var(--border-color)', textAlign: 'center' }}>
												<p style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>Audit Finished successfully</p>
												<p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>The candidate code footprint has been reconciled with the resume claims.</p>
												<Link href={`/candidate/${selectedCandidate.id}`} className="btn btn-primary" style={{ marginTop: '1rem', display: 'inline-block' }}>
													Open Verified Scorecard &amp; Audit Trail
												</Link>
											</div>
										</div>
									) : selectedCandidate.status === 'evaluating' ? (
										<div style={{ padding: '3rem', textAlign: 'center', background: 'rgba(99,102,241,0.03)', borderRadius: '0.5rem', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center', marginTop: '1rem' }}>
											<div className="badge running" style={{ fontSize: '1rem', padding: '0.5rem 1rem' }}>● Agent Vetting Session Active</div>
											<p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>ZaraSourcing is currently pulling repositories and grepping code structure logs.</p>
											<Link href={`/candidate/${selectedCandidate.id}`} className="btn btn-secondary">
												Open Live Audit Terminal
											</Link>
										</div>
									) : (
										<div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '1rem' }}>
											<p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
												This candidate profile has not been audited yet. Run the code verification agent to download their repository contents, check file structures, and verify resume claims against actual code.
											</p>

											<div className="action-buttons" style={{ marginTop: '0.5rem', display: 'flex', gap: '1rem' }}>
												<button className="btn btn-primary" disabled={actionLoading} onClick={() => handleStartAudit('advanced')}>
													{actionLoading ? 'Initializing...' : 'Run ZaraSourcing Audit (Grounded Agent)'}
												</button>
												<button className="btn btn-secondary" disabled={actionLoading} onClick={() => handleStartAudit('baseline')}>
													{actionLoading ? 'Initializing...' : 'Run Text-Only Baseline'}
												</button>
											</div>
										</div>
									)}
								</div>
							</div>
						) : (
							<div className="panel" style={{ flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: '350px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
								<p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>
									Select a candidate from the pipeline to inspect details.
								</p>
								<p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
									Use the Job Openings bar above to filter candidates by position.
								</p>
							</div>
						)}
					</main>
				</div>
			</>
		</div>
	);
}
