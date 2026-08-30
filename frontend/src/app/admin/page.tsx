'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Stats { total_companies: number; total_jobs: number; total_candidates: number; completed_interviews: number; }
interface Company { id: string; name: string; email: string; plan: string; created_at: string; }

export default function AdminPage() {
	const [stats, setStats] = useState<Stats | null>(null);
	const [companies, setCompanies] = useState<Company[]>([]);
	const [loading, setLoading] = useState(true);
	const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

	useEffect(() => {
		Promise.all([
			fetch(`${apiBase}/api/admin/stats`).then(r => r.json()),
			fetch(`${apiBase}/api/admin/companies`).then(r => r.json()),
		]).then(([s, c]) => {
			setStats(s);
			setCompanies(c || []);
		}).finally(() => setLoading(false));
	}, [apiBase]);

	if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p style={{ color: 'var(--text-secondary)' }}>Loading platform analytics...</p></div>;

	return (
		<div className="app-container" style={{ paddingBottom: '4rem' }}>
			<header className="header">
				<div className="header-title-wrapper">
					<Link href="/" style={{ textDecoration: 'none' }}>
						<div className="logo-icon" style={{ background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)' }}>SA</div>
					</Link>
					<div>
						<h1 style={{ fontSize: '1.5rem' }}>Platform Admin</h1>
						<p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>ZaraSourcing — Super Admin Analytics</p>
					</div>
				</div>
				<Link href="/" className="btn btn-secondary" style={{ fontSize: '0.85rem' }}>← Back to Home</Link>
			</header>

			{/* Stats */}
			<div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.25rem', marginBottom: '2rem' }}>
				{[
					{ label: 'Companies', value: stats?.total_companies ?? 0, color: 'var(--color-accent)' },
					{ label: 'Job Openings', value: stats?.total_jobs ?? 0, color: '#a855f7' },
					{ label: 'Total Applicants', value: stats?.total_candidates ?? 0, color: '#f59e0b' },
					{ label: 'Completed Interviews', value: stats?.completed_interviews ?? 0, color: '#10b981' },
				].map(({ label, value, color }) => (
					<div key={label} style={{ padding: '1.5rem', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: '0.75rem' }}>
						<p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600, margin: 0 }}>{label}</p>
						<p style={{ fontSize: '2.25rem', fontWeight: 900, color, margin: '0.25rem 0 0 0', fontFamily: 'var(--font-mono)' }}>{value}</p>
					</div>
				))}
			</div>

			{/* Companies table */}
			<div className="panel" style={{ padding: '1.5rem' }}>
				<h3 style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '1.25rem' }}>All Companies ({companies.length})</h3>
				{companies.length === 0 ? (
					<p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0', fontSize: '0.9rem' }}>No companies registered yet.</p>
				) : (
					<div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
						<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px 120px', gap: '1rem', padding: '0.5rem 1rem', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
							<span>Company</span><span>Email</span><span>Plan</span><span>Joined</span>
						</div>
						{companies.map(c => (
							<div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px 120px', gap: '1rem', padding: '0.85rem 1rem', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: '0.5rem', alignItems: 'center' }}>
								<p style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)', margin: 0 }}>{c.name}</p>
								<p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>{c.email}</p>
								<span style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '0.25rem', background: c.plan === 'enterprise' ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.05)', color: c.plan === 'enterprise' ? 'var(--color-accent)' : 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', display: 'inline-block' }}>
									{c.plan}
								</span>
								<p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>{new Date(c.created_at).toLocaleDateString()}</p>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
