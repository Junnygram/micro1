'use client';
import { getApiBase } from '@/lib/api';

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
	has_live_audits?: boolean;
	score?: string;
}

interface BenchmarkData {
	source?: string;
	reproduce_cmd?: string;
	computed_at?: string;
	evaluated_at?: string;
	live_cases?: number;
	baseline_source?: string;
	baseline_accuracy_pct: number;
	agent_accuracy_pct: number;
	baseline_correct: number;
	agent_correct: number;
	total_cases: number;
	fraud_cases_total: number;
	baseline_fraud_caught: number;
	agent_fraud_caught: number;
	cases: BenchmarkCase[];
}

export default function BenchmarkPage() {
	const [data, setData] = useState<BenchmarkData | null>(null);
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(true);
	const apiBase = getApiBase();

	useEffect(() => {
		setLoading(true);
		setError('');
		fetch(`${apiBase}/api/benchmark`)
			.then(async r => {
				if (!r.ok) throw new Error('Benchmark API unavailable');
				return r.json();
			})
			.then(json => {
				if (json?.cases?.length) setData(json);
				else throw new Error('No benchmark cases returned');
			})
			.catch(err => setError((err as Error).message))
			.finally(() => setLoading(false));
	}, [apiBase]);

	const sourceLabel = (() => {
		if (!data?.source) return '';
		if (data.source.includes('evaluate') || data.reproduce_cmd) {
			return `Canonical results from \`make evaluate\` — same file judges reproduce locally`;
		}
		return 'Run make evaluate from repo root to generate benchmark_results.json';
	})();

	if (loading) {
		return (
			<div className="app-container" style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
				Loading benchmark results…
			</div>
		);
	}

	if (error || !data) {
		return (
			<div className="app-container" style={{ padding: '4rem', textAlign: 'center' }}>
				<p style={{ color: '#f87171', marginBottom: '1rem' }}>{error || 'Benchmark unavailable'}</p>
				<Link href="/" className="btn btn-secondary">← Home</Link>
			</div>
		);
	}

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
							{data.computed_at && <> · computed {new Date(data.computed_at).toLocaleString()}</>}
						</p>
					</div>
				</div>
				<Link href="/company/login" className="btn btn-primary" style={{ fontSize: '0.85rem' }}>Open app →</Link>
			</header>

			<div style={{
				padding: '0.85rem 1rem',
				marginBottom: '1.5rem',
				borderRadius: '0.5rem',
				background: 'rgba(16,185,129,0.08)',
				border: '1px solid rgba(16,185,129,0.35)',
				fontSize: '0.85rem',
				color: 'var(--text-secondary)',
			}}>
				<strong style={{ color: '#6ee7b7' }}>● Reproducible benchmark</strong>
				{' — '}{sourceLabel}
				{data.evaluated_at && <> · last evaluated {data.evaluated_at}</>}
				{' · '}Scores from <code>backend/data/benchmark_results.json</code> — reproduce with <code>make evaluate</code>.
			</div>

			<div className="stats-grid" style={{ marginBottom: '2rem' }}>
				<div className="stat-card">
					<span className="stat-label">Baseline</span>
					<span className="stat-value failed">{data.baseline_correct}/{data.total_cases}</span>
					<span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{data.baseline_accuracy_pct}% · text-only</span>
				</div>
				<div className="stat-card">
					<span className="stat-label">Agent (evaluated)</span>
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
						</tr>
					</thead>
					<tbody>
						{cases.map(c => (
							<tr key={c.github} style={c.highlight ? { background: 'rgba(16,185,129,0.05)' } : undefined}>
								<td>
									<strong>{c.name}</strong>
									<br />
									<span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>@{c.github}</span>
									{c.has_live_audits === false && (
										<span style={{ display: 'block', fontSize: '0.65rem', color: '#fbbf24' }}>no live audits</span>
									)}
								</td>
								<td><code style={{ fontSize: '0.8rem' }}>{c.target}</code></td>
								<td><code style={{ fontSize: '0.8rem', color: c.baseline === c.target ? '#10b981' : '#ef4444' }}>{c.baseline}</code></td>
								<td>
									<code style={{
										fontSize: '0.8rem',
										color: c.agent === 'missing' ? '#fbbf24' : (c.agent === c.target ? '#10b981' : '#ef4444'),
									}}>{c.agent}</code>
									{c.score && <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)' }}>{c.score}</span>}
								</td>
								<td>{c.correct ? '✅' : '❌'}{c.note && <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)' }}>{c.note}</span>}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			<div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
				<Link href="/company/login" className="btn btn-primary">Sign in to run audits →</Link>
				<Link href="/apply/default_job" className="btn btn-secondary">Try demo CVs on apply →</Link>
				<a href="https://github.com/Junnygram/micro1/blob/main/REPRODUCTION.md" target="_blank" rel="noreferrer" className="btn btn-secondary">Full re-run: make evaluate</a>
			</div>
		</div>
	);
}
