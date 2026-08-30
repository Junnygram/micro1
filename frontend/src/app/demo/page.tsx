'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const STEPS = [
	{
		num: 1,
		title: 'See the benchmark proof',
		desc: '60% baseline → 70% agent. Fraud cases 0/4 → 4/4. Numbers judges can verify.',
		cta: 'Open benchmark',
		href: '/benchmark',
		external: false,
	},
	{
		num: 2,
		title: 'Sign in to the demo company',
		desc: 'One-click login loads 10 seeded candidates with completed GitHub audits and interview data.',
		cta: 'Demo login',
		href: '/company/login',
		external: false,
		demoLogin: true,
	},
	{
		num: 3,
		title: 'Catch resume fraud (Alex Rivera)',
		desc: 'Public fraud report — no login wall. Agent flagged exaggerated DevOps claims with repo evidence.',
		cta: 'View fraud report',
		href: '/report/riveradevops',
		external: false,
		highlight: true,
	},
	{
		num: 4,
		title: 'Explore the hiring dashboard',
		desc: 'Pipeline stats, composite scores, interview rankings, and per-applicant audit links.',
		cta: 'Open dashboard',
		href: '/company/dashboard',
		external: false,
	},
	{
		num: 5,
		title: 'Try the hands-free voice interview',
		desc: 'Apply as a candidate → get a private interview link. AI asks questions, listens, auto-advances on silence.',
		cta: 'Apply for DevOps role',
		href: '/apply/devops_job',
		external: false,
	},
	{
		num: 6,
		title: 'Apply a benchmark profile (instant audit)',
		desc: 'Apply with GitHub @riveradevops or @junnygram — audit data seeds automatically on submit.',
		cta: 'Apply now',
		href: '/apply/devops_job',
		external: false,
	},
];

export default function DemoGuidePage() {
	const [active, setActive] = useState(0);
	const [loggingIn, setLoggingIn] = useState(false);
	const router = useRouter();
	const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

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
						<h1 style={{ fontSize: '1.5rem' }}>Demo Walkthrough</h1>
						<p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>60-second judge path · {STEPS.length} steps</p>
					</div>
				</div>
				<Link href="/" className="btn btn-secondary" style={{ fontSize: '0.8rem' }}>← Home</Link>
			</header>

			<div style={{ display: 'flex', gap: '0.35rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
				{STEPS.map((s, i) => (
					<button
						key={s.num}
						onClick={() => setActive(i)}
						style={{
							width: '36px', height: '36px', borderRadius: '50%', border: 'none', cursor: 'pointer',
							fontWeight: 800, fontSize: '0.85rem',
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
				<h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.75rem' }}>{step.title}</h2>
				<p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '1.5rem' }}>{step.desc}</p>
				<div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
					{step.demoLogin ? (
						<button className="btn btn-primary" onClick={demoLogin} disabled={loggingIn}>
							{loggingIn ? 'Signing in…' : '⚡ One-click demo login'}
						</button>
					) : (
						<Link href={step.href} className="btn btn-primary">{step.cta} →</Link>
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
						{ label: 'Apply', href: '/apply/devops_job' },
						{ label: 'Reproduce', href: 'https://github.com/Junnygram/micro1/blob/main/REPRODUCTION.md' },
					].map(l => (
						<Link key={l.label} href={l.href} className="btn btn-secondary" style={{ fontSize: '0.75rem' }} target={l.href.startsWith('http') ? '_blank' : undefined}>
							{l.label}
						</Link>
					))}
				</div>
				<p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '1rem' }}>
					Demo credentials: <code style={{ color: 'var(--color-accent)' }}>demo@zarasourcing.com</code> / <code style={{ color: 'var(--color-accent)' }}>demo123</code>
				</p>
			</div>
		</div>
	);
}
