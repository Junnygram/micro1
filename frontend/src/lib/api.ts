/** Backend API base URL — works locally and on Railway without rebuild if env var missing. */
export function getApiBase(): string {
	const env = process.env.NEXT_PUBLIC_API_URL;
	if (env && env !== 'http://localhost:8080') {
		return env.replace(/\/$/, '');
	}
	if (typeof window !== 'undefined') {
		const host = window.location.hostname;
		if (host === 'micro1-production.up.railway.app') {
			return 'https://zarasourcing-production.up.railway.app';
		}
	}
	return (env || 'http://localhost:8080').replace(/\/$/, '');
}
