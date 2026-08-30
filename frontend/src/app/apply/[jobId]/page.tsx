'use client';
import { getApiBase } from '@/lib/api';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface Job {
	id: string;
	title: string;
	description: string;
	company_id: string;
	created_at: string;
}

export default function ApplyPage() {
	const params = useParams();
	const initialJobId = params.jobId as string;

	const [jobs, setJobs] = useState<Job[]>([]);
	const [loading, setLoading] = useState(true);

	const [applyName, setApplyName] = useState('');
	const [applyEmail, setApplyEmail] = useState('');
	const [applyGithub, setApplyGithub] = useState('');
	const [applyJobID, setApplyJobID] = useState(initialJobId || '');
	const [applyRole, setApplyRole] = useState('');
	const [applyResume, setApplyResume] = useState<File | null>(null);
	const [applyLoading, setApplyLoading] = useState(false);
	const [interviewLink, setInterviewLink] = useState('');
	const [applySuccess, setApplySuccess] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const apiBase = getApiBase();

	useEffect(() => {
		const fetchJobs = async () => {
			try {
				const res = await fetch(`${apiBase}/api/jobs`);
				if (!res.ok) throw new Error('Failed to fetch jobs');
				const data = await res.json();
				setJobs(data || []);

				if (initialJobId && data) {
					const job = data.find((j: Job) => j.id === initialJobId);
					if (job) setApplyRole(job.title);
				} else if (data && data.length > 0 && !applyJobID) {
					setApplyJobID(data[0].id);
					setApplyRole(data[0].title);
				}
			} catch (err) {
				console.error(err);
			} finally {
				setLoading(false);
			}
		};
		fetchJobs();
	}, [initialJobId, apiBase]);

	const handleApply = async () => {
		if (!applyName || !applyEmail || !applyGithub) {
			alert('Please fill in your name, email, and GitHub username.');
			return;
		}
		setApplyLoading(true);
		setApplySuccess(false);
		try {
			const formData = new FormData();
			formData.append('name', applyName);
			formData.append('email', applyEmail);
			formData.append('github_username', applyGithub);
			formData.append('job_id', applyJobID || 'default_job');
			formData.append('role', applyRole || 'Full-Stack Developer');

			const selectedJobObj = jobs.find(j => j.id === applyJobID);
			if (selectedJobObj?.company_id) {
				formData.append('company_id', selectedJobObj.company_id);
			}
			if (applyResume) {
				formData.append('resume', applyResume);
			}

			const res = await fetch(`${apiBase}/api/apply`, {
				method: 'POST',
				body: formData,
			});
			if (!res.ok) throw new Error('Application submission failed');
			const candidate = await res.json();

			try {
				const sessionRes = await fetch(`${apiBase}/api/interview/start`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ candidate_id: candidate.id, job_id: applyJobID || 'default_job' }),
				});
				if (sessionRes.ok) {
					const sessionData = await sessionRes.json();
					const token = sessionData.session?.token;
					if (token) setInterviewLink(`${window.location.origin}/interview/${token}`);
				}
			} catch { /* interview link optional */ }

			setApplySuccess(true);
			setApplyName('');
			setApplyEmail('');
			setApplyGithub('');
			setApplyResume(null);
			if (fileInputRef.current) fileInputRef.current.value = '';
		} catch (err) {
			alert((err as Error).message);
		} finally {
			setApplyLoading(false);
		}
	};

	const handleJobSelect = (jobId: string) => {
		setApplyJobID(jobId);
		const job = jobs.find(j => j.id === jobId);
		if (job) setApplyRole(job.title);
	};

	if (loading) {
		return <div className="app-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>Loading job details...</div>;
	}

	return (
		<div className="app-container" style={{ paddingBottom: '5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '3rem' }}>

			<div style={{ width: '100%', maxWidth: '720px', marginBottom: '2rem' }}>
				<Link href="/" style={{ color: 'var(--text-secondary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
					← Back to Home
				</Link>
			</div>

			<section id="apply" style={{ width: '100%', maxWidth: '720px' }}>
				<div className="panel fade-in-up" style={{ padding: '2.5rem' }}>
					<div style={{ textAlign: 'center', marginBottom: '2rem' }}>
						<div className="logo-icon" style={{ margin: '0 auto 1.5rem auto', background: 'linear-gradient(135deg, var(--color-accent) 0%, #a855f7 100%)' }}>ZS</div>
						<h3 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#ffffff', margin: 0 }}>Apply for this role</h3>
						<p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
							Resume and GitHub. After you apply, you&apos;ll get a private link to your voice interview.
						</p>
					</div>

					{applySuccess && (
						<div style={{ padding: '1.5rem', background: 'rgba(16,185,129,0.08)', border: '1px solid var(--color-success)', borderRadius: '0.75rem', marginBottom: '1.5rem' }}>
							<p style={{ color: '#6ee7b7', fontWeight: 700, fontSize: '1rem', marginBottom: '0.5rem' }}>✓ Application submitted!</p>
							{interviewLink ? (
								<>
									<p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
										Your private interview link is ready. Open it in <strong>Chrome or Edge</strong>, allow camera and microphone, then click <strong>Start Interview</strong>.
									</p>
									<div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'rgba(0,0,0,0.3)', padding: '0.65rem 0.85rem', borderRadius: '0.5rem', border: '1px solid rgba(6,182,212,0.3)' }}>
										<span style={{ flex: 1, fontSize: '0.8rem', color: 'var(--color-accent)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{interviewLink}</span>
										<button className="btn btn-primary" style={{ fontSize: '0.75rem', padding: '0.4rem 0.75rem', flexShrink: 0 }}
											onClick={() => { navigator.clipboard.writeText(interviewLink); }}>
											Copy
										</button>
										<a href={interviewLink} className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.4rem 0.75rem', flexShrink: 0 }} target="_blank" rel="noreferrer">
											Start interview →
										</a>
									</div>
								</>
							) : (
								<p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>The hiring team will send you your interview link shortly.</p>
							)}
						</div>
					)}

					<div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
						<div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
							<label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Target Opening *</label>
							<select value={applyJobID} onChange={e => handleJobSelect(e.target.value)} disabled={!!initialJobId}
								style={{ padding: '0.85rem 1rem', background: '#09070a', border: '1px solid var(--border-color)', borderRadius: '0.5rem', color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none', opacity: initialJobId ? 0.7 : 1 }}
							>
								<option value="">Select a job opening...</option>
								{jobs.map(j => (
									<option key={j.id} value={j.id}>{j.title}</option>
								))}
							</select>
							{initialJobId && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Role locked from selection</span>}
						</div>

						<div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
							<label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Full Name *</label>
							<input type="text" value={applyName} onChange={e => setApplyName(e.target.value)} placeholder="Your full name"
								style={{ padding: '0.85rem 1rem', background: '#09070a', border: '1px solid var(--border-color)', borderRadius: '0.5rem', color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none' }}
							/>
						</div>

						<div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
							<label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Email Address *</label>
							<input type="email" value={applyEmail} onChange={e => setApplyEmail(e.target.value)} placeholder="you@example.com"
								style={{ padding: '0.85rem 1rem', background: '#09070a', border: '1px solid var(--border-color)', borderRadius: '0.5rem', color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none' }}
							/>
						</div>

						<div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
							<label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>GitHub Username *</label>
							<input type="text" value={applyGithub} onChange={e => setApplyGithub(e.target.value)} placeholder="your-github-handle"
								style={{ padding: '0.85rem 1rem', background: '#09070a', border: '1px solid var(--border-color)', borderRadius: '0.5rem', color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none' }}
							/>
						</div>

						<div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
							<label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Resume File (PDF / DOCX)</label>
							<div
								onClick={() => fileInputRef.current?.click()}
								style={{
									padding: '2.5rem',
									background: '#09070a',
									border: '2px dashed var(--border-color)',
									borderRadius: '0.5rem',
									textAlign: 'center',
									cursor: 'pointer',
									transition: 'border-color 0.2s, background 0.2s'
								}}
								onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--color-accent)'; e.currentTarget.style.background = 'rgba(168,85,247,0.05)'; }}
								onDragLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.background = '#09070a'; }}
								onDrop={e => {
									e.preventDefault();
									e.currentTarget.style.borderColor = 'var(--border-color)';
									e.currentTarget.style.background = '#09070a';
									if (e.dataTransfer.files?.[0]) setApplyResume(e.dataTransfer.files[0]);
								}}
							>
								<input
									ref={fileInputRef}
									type="file"
									accept=".pdf,.doc,.docx"
									style={{ display: 'none' }}
									onChange={e => {
										if (e.target.files?.[0]) setApplyResume(e.target.files[0]);
									}}
								/>
								{applyResume ? (
									<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
										<span style={{ fontSize: '1.5rem' }}>📄</span>
										<span style={{ color: 'var(--color-accent)', fontWeight: 600, fontSize: '1rem' }}>{applyResume.name}</span>
										<span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>({Math.round(applyResume.size / 1024)} KB)</span>
									</div>
								) : (
									<div>
										<p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', fontWeight: 500 }}>
											Click or drag & drop your resume file here
										</p>
										<p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.5rem' }}>
											Supported formats: PDF, DOC, DOCX (max 32MB)
										</p>
									</div>
								)}
							</div>
						</div>

						<button
							className="btn btn-primary"
							style={{ marginTop: '1rem', padding: '1rem', fontSize: '1.05rem', fontWeight: 700 }}
							disabled={applyLoading || applySuccess}
							onClick={handleApply}
						>
							{applyLoading ? 'Submitting Application...' : 'Submit Application →'}
						</button>
					</div>
				</div>
			</section>
		</div>
	);
}
