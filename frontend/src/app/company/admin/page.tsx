'use client';
import { getApiBase } from '@/lib/api';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Candidate {
	id: string;
	name: string;
	email: string;
	role: string;
	github_username: string;
	sourcing_score: number;
	status: string;
	recording_s3_url?: string;
}
interface Session {
	id: string;
	candidate_id: string;
	job_id: string;
	status: string;
	interview_score: number;
	fit_summary: string;
}

function scoreColor(n: number) {
	return n >= 75 ? '#10b981' : n >= 50 ? '#f59e0b' : '#ef4444';
}

function fitLabel(n: number) {
	return n >= 75 ? 'Strong fit' : n >= 50 ? 'Possible fit' : 'Not a fit';
}

export default function CompanyAdminPage() {
	const router = useRouter();
	const apiBase = getApiBase();
	const [company, setCompany] = useState<{ id: string; name: string } | null>(null);
	const [candidates, setCandidates] = useState<Candidate[]>([]);
	const [sessions, setSessions] = useState<Session[]>([]);

	useEffect(() => {
		const raw = localStorage.getItem('company');
		if (!raw) {
			router.push('/company/login?return=/company/admin');
			return;
		}
		try {
			setCompany(JSON.parse(raw));
		} catch {
			router.push('/company/login?return=/company/admin');
		}
	}, [router]);

	useEffect(() => {
		if (!company) return;
		const load = async () => {
			const [cRes, sRes] = await Promise.all([
				fetch(`${apiBase}/api/candidates?company_id=${company.id}`),
				fetch(`${apiBase}/api/interview/sessions?company_id=${company.id}`),
			]);
			if (cRes.ok) setCandidates(await cRes.json() || []);
			if (sRes.ok) setSessions(await sRes.json() || []);
		};
		load();
		const id = setInterval(load, 12000);
		return () => clearInterval(id);
	}, [company, apiBase]);

	if (!company) return null;

	const completed = sessions.filter(s => s.status === 'completed').sort((a, b) => b.interview_score - a.interview_score);
	const recorded = candidates.filter(c => c.recording_s3_url);

	return (
		<div className="app-container" style={{ paddingBottom: '4rem', maxWidth: 960 }}>
			<header className="header">
				<div className="header-title-wrapper">
					<Link href="/" style={{ textDecoration: 'none' }}>
						<div className="logo-icon" style={{ background: 'linear-gradient(135deg, var(--color-accent) 0%, #a855f7 100%)' }}>ZS</div>
					</Link>
					<div>
						<h1 style={{ fontSize: '1.5rem' }}>{company.name}</h1>
						<p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Admin · interview review</p>
					</div>
				</div>
				<div style={{ display: 'flex', gap: '0.75rem' }}>
					<Link href="/company/dashboard" className="btn btn-secondary" style={{ fontSize: '0.8rem' }}>Hiring desk</Link>
					<button className="btn btn-secondary" style={{ fontSize: '0.8rem' }} onClick={() => { localStorage.removeItem('company'); router.push('/company/login'); }}>
						Sign out
					</button>
				</div>
			</header>

			<div className="panel" style={{ padding: '1.5rem', marginBottom: '1.25rem' }}>
				<h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: '0 0 0.35rem' }}>Interview scores</h2>
				<p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0 0 1.25rem' }}>
					Visible only here. Candidates do not see these numbers after they finish.
				</p>
				{completed.length === 0 ? (
					<p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>No completed interviews yet.</p>
				) : completed.map((s, idx) => {
					const cand = candidates.find(c => c.id === s.candidate_id);
					return (
						<div key={s.id} style={{ display: 'flex', gap: '1rem', padding: '1rem', marginBottom: '0.75rem', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: '0.6rem' }}>
							<div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: 'var(--text-muted)', flexShrink: 0 }}>
								#{idx + 1}
							</div>
							<div style={{ flex: 1, minWidth: 0 }}>
								<div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
									<div>
										<p style={{ fontWeight: 700, margin: 0 }}>{cand?.name || 'Candidate'}</p>
										<p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.15rem 0 0' }}>{cand?.role} · @{cand?.github_username}</p>
									</div>
									<div style={{ textAlign: 'right' }}>
										<p style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '1.35rem', color: scoreColor(s.interview_score), margin: 0 }}>{s.interview_score}%</p>
										<p style={{ fontSize: '0.7rem', fontWeight: 700, color: scoreColor(s.interview_score), margin: '0.15rem 0 0' }}>{fitLabel(s.interview_score)}</p>
									</div>
								</div>
								{s.fit_summary && (
									<p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.5rem 0 0', lineHeight: 1.55 }}>{s.fit_summary}</p>
								)}
								{cand && (
									<div style={{ marginTop: '0.65rem' }}>
										<Link href={`/candidate/${cand.id}`} style={{ fontSize: '0.8rem', color: 'var(--color-accent)', textDecoration: 'none' }}>Open candidate file →</Link>
									</div>
								)}
							</div>
						</div>
					);
				})}
			</div>

			{recorded.length > 0 && (
				<div className="panel" style={{ padding: '1.5rem' }}>
					<h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: '0 0 1rem' }}>Interview recordings</h2>
					<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
						{recorded.map(c => (
							<div key={c.id}>
								<p style={{ fontSize: '0.85rem', fontWeight: 600, margin: '0 0 0.5rem' }}>{c.name}</p>
								<video
									src={`${apiBase}/api/recordings/${c.id}?company_id=${company.id}`}
									controls
									playsInline
									preload="metadata"
									style={{ width: '100%', borderRadius: '0.5rem', background: '#000', maxHeight: 200 }}
								/>
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
