'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface BenchmarkCase {
	name: string;
	github: string;
	target: string;
	baseline: string;
	agent: string;
	correct: boolean;
	note?: string;
	highlight?: boolean;
}

interface BenchmarkData {
	baseline_accuracy_pct: number;
	agent_accuracy_pct: number;
	baseline_correct: number;
	agent_correct: number;
	total_cases: number;
	fraud_cases_total: number;
	baseline_fraud_caught: number;
	agent_fraud_caught: number;
	evaluated_at?: string;
	cases: BenchmarkCase[];
}

const FALLBACK: BenchmarkData = {
	baseline_accuracy_pct: 60,
	agent_accuracy_pct: 70,
	baseline_correct: 6,
	agent_correct: 7,
	total_cases: 10,
	fraud_cases_total: 4,
	baseline_fraud_caught: 0,
	agent_fraud_caught: 4,
	cases: [
		{ name: 'Jessica Taylor', github: 'jesscloud', target: 'verified', baseline: 'verified', agent: 'verified', correct: true },
		{ name: 'Carlos Gomez', github: 'carlosfront', target: 'verified', baseline: 'verified', agent: 'verified', correct: true },
		{ name: 'Olaleye Oyewunmi', github: 'junnygram', target: 'verified', baseline: 'verified', agent: 'exaggerated', correct: false, note: 'Fixed in Iter 2' },
		{ name: 'Emily Chen', github: 'emilycodes', target: 'verified', baseline: 'verified', agent: 'exaggerated', correct: false, note: 'Fixed in Iter 2' },
		{ name: 'Alex Rivera', github: 'riveradevops', target: 'exaggerated', baseline: 'verified', agent: 'exaggerated', correct: true, highlight: true },
		{ name: 'Michael Chang', github: 'mikecode', target: 'verified', baseline: 'verified', agent: 'exaggerated', correct: false, note: 'Fixed in Iter 2' },
		{ name: 'Raj Patel', github: 'rajconcurrency', target: 'failed', baseline: 'failed', agent: 'failed', correct: true },
		{ name: 'David Kim', github: 'davidsecurity', target: 'failed', baseline: 'verified', agent: 'failed', correct: true },
		{ name: 'Amara Okafor', github: 'amaracodes', target: 'failed', baseline: 'verified', agent: 'failed', correct: true },
		{ name: 'Sarah Jenkins', github: 'sarahml', target: 'exaggerated', baseline: 'verified', agent: 'failed', correct: true },
	],
};

export default function BenchmarkPage() {
	const [data, setData] = useState<BenchmarkData>(FALLBACK);
	const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

	useEffect(() => {
		fetch(`${apiBase}/api/benchmark`)
			.then(r => (r.ok ? r.json() : null))
			.then(json => { if (json?.cases?.length) setData(json); })
			.catch(() => {});
	}, [apiBase]);

	const { cases } = data;

	return (
		<div className="app-container" style={{ paddingBottom: '4rem' }}>
			<header className="header">
				<div className="header-title-wrapper">
					<Link href="/" style={{ textDecoration: 'none' }}><div className="logo-icon">ZS</div></Link>
					<div>
						<h1 style={{ fontSize: '1.5rem' }}>Agent Benchmark</h1>
						<p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
							{data.total_cases} cases · baseline vs agent
							{data.evaluated_at && <> · {data.evaluated_at}</>}
						</p>
					</div>
				</div>
				<Link href="/company/login" className="btn btn-primary" style={{ fontSize: '0.85rem' }}>Open app →</Link>
			</header>

			<div className="stats-grid" style={{ marginBottom: '2rem' }}>
				<div className="stat-card">
					<span className="stat-label">Baseline</span>
					<span className="stat-value failed">{data.baseline_correct}/{data.total_cases}</span>
					<span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{data.baseline_accuracy_pct}% · text-only</span>
				</div>
				<div className="stat-card">
					<span className="stat-label">Agent</span>
					<span className="stat-value passed">{data.agent_correct}/{data.total_cases}</span>
					<span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{data.agent_accuracy_pct}% · GitHub tools</span>
				</div>
				<div className="stat-card">
					<span className="stat-label">Fraud caught</span>
					<span className="stat-value passed">{data.agent_fraud_caught}/{data.fraud_cases_total}</span>
					<span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Baseline: {data.baseline_fraud_caught}/{data.fraud_cases_total}</span>
				</div>
			</div>

			<div className="panel" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
				{[
					{ label: 'Baseline (text-only)', pct: data.baseline_accuracy_pct, color: '#f43f5e' },
					{ label: 'Agent (code-grounded)', pct: data.agent_accuracy_pct, color: '#10b981' },
				].map(row => (
					<div key={row.label} style={{ marginBottom: '1rem' }}>
						<div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.35rem' }}>
							<span style={{ color: 'var(--text-secondary)' }}>{row.label}</span>
							<span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: row.color }}>{row.pct}%</span>
						</div>
						<div style={{ height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
							<div style={{ height: '100%', width: `${row.pct}%`, background: row.color, borderRadius: '4px' }} />
						</div>
					</div>
				))}
			</div>

			<div className="landing-compare" style={{ marginBottom: '2rem' }}>
				<table>
					<thead>
						<tr>
							<th>Candidate</th>
							<th>Truth</th>
							<th>Baseline</th>
							<th>Agent</th>
							<th>✓</th>
							<th>Audit</th>
						</tr>
					</thead>
					<tbody>
						{cases.map(c => (
							<tr key={c.github} style={c.highlight ? { background: 'rgba(16,185,129,0.05)' } : undefined}>
								<td><strong>{c.name}</strong><br /><span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>@{c.github}</span></td>
								<td><code style={{ fontSize: '0.8rem' }}>{c.target}</code></td>
								<td><code style={{ fontSize: '0.8rem', color: c.baseline === c.target ? '#10b981' : '#ef4444' }}>{c.baseline}</code></td>
								<td><code style={{ fontSize: '0.8rem', color: c.agent === c.target ? '#10b981' : '#ef4444' }}>{c.agent}</code></td>
								<td>{c.correct ? '✅' : '❌'}{c.note && <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)' }}>{c.note}</span>}</td>
								<td>
									<Link href={`/report/${c.github}`} style={{ fontSize: '0.75rem', color: 'var(--color-accent)', textDecoration: 'none' }}>
										Report →
									</Link>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			<div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
				<Link href="/company/login" className="btn btn-primary">Sign in to run audits →</Link>
				<a href="https://github.com/Junnygram/micro1/blob/main/REPRODUCTION.md" target="_blank" rel="noreferrer" className="btn btn-secondary">Reproduce: make evaluate</a>
			</div>
		</div>
	);
}
