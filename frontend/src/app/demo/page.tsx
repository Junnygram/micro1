'use client';
import { getApiBase } from '@/lib/api';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

type Beat = {
	time: string;
	title: string;
	screen: string;
	href: string;
	external?: boolean;
	say: string;
	do: string;
	skipIfLong?: boolean;
};

/** Official video order from SUBMISSION.md — problem → baseline → run → compare → changelog → keep/remove → reproduce */
const BEATS: Beat[] = [
	{
		time: '0:00–0:40',
		title: 'The bottleneck',
		screen: 'Landing',
		href: '/',
		say: 'Recruiters have to decide if resume claims are real. An ATS scores keywords. Checking GitHub by hand takes fifteen minutes. That is the bottleneck.',
		do: 'Stay on the hero. Do not scroll. Do not click Start hiring.',
	},
	{
		time: '0:40–1:10',
		title: 'Baseline — 60%',
		screen: 'Benchmark',
		href: '/benchmark',
		say: 'Baseline: one prompt, resume only, no tools. Sixty percent. It clears four inflated resumes because they read well. That is today’s first pass.',
		do: 'Point at Baseline 6/10 and Fraud 1/5. Do not scroll the table yet.',
	},
	{
		time: '1:10–2:40',
		title: 'Alex Rivera — the run',
		screen: 'Fraud report',
		href: '/report/riveradevops',
		say: 'Same case, agent. Alex claims Docker and Helm. The agent listed repos, opened terraform-templates, found only an empty README, marked exaggerated, forty-five percent. Baseline said verified. The recruiter still decides.',
		do: 'Scroll the claim + evidence. Then dashboard → Alex Rivera → View audit replay. Never click Run GitHub Audit.',
	},
	{
		time: '2:40–3:20',
		title: 'Ten cases — 70% / 5 of 5',
		screen: 'Benchmark table',
		href: '/benchmark',
		say: 'Ten cases, both arms. Agent seventy percent. Fraud five of five versus one of five. It also over-flagged three honest engineers. That trade is in the changelog.',
		do: 'Point at Agent 7/10, Fraud 5/5, then the red X rows for junnygram / emilycodes.',
	},
	{
		time: '3:20–4:10',
		title: 'Changelog — keep and remove',
		screen: 'CHANGELOG on GitHub',
		href: 'https://github.com/Junnygram/micro1/blob/main/CHANGELOG.md',
		external: true,
		say: 'Iteration 1 added tools and caught the frauds. The failure: the agent guessed file paths and treated not-found as proof. Iteration 2 added list_repo_files. We removed a fake web-intel tool that never helped.',
		do: 'Stay on the table. Point at Iteration 1, Iteration 2, and Removed.',
	},
	{
		time: '4:10–4:40',
		title: 'Reproduce',
		screen: 'REPRODUCTION.md',
		href: 'https://github.com/Junnygram/micro1/blob/main/REPRODUCTION.md',
		external: true,
		say: 'A second person can run the same ten cases from a clean clone. make verify-benchmark needs no key. make evaluate needs Gemini and takes about two minutes. Trajectories are in the repo.',
		do: 'Start interview if you have time. First line: Zara introduces herself, then tell-me-about-yourself. Skip if the clock is past 4:10.',
		skipIfLong: true,
	},
	{
		time: '4:40–5:00',
		title: 'Close',
		screen: 'Benchmark or repo',
		href: '/benchmark',
		say: 'The agent recommends. A person signs the hire. Demo, changelog, and trajectories are in the submission. Thank you.',
		do: 'Stop recording. Do not open Admin. Do not keep talking.',
	},
];

function formatClock(sec: number) {
	const m = Math.floor(sec / 60);
	const s = sec % 60;
	return `${m}:${s.toString().padStart(2, '0')}`;
}

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
			<p style={{ fontSize: '0.75rem', color: '#f59e0b', margin: 0 }}>
				⚠ Backend not reachable — record on Railway only after both services are up.
			</p>
		);
	}
	if (!status) return null;
	const ok = status.ready_for_demo === true || ((status.demo_candidates ?? 0) >= 10 && status.alex_score === 45 && (status.alex_audits ?? 0) >= 1);
	const b = status.benchmark;
	return (
		<div style={{ fontSize: '0.75rem', lineHeight: 1.5 }}>
			<p style={{ color: ok ? '#10b981' : '#f59e0b', margin: 0 }}>
				{ok ? '✓' : '⚠'} {status.demo_candidates ?? 0} candidates · Alex {status.alex_score ?? '—'}% (want 45)
				{!ok && ' — do not record until Alex is 45'}
			</p>
			{b?.agent_pct != null && (
				<p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0' }}>
					{b.baseline_pct}% → {b.agent_pct}% · fraud {b.fraud_agent_caught}/{b.fraud_total}
				</p>
			)}
		</div>
	);
}

export default function DemoGuidePage() {
	const [active, setActive] = useState(0);
	const [record, setRecord] = useState(false);
	const [running, setRunning] = useState(false);
	const [elapsed, setElapsed] = useState(0);
	const [launchingInterview, setLaunchingInterview] = useState(false);
	const apiBase = getApiBase();
	const beat = BEATS[active];
	const over = elapsed >= 270;
	const dead = elapsed >= 300;

	useEffect(() => {
		if (typeof window === 'undefined') return;
		const q = new URLSearchParams(window.location.search);
		if (q.get('record') === '1') setRecord(true);
	}, []);

	useEffect(() => {
		if (!running) return;
		const id = window.setInterval(() => setElapsed(e => e + 1), 1000);
		return () => window.clearInterval(id);
	}, [running]);

	const next = useCallback(() => setActive(i => Math.min(BEATS.length - 1, i + 1)), []);
	const prev = useCallback(() => setActive(i => Math.max(0, i - 1)), []);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const tag = (e.target as HTMLElement)?.tagName;
			if (tag === 'INPUT' || tag === 'TEXTAREA') return;
			if (e.key === 'n' || e.key === 'N' || e.key === 'ArrowRight') next();
			if (e.key === 'p' || e.key === 'P' || e.key === 'ArrowLeft') prev();
			if (e.key === ' ') {
				e.preventDefault();
				setRunning(r => !r);
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [next, prev]);

	const launchDemoInterview = async () => {
		setLaunchingInterview(true);
		try {
			const res = await fetch(`${apiBase}/api/demo/interview`, { method: 'POST' });
			if (!res.ok) throw new Error('Could not start demo interview');
			const data = await res.json();
			const path = data.path || (data.token ? `/interview/${data.token}` : '');
			if (!path) throw new Error('No interview token returned');
			window.open(path, '_blank');
		} catch (e) {
			alert((e as Error).message);
		} finally {
			setLaunchingInterview(false);
		}
	};

	const demoLogin = async () => {
		try {
			const res = await fetch(`${apiBase}/api/companies/login`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: 'demo@zarasourcing.com', password: 'demo123' }),
			});
			if (!res.ok) throw new Error('Demo login failed');
			const data = await res.json();
			localStorage.setItem('company', JSON.stringify(data));
			window.open('/company/dashboard', '_blank');
		} catch {
			window.open('/company/login', '_blank');
		}
	};

	return (
		<div className="app-container" style={{ paddingBottom: '4rem', maxWidth: '760px', margin: '0 auto' }}>
			<header className="header" style={{ marginBottom: '1.25rem' }}>
				<div className="header-title-wrapper">
					<Link href="/" style={{ textDecoration: 'none' }}><div className="logo-icon">ZS</div></Link>
					<div>
						<h1 style={{ fontSize: '1.35rem' }}>{record ? 'Record the video' : 'Walkthrough'}</h1>
						<p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
							{record ? 'Official order · 4:30 target · 5:00 hard stop' : 'Problem → baseline → Alex → comparison → changelog → reproduce'}
						</p>
					</div>
				</div>
				<div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
					<button
						className="btn btn-primary"
						style={{ fontSize: '0.8rem' }}
						onClick={launchDemoInterview}
						disabled={launchingInterview}
					>
						{launchingInterview ? 'Opening…' : 'Start interview'}
					</button>
					<button
						className={record ? 'btn btn-primary' : 'btn btn-secondary'}
						style={{ fontSize: '0.8rem' }}
						onClick={() => setRecord(r => !r)}
					>
						{record ? 'Exit record mode' : 'Record mode'}
					</button>
					<Link href="/" className="btn btn-secondary" style={{ fontSize: '0.8rem' }}>← Home</Link>
				</div>
			</header>

			{record && <div className="panel" style={{ padding: '1rem 1.25rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', border: dead ? '1px solid #f43f5e' : over ? '1px solid #f59e0b' : undefined }}>
				<div>
					<p style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Elapsed</p>
					<p style={{ fontSize: '2.4rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums', margin: 0, color: dead ? '#f43f5e' : over ? '#f59e0b' : '#fff', lineHeight: 1.1 }}>
						{formatClock(elapsed)}
					</p>
					<p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.2rem 0 0' }}>
						{dead ? 'Hard stop — end now' : over ? 'Past 4:30 — skip interview, close' : 'Target close at 4:30'}
					</p>
				</div>
				<div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
					<button className="btn btn-primary" onClick={() => setRunning(r => !r)}>
						{running ? 'Pause' : elapsed ? 'Resume' : 'Start clock'}
					</button>
					<button className="btn btn-secondary" onClick={() => { setRunning(false); setElapsed(0); setActive(0); }}>
						Reset
					</button>
				</div>
			</div>}

			{record ? (
				<div className="panel" style={{ padding: '1rem 1.25rem', marginBottom: '1rem' }}>
					<p style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Before you hit record</p>
					<ul style={{ margin: 0, paddingLeft: '1.1rem', color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.65 }}>
						<li>Chrome <strong>incognito</strong>. Hide bookmarks (⌘⇧B). Record <strong>this window only</strong>, not the desktop.</li>
						<li>Pre-open five tabs: <code>/</code> · <code>/benchmark</code> · <code>/report/riveradevops</code> · dashboard (login first) · GitHub CHANGELOG.</li>
						<li>Never open <code>/company/admin</code>. Never re-run Alex. Interview is optional and only if you are ahead of the clock.</li>
					</ul>
					<div style={{ marginTop: '0.75rem' }}>
						<DeployStatus apiBase={apiBase} />
					</div>
				</div>
			) : (
				<div className="panel" style={{ padding: '1rem 1.25rem', marginBottom: '1rem' }}>
					<p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 0.75rem' }}>
						Same path as the submission video: bottleneck, text-only baseline, one realistic audit, then the 10-case table. The agent recommends; a recruiter decides.
					</p>
					<DeployStatus apiBase={apiBase} />
				</div>
			)}

			<div style={{ display: 'flex', gap: '0.35rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
				{BEATS.map((b, i) => (
					<button
						key={b.time}
						onClick={() => setActive(i)}
						title={b.title}
						style={{
							minWidth: '36px', height: '32px', borderRadius: '999px', border: 'none', cursor: 'pointer',
							fontWeight: 800, fontSize: '0.7rem', padding: '0 0.55rem',
							background: i === active ? 'var(--color-accent)' : 'rgba(255,255,255,0.05)',
							color: i === active ? '#052026' : 'var(--text-muted)',
						}}
					>
						{i + 1}
					</button>
				))}
			</div>

			<div className="panel" style={{ padding: '1.75rem', marginBottom: '1rem' }}>
				<p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-accent)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.35rem' }}>
					Beat {active + 1} of {BEATS.length} · {beat.time}
				</p>
				<h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.35rem' }}>{beat.title}</h2>
				<p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.1rem' }}>
					Screen: {beat.screen} · {beat.href}
				</p>

				{record ? (
					<>
						<p style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.4rem' }}>Say this</p>
						<p style={{ fontSize: '1.15rem', lineHeight: 1.55, color: '#fff', marginBottom: '1.15rem', fontWeight: 500 }}>
							“{beat.say}”
						</p>
						<p style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.4rem' }}>Do this</p>
						<p style={{ color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: '1.25rem' }}>{beat.do}</p>
					</>
				) : (
					<p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '1.25rem' }}>{beat.say}</p>
				)}

				<div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
					{beat.external ? (
						<a href={beat.href} className="btn btn-primary" target="_blank" rel="noreferrer">Open {beat.screen} →</a>
					) : (
						<Link href={beat.href} className="btn btn-primary" target="_blank">Open {beat.screen} →</Link>
					)}
					{active === 2 && (
						<button className="btn btn-secondary" onClick={demoLogin}>Open dashboard</button>
					)}
					{record && beat.skipIfLong && (
						<button className="btn btn-secondary" onClick={launchDemoInterview} disabled={launchingInterview || elapsed >= 250}>
							{elapsed >= 250 ? 'Skip interview' : launchingInterview ? 'Opening…' : 'Start interview'}
						</button>
					)}
					{active < BEATS.length - 1 && (
						<button className="btn btn-secondary" onClick={next}>Next beat →</button>
					)}
					{active > 0 && (
						<button className="btn btn-secondary" onClick={prev}>← Back</button>
					)}
				</div>
				{record && (
					<p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '0.85rem 0 0' }}>
						Keys: Space start/pause · N next · P back
					</p>
				)}
			</div>

			{record && (
				<div className="panel" style={{ padding: '1.15rem 1.25rem' }}>
					<p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#f43f5e', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Do not say</p>
					<p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.55 }}>
						“Two-question demo.” “Seventy percent interview score.” “The AI hires people.” Sit on an empty Admin page. Leave the bookmark bar visible.
					</p>
				</div>
			)}
		</div>
	);
}
