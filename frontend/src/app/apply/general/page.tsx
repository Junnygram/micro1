'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Demo alias — redirects to the seeded DevOps job apply flow. */
export default function ApplyGeneralRedirect() {
	const router = useRouter();
	useEffect(() => {
		router.replace('/apply/devops_job');
	}, [router]);
	return (
		<div className="app-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
			<p style={{ color: 'var(--text-muted)' }}>Loading apply form…</p>
		</div>
	);
}
