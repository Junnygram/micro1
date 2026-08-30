'use client';
import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

function CompanyLoginForm() {
	const [isLogin, setIsLogin] = useState(true);
	const [name, setName] = useState('');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const router = useRouter();
	const searchParams = useSearchParams();
	const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError('');
		setLoading(true);
		try {
			const url = isLogin ? `${apiBase}/api/companies/login` : `${apiBase}/api/companies/register`;
			const payload = isLogin ? { email, password } : { name, email, password };
			const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
			if (!res.ok) throw new Error(await res.text() || 'Authentication failed');
			const data = await res.json();
			localStorage.setItem('company', JSON.stringify(data));
			const returnTo = searchParams.get('return');
			router.push(returnTo && returnTo.startsWith('/') ? returnTo : '/company/dashboard');
		} catch (err) {
			setError((err as Error).message);
		} finally {
			setLoading(false);
		}
	};

	return (
		<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
			<div style={{ width: '100%', maxWidth: '420px' }}>
				<div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
					<Link href="/" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.75rem' }}>
						<div className="logo-icon" style={{ background: 'linear-gradient(135deg, var(--color-accent) 0%, #a855f7 100%)' }}>ZS</div>
						<span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>ZaraSourcing</span>
					</Link>
					<p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.5rem' }}>AI-powered technical hiring platform</p>
				</div>

				<div className="panel" style={{ padding: '2rem' }}>
					<div style={{ display: 'flex', background: 'rgba(255,255,255,0.03)', borderRadius: '0.5rem', padding: '0.25rem', marginBottom: '1.75rem' }}>
						{['Sign In', 'Create Account'].map((label, i) => (
							<button key={label} onClick={() => setIsLogin(i === 0)} style={{ flex: 1, padding: '0.6rem', borderRadius: '0.35rem', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', background: isLogin === (i === 0) ? 'rgba(99,102,241,0.2)' : 'transparent', color: isLogin === (i === 0) ? 'var(--color-accent)' : 'var(--text-muted)', transition: 'all 0.2s' }}>
								{label}
							</button>
						))}
					</div>

					{error && <div style={{ padding: '0.75rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '0.5rem', marginBottom: '1.25rem', color: '#fca5a5', fontSize: '0.85rem' }}>{error}</div>}

					<form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
						{!isLogin && (
							<div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
								<label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Company Name</label>
								<input type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="Acme Corp"
									style={{ padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '0.5rem', color: 'var(--text-primary)', fontSize: '0.95rem', outline: 'none' }} />
							</div>
						)}
						<div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
							<label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email</label>
							<input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@company.com"
								style={{ padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '0.5rem', color: 'var(--text-primary)', fontSize: '0.95rem', outline: 'none' }} />
						</div>
						<div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
							<label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Password</label>
							<input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••"
								style={{ padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '0.5rem', color: 'var(--text-primary)', fontSize: '0.95rem', outline: 'none' }} />
						</div>
						<button type="submit" className="btn btn-primary" style={{ marginTop: '0.5rem', padding: '0.85rem', fontSize: '0.95rem', fontWeight: 700 }} disabled={loading}>
							{loading ? 'Please wait...' : isLogin ? 'Sign In →' : 'Create Account →'}
						</button>
					</form>

					{isLogin && (
						<>
							<button
								type="button"
								className="btn btn-secondary"
								style={{ marginTop: '1rem', width: '100%', padding: '0.75rem', fontSize: '0.9rem' }}
								disabled={loading}
								onClick={async () => {
									setEmail('demo@zarasourcing.com');
									setPassword('demo123');
									setLoading(true);
									try {
										const res = await fetch(`${apiBase}/api/companies/login`, {
											method: 'POST',
											headers: { 'Content-Type': 'application/json' },
											body: JSON.stringify({ email: 'demo@zarasourcing.com', password: 'demo123' }),
										});
										if (!res.ok) throw new Error('Demo login failed');
										const data = await res.json();
										localStorage.setItem('company', JSON.stringify(data));
										const returnTo = searchParams.get('return');
										router.push(returnTo && returnTo.startsWith('/') ? returnTo : '/company/dashboard');
									} catch (err) {
										setError((err as Error).message);
									} finally {
										setLoading(false);
									}
								}}
							>
								{loading ? 'Signing in...' : '⚡ One-click demo login'}
							</button>
							<p style={{ textAlign: 'center', marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
								Demo: <span style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-mono)' }}>demo@zarasourcing.com</span> / <span style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-mono)' }}>demo123</span>
							</p>
						</>
					)}
				</div>
			</div>
		</div>
	);
}

export default function CompanyLogin() {
	return (
		<Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p style={{ color: 'var(--text-muted)' }}>Loading...</p></div>}>
			<CompanyLoginForm />
		</Suspense>
	);
}
