'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function TroubleshootingRedirect() {
	const router = useRouter();
	useEffect(() => {
		router.replace('/company/login');
	}, [router]);
	return null;
}
