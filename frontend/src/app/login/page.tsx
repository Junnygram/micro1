'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginRegisterPage() {
	const [isLogin, setIsLogin] = useState(true);
	const [name, setName] = useState('');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const router = useRouter();

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError('');
		setLoading(true);

		const url = isLogin 
			? 'http://localhost:8080/api/companies/login' 
			: 'http://localhost:8080/api/companies/register';
			
		const payload = isLogin 
			? { email, password }
			: { name, email, password };

		try {
			const res = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
			});
			
			if (!res.ok) {
				const text = await res.text();
				throw new Error(text || 'Authentication failed');
			}
			
			const data = await res.json();
			// Save company details to localStorage
			localStorage.setItem('company', JSON.stringify(data));
			
			// Redirect to admin dashboard
			router.push('/admindashboard');
		} catch (err) {
			setError((err as Error).message);
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="app-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '2rem' }}>
			<div className="panel" style={{ width: '100%', maxWidth: '440px', padding: '2.5rem' }}>
				<div style={{ textAlign: 'center', marginBottom: '2rem' }}>
					<div className="logo-icon" style={{ margin: '0 auto 1rem auto', background: 'linear-gradient(135deg, var(--color-accent) 0%, #a855f7 100%)' }}>ZS</div>
					<h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#ffffff', marginBottom: '0.5rem' }}>
						{isLogin ? 'Welcome Back' : 'Create Company Account'}
					</h2>
					<p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
						{isLogin ? 'Sign in to access your recruitment dashboard.' : 'Start sourcing candidates with ZaraSourcing.'}
					</p>
				</div>

				{error && (
					<div style={{ padding: '0.75rem', background: 'rgba(239,68,68,0.1)', border: '1px solid var(--color-error)', borderRadius: '0.5rem', marginBottom: '1.5rem', color: '#fca5a5', fontSize: '0.9rem', textAlign: 'center' }}>
						{error}
					</div>
				)}

				<form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
					{!isLogin && (
						<div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
							<label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Company Name</label>
							<input type="text" value={name} onChange={e => setName(e.target.value)} required={!isLogin}
								style={{ padding: '0.75rem 1rem', background: '#09070a', border: '1px solid var(--border-color)', borderRadius: '0.5rem', color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none' }}
							/>
						</div>
					)}
					<div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
						<label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Email Address</label>
						<input type="email" value={email} onChange={e => setEmail(e.target.value)} required
							style={{ padding: '0.75rem 1rem', background: '#09070a', border: '1px solid var(--border-color)', borderRadius: '0.5rem', color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none' }}
						/>
					</div>
					<div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
						<label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Password</label>
						<input type="password" value={password} onChange={e => setPassword(e.target.value)} required
							style={{ padding: '0.75rem 1rem', background: '#09070a', border: '1px solid var(--border-color)', borderRadius: '0.5rem', color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none' }}
						/>
					</div>

					<button type="submit" className="btn btn-primary" style={{ marginTop: '0.5rem', padding: '0.85rem', fontSize: '1rem', fontWeight: 700 }} disabled={loading}>
						{loading ? 'Processing...' : (isLogin ? 'Sign In' : 'Create Account')}
					</button>
				</form>

				<div style={{ textAlign: 'center', marginTop: '2rem' }}>
					<button 
						onClick={() => { setIsLogin(!isLogin); setError(''); }}
						style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', textDecoration: 'underline', fontSize: '0.9rem' }}
					>
						{isLogin ? "Don't have an account? Register your company" : "Already have an account? Sign In"}
					</button>
				</div>
			</div>
		</div>
	);
}
