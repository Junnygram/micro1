'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface ClaimAudit {
	claim_text: string;
	evidence_text: string;
	file_path: string;
	status: 'verified' | 'exaggerated' | 'failed';
	severity: string;
}

interface ReportData {
	candidate: { id: string; name: string; github_username: string; role: string; sourcing_score: number; status: string };
	audits: ClaimAudit[];
	proctoring: { event_type: string; details: string; timestamp: string }[];
	benchmark: { target?: string; baseline?: string; agent?: string; correct?: boolean };
}

export default function PublicReportPage() {
	const { github } = useParams() as { github: string };
	const [data, setData] = useState<ReportData | null>(null);
	const [error, setError] = useState('');
	const [selected, setSelected] = useState<ClaimAudit | null>(null);
	const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

	useEffect(() => {
		fetch(`${apiBase}/api/demo/report?github=${encodeURIComponent(github)}`)
			.then(async res => {
				if (!res.ok) throw new Error('Report not found');
				return res.json();
			})
			.then(json => {
				setData(json);
				const inflated = json.audits?.find((a: ClaimAudit) => a.status === 'exaggerated' || a.status === 'failed');
				setSelected(inflated || json.audits?.[0] || null);
			})
			.catch(err => setError((err as Error).message));
	}, [github, apiBase]);

	if (error) {
		return (
			<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
				<div className="panel" style={{ maxWidth: '420px', textAlign: 'center', padding: '2rem' }}>
					<p style={{ color: 'var(--color-failure)', marginBottom: '1rem' }}>{error}</p>
					<Link href="/benchmark" className="btn btn-secondary">← Benchmark</Link>
				</div>
			</div>
		);
	}

	if (!data) {
		return (
			<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
				<p style={{ color: 'var(--text-muted)' }}>Loading report for @{github}…</p>
			</div>
		);
	}

	const { candidate, audits, proctoring, benchmark } = data;
	const inflated = audits.filter(a => a.status === 'exaggerated' || a.status === 'failed');
	const statusColor = (s: string) => s === 'verified' ? '#10b981' : s === 'exaggerated' ? '#f59e0b' : '#ef4444';

	return (
		<div className="app-container" style={{ paddingBottom: '4rem' }}>
			<header className="header">
				<div className="header-title-wrapper">
					<Link href="/" style={{ textDecoration: 'none' }}><div className="logo-icon">ZS</div></Link>
					<div>
						<h1 style={{ fontSize: '1.5rem' }}>{candidate.name}</h1>
						<p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Public audit report · @{candidate.github_username}</p>
					</div>
				</div>
				<div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
					<Link href="/benchmark" className="btn btn-secondary" style={{ fontSize: '0.8rem' }}>Benchmark</Link>
					<Link href={`/audit/${github}`} className="btn btn-primary" style={{ fontSize: '0.8rem' }}>Full workspace →</Link>
				</div>
			</header>

			{inflated.length > 0 && (
				<div style={{ marginBottom: '1.5rem', padding: '1.25rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: '0.75rem' }}>
					<p style={{ fontWeight: 800, color: '#ef4444', margin: 0 }}>Resume inflation detected — {inflated.length} claim{inflated.length !== 1 ? 's' : ''} flagged</p>
					<p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.35rem 0 0' }}>
						Text-only baseline scored this candidate as <strong>{benchmark.baseline || 'verified'}</strong>. Code-grounded agent: <strong style={{ color: '#10b981' }}>{benchmark.agent || 'exaggerated'}</strong>.
					</p>
				</div>
			)}

			<div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
				<div className="stat-card">
					<span className="stat-label">Audit score</span>
					<span className="stat-value" style={{ color: candidate.sourcing_score >= 75 ? '#10b981' : candidate.sourcing_score >= 50 ? '#f59e0b' : '#ef4444' }}>
						{candidate.sourcing_score}%
					</span>
				</div>
				<div className="stat-card">
					<span className="stat-label">Claims audited</span>
					<span className="stat-value">{audits.length}</span>
				</div>
				<div className="stat-card">
					<span className="stat-label">Inflated / failed</span>
					<span className="stat-value failed">{inflated.length}</span>
				</div>
				<div className="stat-card">
					<span className="stat-label">Proctoring events</span>
					<span className="stat-value">{proctoring.length}</span>
				</div>
			</div>

			{benchmark.target && (
				<div className="panel" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
					<p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.75rem' }}>Baseline vs Agent (benchmark)</p>
					<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', textAlign: 'center' }}>
						<div>
							<p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Ground truth</p>
							<p style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#a855f7' }}>{benchmark.target}</p>
						</div>
						<div>
							<p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Text-only baseline</p>
							<p style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: benchmark.baseline === benchmark.target ? '#10b981' : '#ef4444' }}>{benchmark.baseline}</p>
						</div>
						<div>
							<p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Code-grounded agent</p>
							<p style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: benchmark.agent === benchmark.target ? '#10b981' : '#ef4444' }}>{benchmark.agent}</p>
						</div>
					</div>
				</div>
			)}

			<div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.2fr)', gap: '1.5rem' }}>
				<div className="panel" style={{ padding: '1rem' }}>
					<p style={{ fontWeight: 700, marginBottom: '0.75rem' }}>Claim audits</p>
					{audits.map((a, i) => (
						<button
							key={i}
							onClick={() => setSelected(a)}
							style={{
								display: 'block', width: '100%', textAlign: 'left', padding: '0.85rem', marginBottom: '0.5rem',
								background: selected === a ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.02)',
								border: `1px solid ${selected === a ? 'var(--color-accent)' : 'var(--border-color)'}`,
								borderRadius: '0.5rem', cursor: 'pointer', color: 'inherit',
							}}
						>
							<p style={{ fontSize: '0.85rem', fontWeight: 600, margin: '0 0 0.35rem' }}>&ldquo;{a.claim_text.slice(0, 80)}{a.claim_text.length > 80 ? '…' : ''}&rdquo;</p>
							<span style={{ fontSize: '0.7rem', fontWeight: 700, color: statusColor(a.status) }}>{a.status.toUpperCase()}</span>
						</button>
					))}
				</div>

				{selected && (
					<div className="panel" style={{ padding: '1.5rem' }}>
						<div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
							<p style={{ fontWeight: 700 }}>Evidence citation</p>
							<span style={{ fontSize: '0.7rem', fontWeight: 700, color: statusColor(selected.status) }}>{selected.status.toUpperCase()}</span>
						</div>
						<p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '1rem' }}>{selected.evidence_text}</p>
						<div style={{ background: '#09070a', borderRadius: '0.5rem', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
							<div style={{ padding: '0.5rem 1rem', fontSize: '0.75rem', color: 'var(--text-muted)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
								📂 {selected.file_path}
							</div>
							<pre style={{ padding: '1rem', fontSize: '0.8rem', color: '#10b981', fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.5 }}>
								{selected.evidence_text}
							</pre>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
