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
					<a href="#how">Product</a>
					<a href="#features">Platform</a>
					<Link href="/report/riveradevops">Sample report</Link>
				</div>
				<div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
					<Link href="/company/login" className="btn btn-secondary" style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}>Sign in</Link>
					<Link href="/company/login" className="btn btn-primary" style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}>Start hiring</Link>
				</div>
			</nav>

			{/* Hero */}
			<section className="landing-hero">
				<div className="landing-badge">
					<span className="landing-badge-dot" />
					Technical hiring, with evidence
				</div>
				<h1 className="landing-headline">
					Hire engineers based on<br /><em>what they actually built</em>
				</h1>
				<p className="landing-sub">
					ZaraSourcing reads a candidate&apos;s GitHub against their resume, runs a proctored voice interview, and ranks the pipeline for you. Every score cites a file. You still make the hire.
				</p>
				<div className="landing-cta-row">
					<Link href="/company/login" className="btn btn-primary" style={{ padding: '0.85rem 1.75rem', fontSize: '0.95rem' }}>
						Open the hiring desk →
					</Link>
					<Link href="/report/riveradevops" className="btn btn-secondary" style={{ padding: '0.85rem 1.75rem', fontSize: '0.95rem' }}>
						See a sample audit
					</Link>
				</div>

				<div className="landing-stats">
					{[
						{ value: 'Cited', label: 'Every claim maps to a repo file' },
						{ value: 'Live', label: 'Voice interview, camera on' },
						{ value: 'Yours', label: 'The agent recommends. You decide.' },
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
							<p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Pipeline · DevOps SRE</p>
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
					<p>One apply link. A private interview. A ranked shortlist with citations — not keyword scores.</p>
				</div>
				<div className="landing-steps">
					{[
						{ num: '01', title: 'Post the role', desc: 'Add the job, set the interview questions, copy the apply link.' },
						{ num: '02', title: 'Candidate applies', desc: 'Name, resume, GitHub. No recruiter calendar required.' },
						{ num: '03', title: 'Code is audited', desc: 'The agent opens their repos, reads the files, and grades each resume claim.' },
						{ num: '04', title: 'Voice interview', desc: 'A private link. Questions spoken aloud. Camera on. Integrity events logged.' },
						{ num: '05', title: 'You decide', desc: 'Ranked pipeline, cited evidence, interview scores. The hire is still yours.' },
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
					<h2>Built for hiring teams, not keyword filters</h2>
					<p>Screening, interview, and integrity in one product — with a paper trail a recruiter can defend.</p>
				</div>
				<div className="landing-features">
					{[
						{ icon: '01', title: 'Claim audit', desc: 'Every resume claim is checked against real repositories. Verdicts cite the file the agent read.' },
						{ icon: '02', title: 'Integrity', desc: 'Gaze, a second person in frame, phones, and tab switches are logged on the candidate record.' },
						{ icon: '03', title: 'Voice interviews', desc: 'Questions are spoken. Candidates answer out loud. Transcripts are scored automatically.' },
						{ icon: '04', title: 'Session archive', desc: 'Interview video stays with the hiring team. Replay the session when you need a second look.' },
						{ icon: '05', title: 'Ranked pipeline', desc: 'Composite scores from code evidence and the interview — not a keyword match on the PDF.' },
						{ icon: '06', title: 'Human in the loop', desc: 'The agent recommends. A recruiter still makes the call, with the citations in front of them.' },
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
								['Resume screening', 'Keyword match only', 'GitHub audit with file citations'],
								['Interview', 'Calendar ping-pong', 'Private voice interview, on demand'],
								['Integrity', 'Honor system', 'Gaze, devices, extra faces, tab switches'],
								['Recordings', 'Scattered or none', 'Held by the hiring company'],
								['Inflated resumes', 'Usually pass', 'Flagged with evidence'],
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
					<p>Post a role. Candidates apply and interview on their own time. You review a ranked shortlist.</p>
					<div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
						<Link href="/company/login" className="btn btn-primary" style={{ padding: '0.85rem 1.75rem' }}>Start hiring</Link>
						<Link href="/apply/devops_job" className="btn btn-secondary" style={{ padding: '0.85rem 1.75rem' }}>Apply for a role</Link>
					</div>
				</div>
			</section>

			<footer className="landing-footer">
				<div className="landing-footer-links">
					<Link href="/company/login">Sign in</Link>
					<Link href="/apply/devops_job">Careers</Link>
					<Link href="/benchmark">Accuracy</Link>
				</div>
				<p>© {new Date().getFullYear()} ZaraSourcing</p>
			</footer>
		</div>
	);
}
