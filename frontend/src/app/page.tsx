'use client';
import { getApiBase } from '@/lib/api';

import Link from 'next/link';
import { useEffect, useState } from 'react';

interface PreviewCandidate {
	name: string;
	github: string;
	sourcing_score: number;
	inflated_claims: number;
}

export default function LandingPage() {
	const [preview, setPreview] = useState<PreviewCandidate[]>([]);
	const apiBase = getApiBase();

	useEffect(() => {
		fetch(`${apiBase}/api/demo/preview`)
			.then(r => (r.ok ? r.json() : null))
			.then(d => { if (d?.candidates?.length) setPreview(d.candidates.slice(0, 3)); })
			.catch(() => {});
	}, [apiBase]);

	const previewRows = preview.length > 0 ? preview : [
		{ name: 'Jessica Taylor', github: 'jesscloud', sourcing_score: 85, inflated_claims: 0 },
		{ name: 'Alex Rivera', github: 'riveradevops', sourcing_score: 45, inflated_claims: 2 },
		{ name: 'Carlos Gomez', github: 'carlosfront', sourcing_score: 80, inflated_claims: 0 },
	];

	return (
		<div className="landing app-container">
			{/* Nav */}
			<nav className="landing-nav">
				<Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
					<div className="logo-icon">ZS</div>
					<span style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>ZaraSourcing</span>
				</Link>
				<div className="landing-nav-links">
					<a href="#features">Features</a>
					<a href="#how">How it works</a>
					<Link href="/benchmark">Benchmark</Link>
					<Link href="/demo">Demo guide</Link>
				</div>
				<div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
					<Link href="/company/login" className="btn btn-primary" style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}>Start hiring</Link>
					<Link href="/apply/devops_job" className="btn btn-secondary" style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}>Apply</Link>
				</div>
			</nav>

			{/* Hero */}
			<section className="landing-hero">
				<div className="landing-badge">
					<span className="landing-badge-dot" />
					Agentic hiring platform
				</div>
				<h1 className="landing-headline">
					Hire engineers based on<br /><em>what they actually built</em>
				</h1>
				<p className="landing-sub">
					micro1&apos;s <strong>Zara</strong> agent runs AI voice interviews — but can&apos;t verify whether resume claims match GitHub code.
					<strong> ZaraSourcing</strong> adds code-grounded audit (Bedrock + cited evidence), AR proctoring, and a recruiter dashboard. The agent recommends; you decide.
				</p>
				<div className="landing-cta-row">
					<Link href="/demo" className="btn btn-primary" style={{ padding: '0.85rem 1.75rem', fontSize: '0.95rem' }}>
						Video walkthrough →
					</Link>
					<Link href="/benchmark" className="btn btn-secondary" style={{ padding: '0.85rem 1.75rem', fontSize: '0.95rem' }}>
						Benchmark 60→70%
					</Link>
					<Link href="/report/riveradevops" className="btn btn-secondary" style={{ padding: '0.85rem 1.75rem', fontSize: '0.95rem' }}>
						Fraud caught →
					</Link>
				</div>

				<div className="landing-stats">
					{[
						{ value: '70%', label: 'Agent vs 60% baseline' },
						{ value: '5/5', label: 'Discrepancy cases caught' },
						{ value: '10', label: 'Benchmark test cases' },
					].map(s => (
						<div key={s.label} style={{ textAlign: 'center' }}>
							<div className="landing-stat-value">{s.value}</div>
							<div className="landing-stat-label">{s.label}</div>
						</div>
					))}
				</div>

				<div className="landing-preview fade-in-up">
					<div className="landing-preview-bar">
						<span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
						<span style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
						<span style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
						<span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>company/dashboard</span>
					</div>
					<div className="landing-preview-body">
						<div className="landing-preview-sidebar">
							<p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>Open roles</p>
							{['Senior Go Engineer', 'Frontend Lead', 'DevOps SRE'].map((j, i) => (
								<div key={j} style={{ padding: '0.5rem 0.65rem', borderRadius: '0.35rem', marginBottom: '0.35rem', fontSize: '0.8rem', background: i === 0 ? 'rgba(6,182,212,0.1)' : 'transparent', color: i === 0 ? 'var(--color-accent)' : 'var(--text-secondary)', border: i === 0 ? '1px solid rgba(6,182,212,0.2)' : '1px solid transparent' }}>{j}</div>
							))}
						</div>
						<div className="landing-preview-main">
							<p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Audit Rankings (live demo data)</p>
							{previewRows.map(c => (
								<div key={c.github} className="landing-preview-row">
									<span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{c.name}</span>
									<div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
										<span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: c.sourcing_score >= 75 ? '#10b981' : '#ef4444' }}>{c.sourcing_score}%</span>
										<span style={{ fontSize: '0.7rem', padding: '0.15rem 0.45rem', borderRadius: '0.25rem', background: c.sourcing_score >= 75 ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)', color: c.sourcing_score >= 75 ? '#10b981' : '#ef4444', fontWeight: 700 }}>
											{c.inflated_claims > 0 ? `${c.inflated_claims} FLAGGED` : 'VERIFIED'}
										</span>
									</div>
								</div>
							))}
						</div>
					</div>
				</div>
			</section>

			<section className="landing-section" id="how">
				<div className="landing-section-header">
					<h2>From application to ranked shortlist</h2>
					<p>Candidates apply with a resume, receive a private interview link, and companies review ranked results.</p>
				</div>
				<div className="landing-steps">
					{[
						{ num: '01', title: 'Company posts a role', desc: 'Create a job and AI interview questions. Share one apply link.' },
						{ num: '02', title: 'Candidate applies', desc: 'Resume stored in S3 (or local dev). GitHub username captured for audit.' },
						{ num: '03', title: 'Code audit agent runs', desc: 'Bedrock/Gemini agent lists repos, reads files, saves cited claim verdicts.' },
						{ num: '04', title: 'Zara voice interview + AR', desc: 'Private link — Polly/Bedrock voice, MediaPipe gaze, multi-face & phone alerts.' },
						{ num: '05', title: 'Recruiter decides', desc: 'Dashboard ranks applicants. Agent recommends — qualified human makes the hire call.' },
					].map(s => (
						<div key={s.num} className="landing-step">
							<div className="landing-step-num">{s.num}</div>
							<h3>{s.title}</h3>
							<p>{s.desc}</p>
						</div>
					))}
				</div>
			</section>

			<section className="landing-section" id="features" style={{ paddingTop: 0 }}>
				<div className="landing-section-header">
					<h2>Technical Safeguards &amp; Architecture</h2>
					<p>Enterprise-grade tools built to evaluate actual capabilities.</p>
				</div>
				<div className="landing-features">
					{[
						{ icon: '🤖', title: 'AI-Powered Screening', desc: 'Automatically audit resumes against actual code commits to surface the most capable candidates.' },
						{ icon: '👀', title: 'Anti-Plagiarism Protection', desc: 'Advanced tracking ensures candidate authenticity during assessments, detecting distractions and unauthorized assistance.' },
						{ icon: '🎙', title: 'Real-time Voice Interviews', desc: 'Conduct lifelike technical interviews using dynamic, human-quality AI voice interactions.' },
						{ icon: '🎥', title: 'Comprehensive Analytics', desc: 'Review candidate sessions securely anytime with archived video playbacks and detailed performance breakdowns.' },
						{ icon: '⚡', title: 'Code-Grounded Agent', desc: 'GitHub tools cite file-level evidence. 70% verdict accuracy vs 60% text-only baseline — reproducible via make evaluate.' },
						{ icon: '🛡', title: 'Fraud Detection', desc: 'Catches 5/5 discrepancy cases baseline misses (1/5) — exaggerated and failed claims with repo evidence.' },
					].map(f => (
						<div key={f.title} className="landing-feature">
							<div className="landing-feature-icon">{f.icon}</div>
							<h3>{f.title}</h3>
							<p>{f.desc}</p>
						</div>
					))}
				</div>
			</section>

			<section className="landing-section" style={{ paddingTop: 0 }}>
				<div className="landing-section-header">
					<h2>Why teams switch from keyword ATS</h2>
				</div>
				<div className="landing-compare">
					<table>
						<thead>
							<tr>
								<th>Capability</th>
								<th>Keyword ATS</th>
								<th className="highlight">ZaraSourcing</th>
							</tr>
						</thead>
						<tbody>
							{[
								['Resume screening', 'Keyword match only', 'Agent + GitHub code audit'],
								['Interview', 'Manual scheduling', 'Private AI voice link per candidate'],
								['Proctoring', 'None', 'AR gaze, tab, multi-face, phone'],
								['Recordings', 'N/A', 'Company admin only'],
								['Fraud detection', 'Misses 4/4 test cases', 'Catches all 4/4'],
							].map(([cap, ats, zs]) => (
								<tr key={cap}>
									<td>{cap}</td>
									<td>{ats}</td>
									<td className="highlight">{zs}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</section>

			<section className="landing-section" style={{ paddingTop: 0 }}>
				<div className="landing-cta-banner">
					<h2>Ready to hire with evidence?</h2>
					<p>Companies post roles. Candidates apply and interview via their private link.</p>
					<div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
						<Link href="/company/login" className="btn btn-primary" style={{ padding: '0.85rem 1.75rem' }}>Company login</Link>
						<Link href="/apply/devops_job" className="btn btn-secondary" style={{ padding: '0.85rem 1.75rem' }}>Apply as candidate</Link>
					</div>
				</div>
			</section>

			<footer className="landing-footer">
				<div className="landing-footer-links">
					<Link href="/company/login">Company login</Link>
					<Link href="/apply/devops_job">Apply</Link>
				</div>
				<p>© {new Date().getFullYear()} ZaraSourcing</p>
			</footer>
		</div>
	);
}
