'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

export default function AuditDeepLinkPage() {
	const { github } = useParams() as { github: string };
	const router = useRouter();
	const [error, setError] = useState('');
	const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

	useEffect(() => {
		if (!github) return;
		fetch(`${apiBase}/api/demo/candidate?github=${encodeURIComponent(github)}`)
			.then(async res => {
				if (!res.ok) throw new Error('Candidate not found in demo dataset');
				const data = await res.json();
				router.replace(`/candidate/${data.id}`);
			})
			.catch(err => setError((err as Error).message));
	}, [github, apiBase, router]);

	if (error) {
		return (
			<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
				<div className="panel" style={{ maxWidth: '420px', textAlign: 'center', padding: '2rem' }}>
					<p style={{ color: 'var(--color-failure)', marginBottom: '1rem' }}>{error}</p>
					<Link href="/benchmark" className="btn btn-secondary">← Back to benchmark</Link>
				</div>
			</div>
		);
	}

	return (
		<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
			<p style={{ color: 'var(--text-muted)' }}>Opening audit for @{github}...</p>
		</div>
	);
}
