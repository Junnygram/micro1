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

export default function LandingPage() {
	const [candidates, setCandidates] = useState<Candidate[]>([]);
	const [jobs, setJobs] = useState<Job[]>([]);
	const [loading, setLoading] = useState(true);
	
	// Candidate Application form state
	const [applyName, setApplyName] = useState('');
	const [applyEmail, setApplyEmail] = useState('');
	const [applyGithub, setApplyGithub] = useState('');
	const [applyJobID, setApplyJobID] = useState('');
	const [applyRole, setApplyRole] = useState('');
	const [applyResume, setApplyResume] = useState<File | null>(null);
	const [applyLoading, setApplyLoading] = useState(false);
	const [applySuccess, setApplySuccess] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const apiBase = 'http://localhost:8080';

	const fetchJobs = async () => {
		try {
			const res = await fetch(`${apiBase}/api/jobs`);
			if (!res.ok) throw new Error('Failed to fetch jobs');
			const data = await res.json();
			setJobs(data || []);
			if (data && data.length > 0) {
				setApplyJobID(data[0].id);
				setApplyRole(data[0].title);
			}
		} catch (err) {
			console.error(err);
		}
	};

	const fetchCandidates = async () => {
		try {
			const res = await fetch(`${apiBase}/api/candidates`);
			if (!res.ok) throw new Error('Failed to fetch candidates');
			const data = await res.json();
			setCandidates(data || []);
		} catch (err) {
			console.error(err);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchJobs();
		fetchCandidates();
	}, []);

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
			if (applyResume) {
				formData.append('resume', applyResume);
			}

			const res = await fetch(`${apiBase}/api/apply`, {
				method: 'POST',
				body: formData,
			});
			if (!res.ok) throw new Error('Application submission failed');

			setApplySuccess(true);
			setApplyName('');
			setApplyEmail('');
			setApplyGithub('');
			setApplyResume(null);
			if (fileInputRef.current) fileInputRef.current.value = '';
			fetchCandidates();
		} catch (err) {
			alert((err as Error).message);
		} finally {
			setApplyLoading(false);
		}
	};

	const handleJobSelect = (jobId: string) => {
		setApplyJobID(jobId);
		const job = jobs.find(j => j.id === jobId);
		if (job) {
			setApplyRole(job.title);
		}
	};

	return (
		<div className="app-container" style={{ paddingBottom: '5rem' }}>
			{/* Navigation Header */}
			<header className="header" style={{ marginBottom: '3rem' }}>
				<div className="header-title-wrapper">
					<div className="logo-icon" style={{ background: 'linear-gradient(135deg, var(--color-accent) 0%, #a855f7 100%)' }}>ZS</div>
					<div>
						<h1>ZaraSourcing</h1>
						<p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
							AI Developer Screening Grounded in GitHub Footprints
						</p>
					</div>
				</div>
				<div>
					<Link href="/login" className="btn btn-primary" style={{ fontSize: '0.9rem', padding: '0.6rem 1.25rem', fontWeight: 600 }}>
						Login / Register →
					</Link>
				</div>
			</header>

			{/* Hero Section */}
			<section style={{
				position: 'relative',
				background: 'radial-gradient(ellipse at top right, rgba(99, 102, 241, 0.15), transparent 60%), radial-gradient(ellipse at bottom left, rgba(168, 85, 247, 0.08), transparent 60%), linear-gradient(135deg, rgba(20, 18, 42, 0.4) 0%, rgba(10, 8, 16, 0.4) 100%)',
				border: '1px solid rgba(255, 255, 255, 0.05)',
				padding: '4rem 2rem',
				borderRadius: '1.25rem',
				marginBottom: '4rem',
				textAlign: 'center',
				boxShadow: '0 12px 40px 0 rgba(0, 0, 0, 0.4)'
			}}>
				<div style={{
					display: 'inline-block',
					padding: '0.4rem 1rem',
					background: 'rgba(99, 102, 241, 0.12)',
					border: '1px solid rgba(99, 102, 241, 0.3)',
					color: 'var(--color-accent)',
					borderRadius: '2rem',
					fontSize: '0.8rem',
					fontWeight: 600,
					marginBottom: '1.5rem',
					textTransform: 'uppercase',
					letterSpacing: '0.05em'
				}}>
					🚀 Grounded AI Vetting Platform
				</div>
				<h2 style={{
					fontSize: '2.75rem',
					fontWeight: 900,
					background: 'linear-gradient(135deg, #ffffff 30%, #c084fc 100%)',
					WebkitBackgroundClip: 'text',
					WebkitTextFillColor: 'transparent',
					marginBottom: '1rem',
					lineHeight: '1.2'
				}}>
					Next-Gen AI Sourcing &amp; Gaze-Tracked Vetting
				</h2>
				<p style={{
					fontSize: '1.1rem',
					color: 'var(--text-secondary)',
					lineHeight: '1.6',
					maxWidth: '820px',
					margin: '0 auto 2.5rem auto'
				}}>
					Eliminate technical vetting plagiarism and CV inflation. Reconcile engineer resume claims directly with public GitHub footprints, code syntax quality, and real-time gaze-proctored audio screenings.
				</p>
				<div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
					<a href="#apply" className="btn btn-primary" style={{ padding: '0.8rem 1.75rem', fontSize: '1rem', fontWeight: 600 }}>
						Apply to Positions
					</a>
					<a href="#demo" className="btn btn-secondary" style={{ padding: '0.8rem 1.75rem', fontSize: '1rem', fontWeight: 600 }}>
						Explore Demo Assessments
					</a>
				</div>
			</section>

			{/* Core Features Grid */}
			<section style={{ marginBottom: '5rem' }}>
				<div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
					<h3 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#ffffff' }}>Technical Safeguards &amp; Architecture</h3>
					<p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
						Enterprise-grade tools built to evaluate actual capabilities.
					</p>
				</div>
				<div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem' }}>
					<div className="panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
						<span style={{ fontSize: '1.75rem' }}>🤖</span>
						<h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>AI-Powered Screening</h4>
						<p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
							Automatically audit resumes against actual code commits to surface the most capable candidates.
						</p>
					</div>

					<div className="panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
						<span style={{ fontSize: '1.75rem' }}>👀</span>
						<h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>Anti-Plagiarism Protection</h4>
						<p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
							Advanced tracking ensures candidate authenticity during assessments, detecting distractions and unauthorized assistance.
						</p>
					</div>

					<div className="panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
						<span style={{ fontSize: '1.75rem' }}>🎙️</span>
						<h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>Real-time Voice Interviews</h4>
						<p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
							Conduct lifelike technical interviews using dynamic, human-quality AI voice interactions.
						</p>
					</div>

					<div className="panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
						<span style={{ fontSize: '1.75rem' }}>🎥</span>
						<h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>Comprehensive Analytics</h4>
						<p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
							Review candidate sessions securely anytime with archived video playbacks and detailed performance breakdowns.
						</p>
					</div>
				</div>
			</section>

			{/* Interactive Assessment Demo Profiles */}
			<section id="demo" style={{ marginBottom: '5rem' }}>
				<div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
					<h3 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#ffffff' }}>Active Demo Screenings</h3>
					<p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
						Launch the live candidate vetting flow directly to experience the interview process.
					</p>
				</div>

				{loading ? (
					<p style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Loading demo pipeline profiles...</p>
				) : (
					<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
						{candidates.slice(0, 6).map(c => (
							<div key={c.id} className="panel" style={{
								padding: '1.75rem',
								display: 'flex',
								flexDirection: 'column',
								justifyContent: 'space-between',
								minHeight: '220px',
								border: '1px solid rgba(255, 255, 255, 0.05)',
								background: 'rgba(255, 255, 255, 0.01)',
								transition: 'transform 0.2s, border-color 0.2s',
								cursor: 'pointer'
							}}
							onMouseEnter={e => {
								e.currentTarget.style.transform = 'translateY(-4px)';
								e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.3)';
							}}
							onMouseLeave={e => {
								e.currentTarget.style.transform = 'translateY(0)';
								e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)';
							}}
							>
								<div>
									<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
										<h4 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#ffffff' }}>{c.name}</h4>
										<span style={{ fontSize: '0.75rem', color: 'var(--color-accent)', background: 'rgba(99,102,241,0.1)', padding: '0.2rem 0.5rem', borderRadius: '0.25rem', fontFamily: 'var(--font-mono)' }}>
											{c.sourcing_score > 0 ? `Score: ${c.sourcing_score}%` : 'Pending'}
										</span>
									</div>
									<p style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{c.role}</p>
									<p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>GitHub Profile: @{c.github_username}</p>
								</div>
								
								<div style={{ marginTop: '1.5rem' }}>
									<Link href={`/candidate/${c.id}`} className="btn btn-primary" style={{ width: '100%', textAlign: 'center', display: 'block', fontSize: '0.85rem', padding: '0.5rem' }}>
										Launch Live Screening →
									</Link>
								</div>
							</div>
						))}
					</div>
				)}
			</section>

			{/* Candidate Application Form */}
			<section id="apply" style={{ maxWidth: '720px', margin: '0 auto' }}>
				<div className="panel" style={{ padding: '2.5rem' }}>
					<div style={{ textAlign: 'center', marginBottom: '2rem' }}>
						<h3 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#ffffff', margin: 0 }}>Join the Candidate Pipeline</h3>
						<p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
							Apply for a position by attaching your resume. Our AI agent will audit your code claims.
						</p>
					</div>

					{applySuccess && (
						<div style={{ padding: '1rem', background: 'rgba(16,185,129,0.1)', border: '1px solid var(--color-success)', borderRadius: '0.5rem', marginBottom: '1.5rem', color: '#6ee7b7', textAlign: 'center' }}>
							✓ Application submitted successfully! Run the vetting assessment from the profiles above to start screening.
						</div>
					)}

					<div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
						{/* Name */}
						<div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
							<label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Full Name *</label>
							<input type="text" value={applyName} onChange={e => setApplyName(e.target.value)} placeholder="Olaleye Oyewunmi"
								style={{ padding: '0.75rem 1rem', background: '#09070a', border: '1px solid var(--border-color)', borderRadius: '0.5rem', color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none' }}
							/>
						</div>

						{/* Email */}
						<div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
							<label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Email Address *</label>
							<input type="email" value={applyEmail} onChange={e => setApplyEmail(e.target.value)} placeholder="you@example.com"
								style={{ padding: '0.75rem 1rem', background: '#09070a', border: '1px solid var(--border-color)', borderRadius: '0.5rem', color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none' }}
							/>
						</div>

						{/* GitHub Username */}
						<div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
							<label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>GitHub Username *</label>
							<input type="text" value={applyGithub} onChange={e => setApplyGithub(e.target.value)} placeholder="@junnygram"
								style={{ padding: '0.75rem 1rem', background: '#09070a', border: '1px solid var(--border-color)', borderRadius: '0.5rem', color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none' }}
							/>
						</div>

						{/* Job Opening Selector */}
						<div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
							<label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Target Opening</label>
							<select value={applyJobID} onChange={e => handleJobSelect(e.target.value)}
								style={{ padding: '0.75rem 1rem', background: '#09070a', border: '1px solid var(--border-color)', borderRadius: '0.5rem', color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none' }}
							>
								<option value="">Select a job opening...</option>
								{jobs.map(j => (
									<option key={j.id} value={j.id}>{j.title}</option>
								))}
							</select>
						</div>

						{/* Resume Upload */}
						<div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
							<label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Resume File (PDF / DOCX)</label>
							<div
								onClick={() => fileInputRef.current?.click()}
								style={{
									padding: '2rem',
									background: '#09070a',
									border: '2px dashed var(--border-color)',
									borderRadius: '0.5rem',
									textAlign: 'center',
									cursor: 'pointer',
									transition: 'border-color 0.2s'
								}}
								onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--color-accent)'; }}
								onDragLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; }}
								onDrop={e => {
									e.preventDefault();
									e.currentTarget.style.borderColor = 'var(--border-color)';
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
									<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
										<span style={{ fontSize: '1.25rem' }}>📄</span>
										<span style={{ color: 'var(--color-accent)', fontWeight: 600 }}>{applyResume.name}</span>
										<span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>({Math.round(applyResume.size / 1024)} KB)</span>
									</div>
								) : (
									<div>
										<p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
											Click or drag & drop your resume file here
										</p>
										<p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
											Supported formats: PDF, DOC, DOCX (max 32MB)
										</p>
									</div>
								)}
							</div>
						</div>

						<button
							className="btn btn-primary"
							style={{ marginTop: '0.5rem', padding: '0.85rem', fontSize: '1rem', fontWeight: 700 }}
							disabled={applyLoading}
							onClick={handleApply}
						>
							{applyLoading ? 'Submitting Application...' : 'Submit Application'}
						</button>
					</div>
				</div>
			</section>
		</div>
	);
}
