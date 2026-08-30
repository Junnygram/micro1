'use client';
import { getApiBase } from '@/lib/api';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

function DeployStatus({ apiBase }: { apiBase: string }) {
	const [status, setStatus] = useState<{
		demo_candidates?: number;
		alex_score?: number;
		alex_audits?: number;
		ready_for_demo?: boolean;
		benchmark?: { baseline_pct?: number; agent_pct?: number; fraud_agent_caught?: number; fraud_total?: number };
	} | null>(null);
	const [err, setErr] = useState('');

	useEffect(() => {
		fetch(`${apiBase}/api/demo/status`)
			.then(r => (r.ok ? r.json() : Promise.reject(new Error('Backend unreachable'))))
			.then(setStatus)
			.catch(e => setErr((e as Error).message));
	}, [apiBase]);

	if (err) {
		return (
			<p style={{ fontSize: '0.75rem', color: '#f59e0b', marginTop: '0.75rem' }}>
				⚠ Deploy check: backend not reachable — redeploy backend + frontend with latest code.
			</p>
		);
	}
	if (!status) return null;
	const ok = status.ready_for_demo === true || ((status.demo_candidates ?? 0) >= 10 && status.alex_score === 45 && (status.alex_audits ?? 0) >= 1);
	const b = status.benchmark;
	return (
		<div style={{ fontSize: '0.75rem', marginTop: '0.75rem', lineHeight: 1.5 }}>
			<p style={{ color: ok ? '#10b981' : '#f59e0b', margin: 0 }}>
				{ok ? '✓' : '⚠'} Deploy: {status.demo_candidates ?? 0} candidates · Alex {status.alex_score ?? '—'}% (want 45) · {status.alex_audits ?? 0} audit(s)
				{!ok && ' — redeploy backend with SQLite volume on data/'}
			</p>
			{b?.agent_pct != null && (
				<p style={{ color: 'var(--text-muted)', margin: '0.35rem 0 0' }}>
					Benchmark file: {b.baseline_pct}% baseline → {b.agent_pct}% agent · fraud {b.fraud_agent_caught}/{b.fraud_total}
				</p>
			)}
		</div>
	);
}

/** Matches WALKTHROUGH.md — same order as the Loom script */
const STEPS = [
	{
		num: 1,
		title: 'The problem: Zara vs resume fraud',
		desc: 'micro1\'s Zara agent runs AI voice interviews — but cannot verify GitHub claims. ZaraSourcing adds code-grounded audit with cited evidence. Agent recommends; recruiter decides.',
		cta: 'See the product',
		href: '/',
	},
	{
		num: 2,
		title: 'Benchmark proof (make evaluate)',
		desc: '60% baseline (text-only) → 70% agent (GitHub tools). Discrepancy cases: baseline 1/5, agent 5/5. Numbers from benchmark_results.json — reproducible via make evaluate.',
		cta: 'Open benchmark',
		href: '/benchmark',
		noKeys: true,
	},
	{
		num: 3,
		title: 'Public fraud report — Alex Rivera',
		desc: 'No login. DevOps claims vs empty repos — exaggerated with evidence. Baseline would have passed; agent caught it.',
		cta: 'View fraud report',
		href: '/report/riveradevops',
		highlight: true,
		noKeys: true,
	},
	{
		num: 4,
		title: 'Company dashboard',
		desc: 'Jobs, applicants, composite scores, Recruiter AI chat, candidate compare. 10 seeded candidates — Alex at 45%.',
		cta: 'Open hiring desk',
		href: '/company/login',
		demoLogin: true,
		noKeys: true,
	},
	{
		num: 5,
		title: 'Audit workspace + replay',
		desc: 'From dashboard → Alex Rivera. Claims, evidence, agent trajectory replay. Do not re-run live audit on demo rows.',
		cta: 'Open dashboard first',
		href: '/company/dashboard',
		demoLogin: true,
		noKeys: true,
	},
	{
		num: 6,
		title: 'Voice interview + AR proctoring',
		desc: 'AI asks out loud, you speak answers, live face mesh on the right. Integrity verdicts come from Amazon Rekognition: hold up a phone and it returns the label with confidence. Also flags a second person, head pose off-screen, and tab switches.',
		cta: 'Start interview',
		launchInterview: true,
		highlight: true,
		noKeys: true,
	},
	{
		num: 7,
		title: 'Candidate apply flow',
		desc: 'Real application form — resume upload, GitHub username, then private interview link. No benchmark shortcuts on the public apply page.',
		cta: 'Open apply form',
		href: '/apply/devops_job',
		noKeys: true,
	},
	{
		num: 8,
		title: 'Reproduce locally',
		desc: 'make verify-benchmark (no key) · make evaluate (Gemini key, ~2–5 min) · trajectories in backend/data/trajectories/',
		cta: 'Reproduction guide',
		href: 'https://github.com/Junnygram/micro1/blob/main/REPRODUCTION.md',
		external: true,
	},
];

export default function DemoGuidePage() {
	const [active, setActive] = useState(0);
	const [loggingIn, setLoggingIn] = useState(false);
	const [launchingInterview, setLaunchingInterview] = useState(false);
	const router = useRouter();
	const apiBase = getApiBase();

	const launchDemoInterview = async () => {
		setLaunchingInterview(true);
		try {
			const res = await fetch(`${apiBase}/api/demo/interview`, { method: 'POST' });
			if (!res.ok) throw new Error('Could not start demo interview');
			const data = await res.json();
			const path = data.path || (data.token ? `/interview/${data.token}` : '');
			if (!path) throw new Error('No interview token returned');
			router.push(path);
		} catch (e) {
			alert((e as Error).message);
		} finally {
			setLaunchingInterview(false);
		}
	};

	const demoLogin = async () => {
		setLoggingIn(true);
		try {
			const res = await fetch(`${apiBase}/api/companies/login`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: 'demo@zarasourcing.com', password: 'demo123' }),
			});
			if (!res.ok) throw new Error('Demo login failed');
			const data = await res.json();
			localStorage.setItem('company', JSON.stringify(data));
			router.push('/company/dashboard');
		} catch {
			router.push('/company/login');
		} finally {
			setLoggingIn(false);
		}
	};

	const step = STEPS[active];

	return (
		<div className="app-container" style={{ paddingBottom: '4rem', maxWidth: '720px', margin: '0 auto' }}>
			<header className="header" style={{ marginBottom: '1.5rem' }}>
				<div className="header-title-wrapper">
					<Link href="/" style={{ textDecoration: 'none' }}><div className="logo-icon">ZS</div></Link>
					<div>
						<h1 style={{ fontSize: '1.5rem' }}>Product tour</h1>
						<p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Walk the hiring flow in order</p>
					</div>
				</div>
				<Link href="/" className="btn btn-secondary" style={{ fontSize: '0.8rem' }}>← Home</Link>
			</header>

			<div className="panel" style={{ padding: '1.25rem', marginBottom: '1.25rem' }}>
				<p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
					Start here if you want a guided path through the product — audit, hiring desk, then the voice interview.
				</p>
			</div>

			<div style={{ display: 'flex', gap: '0.35rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
				{STEPS.map((s, i) => (
					<button
						key={s.num}
						onClick={() => setActive(i)}
						style={{
							width: '32px', height: '32px', borderRadius: '50%', border: 'none', cursor: 'pointer',
							fontWeight: 800, fontSize: '0.75rem',
							background: i === active ? 'var(--color-accent)' : 'rgba(255,255,255,0.05)',
							color: i === active ? '#fff' : 'var(--text-muted)',
						}}
					>
						{s.num}
					</button>
				))}
			</div>

			<div className="panel" style={{ padding: '2rem', marginBottom: '1.5rem', border: step.highlight ? '1px solid rgba(16,185,129,0.4)' : undefined }}>
				<p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-accent)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>
					Step {step.num} of {STEPS.length}
				</p>
				<h2 style={{ fontSize: '1.35rem', fontWeight: 800, marginBottom: '0.75rem' }}>{step.title}</h2>
				<p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '1rem' }}>{step.desc}</p>
				{step.noKeys && (
					<span style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: '0.25rem', background: 'rgba(16,185,129,0.12)', color: '#10b981', fontWeight: 700, display: 'inline-block', marginBottom: '1rem' }}>
						Ready to try
					</span>
				)}
				<div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
					{step.launchInterview ? (
						<button className="btn btn-primary" onClick={launchDemoInterview} disabled={launchingInterview}>
							{launchingInterview ? 'Opening interview…' : 'Start interview'}
						</button>
					) : step.demoLogin ? (
						<button className="btn btn-primary" onClick={demoLogin} disabled={loggingIn}>
							{loggingIn ? 'Signing in…' : 'Open hiring desk'}
						</button>
					) : step.external ? (
						<a href={step.href} className="btn btn-primary" target="_blank" rel="noreferrer">{step.cta} →</a>
					) : (
						<Link href={step.href || '/'} className="btn btn-primary">{step.cta} →</Link>
					)}
					{active < STEPS.length - 1 && (
						<button className="btn btn-secondary" onClick={() => setActive(active + 1)}>Next step →</button>
					)}
				</div>
			</div>

			<div className="panel" style={{ padding: '1.25rem' }}>
				<p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.75rem' }}>Quick links</p>
				<div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
					{[
						{ label: 'Benchmark', href: '/benchmark' },
						{ label: 'Fraud report', href: '/report/riveradevops' },
						{ label: 'Dashboard', href: '/company/dashboard' },
						{ label: 'Voice + AR demo', href: '/demo', onClick: launchDemoInterview },
						{ label: 'Apply', href: '/apply/devops_job' },
					].map(l => (
						l.onClick ? (
							<button key={l.label} className="btn btn-secondary" style={{ fontSize: '0.75rem' }} onClick={l.onClick} disabled={launchingInterview}>
								{l.label}
							</button>
						) : (
							<Link key={l.label} href={l.href} className="btn btn-secondary" style={{ fontSize: '0.75rem' }} target={l.href.startsWith('http') ? '_blank' : undefined}>
								{l.label}
							</Link>
						)
					))}
				</div>
				<p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '1rem' }}>
					Sample workspace: <code style={{ color: 'var(--color-accent)' }}>demo@zarasourcing.com</code>
				</p>
			</div>
		</div>
	);
}
