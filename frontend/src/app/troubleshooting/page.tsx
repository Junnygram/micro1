'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface SystemHealth {
	api_status: 'operational' | 'degraded' | 'down';
	db_connected: boolean;
	active_websockets: number;
	llm_latency_ms: number;
}

interface AuditLog {
	id: string;
	timestamp: string;
	level: 'info' | 'warn' | 'error';
	message: string;
	source: string;
}

interface ImpactMetrics {
	total_audits: number;
	hours_saved: number;
	plagiarism_blocked: number;
	avg_vetting_time: string;
}

export default function TroubleshootingDashboard() {
	const [health, setHealth] = useState<SystemHealth>({
		api_status: 'operational',
		db_connected: true,
		active_websockets: 0,
		llm_latency_ms: 0
	});
	
	const [logs, setLogs] = useState<AuditLog[]>([]);
	const [metrics, setMetrics] = useState<ImpactMetrics>({
		total_audits: 0,
		hours_saved: 0,
		plagiarism_blocked: 0,
		avg_vetting_time: '0s'
	});
	
	const [loading, setLoading] = useState(true);
	const [isRefreshing, setIsRefreshing] = useState(false);

	const [cpu, setCpu] = useState(34);
	const [mem, setMem] = useState(62);

	useEffect(() => {
		const interval = setInterval(() => {
			setCpu(prev => Math.min(100, Math.max(5, prev + (Math.random() * 14 - 7))));
			setMem(prev => Math.min(100, Math.max(20, prev + (Math.random() * 8 - 4))));
		}, 1500);
		return () => clearInterval(interval);
	}, []);

	// Mocking the data fetch for MVP since there's no dedicated analytics API yet
	const fetchAnalytics = async () => {
		setIsRefreshing(true);
		try {
			// Simulate network delay
			await new Promise(r => setTimeout(r, 600));
			
			// Mock Health
			setHealth({
				api_status: 'operational',
				db_connected: true,
				active_websockets: Math.floor(Math.random() * 5),
				llm_latency_ms: Math.floor(Math.random() * (1200 - 400 + 1) + 400)
			});

			// Mock Metrics showing massive AI impact
			setMetrics({
				total_audits: 142,
				hours_saved: 426, // 3 hours per technical interview saved
				plagiarism_blocked: 18,
				avg_vetting_time: '4m 12s'
			});

			// Mock recent system logs
			const newLogs: AuditLog[] = [
				{ id: '1', timestamp: new Date(Date.now() - 1000 * 60 * 2).toISOString(), level: 'info', message: 'AWS Bedrock model invoked successfully for code AST analysis.', source: 'AI_Agent' },
				{ id: '2', timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(), level: 'warn', message: 'Candidate look-away threshold exceeded during screening session.', source: 'Proctor_Engine' },
				{ id: '3', timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(), level: 'error', message: 'Failed to fetch candidate GitHub repository: Repository is private or not found.', source: 'GitHub_API' },
				{ id: '4', timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(), level: 'info', message: 'System database backup completed successfully.', source: 'System' },
				{ id: '5', timestamp: new Date(Date.now() - 1000 * 60 * 180).toISOString(), level: 'warn', message: 'High latency detected in WebRTC audio stream negotiation.', source: 'WebRTC_Gateway' },
			];
			setLogs(newLogs);
			
		} catch (err) {
			console.error("Error fetching analytics:", err);
		} finally {
			setLoading(false);
			setIsRefreshing(false);
		}
	};

	useEffect(() => {
		fetchAnalytics();
		// Refresh every 10 seconds to simulate live data
		const timer = setInterval(fetchAnalytics, 10000);
		return () => clearInterval(timer);
	}, []);

	if (loading) {
		return <div className="app-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>Loading Admin Analytics...</div>;
	}

	return (
		<div className="app-container" style={{ paddingBottom: '4rem' }}>
			<header className="header" style={{ marginBottom: '2rem' }}>
				<div className="header-title-wrapper">
					<div className="logo-icon" style={{ background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)' }}>TS</div>
					<div>
						<h1>System Diagnostics & Analytics</h1>
						<p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
							Centralized troubleshooting, health metrics, and AI impact reporting.
						</p>
					</div>
				</div>
				<div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
					<button className="btn btn-secondary" onClick={fetchAnalytics} disabled={isRefreshing} style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}>
						{isRefreshing ? 'Refreshing...' : '↻ Refresh Data'}
					</button>
					<Link href="/admindashboard" className="btn btn-primary" style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}>
						Back to Sourcing
					</Link>
				</div>
			</header>

			{/* AI Business Impact Metrics */}
			<section style={{ marginBottom: '2.5rem' }}>
				<div style={{ marginBottom: '1rem' }}>
					<h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: '#f8fafc' }}>Total AI Impact & ROI</h2>
					<p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Cumulative value generated by autonomous vetting pipelines.</p>
				</div>
				<div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.25rem' }}>
					<div className="stat-card" style={{ background: 'rgba(99,102,241,0.05)', padding: '1.5rem', borderRadius: '0.75rem', border: '1px solid rgba(99,102,241,0.2)' }}>
						<span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Automated Audits</span>
						<div style={{ fontSize: '2rem', fontWeight: 900, marginTop: '0.5rem', color: 'var(--color-accent)' }}>
							{metrics.total_audits}
						</div>
					</div>
					<div className="stat-card" style={{ background: 'rgba(16,185,129,0.05)', padding: '1.5rem', borderRadius: '0.75rem', border: '1px solid rgba(16,185,129,0.2)' }}>
						<span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Engineer Hours Saved</span>
						<div style={{ fontSize: '2rem', fontWeight: 900, marginTop: '0.5rem', color: 'var(--color-success)' }}>
							{metrics.hours_saved} <span style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 600 }}>hrs</span>
						</div>
					</div>
					<div className="stat-card" style={{ background: 'rgba(239,68,68,0.05)', padding: '1.5rem', borderRadius: '0.75rem', border: '1px solid rgba(239,68,68,0.2)' }}>
						<span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Plagiarism Blocked</span>
						<div style={{ fontSize: '2rem', fontWeight: 900, marginTop: '0.5rem', color: 'var(--color-error)' }}>
							{metrics.plagiarism_blocked}
						</div>
					</div>
					<div className="stat-card" style={{ background: 'rgba(255,255,255,0.02)', padding: '1.5rem', borderRadius: '0.75rem', border: '1px solid var(--border-color)' }}>
						<span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Avg. Vetting Time</span>
						<div style={{ fontSize: '2rem', fontWeight: 900, marginTop: '0.5rem', color: '#f8fafc' }}>
							{metrics.avg_vetting_time}
						</div>
					</div>
				</div>
			</section>

			<div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
				
				{/* Infrastructure Health */}
				<section className="panel" style={{ padding: '1.5rem' }}>
					<div className="panel-header" style={{ marginBottom: '1.5rem' }}>
						<span>Infrastructure Health</span>
					</div>
					
					<div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
						
						{/* API Status */}
						<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
							<div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
								<div style={{ 
									width: '10px', height: '10px', borderRadius: '50%', 
									background: health.api_status === 'operational' ? 'var(--color-success)' : 'var(--color-error)',
									boxShadow: `0 0 8px ${health.api_status === 'operational' ? 'var(--color-success)' : 'var(--color-error)'}`
								}} />
								<span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>Go Backend API</span>
							</div>
							<span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
								{health.api_status === 'operational' ? 'Operational' : 'Failing'}
							</span>
						</div>

						{/* Database */}
						<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
							<div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
								<div style={{ 
									width: '10px', height: '10px', borderRadius: '50%', 
									background: health.db_connected ? 'var(--color-success)' : 'var(--color-error)',
									boxShadow: `0 0 8px ${health.db_connected ? 'var(--color-success)' : 'var(--color-error)'}`
								}} />
								<span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>SQLite Database</span>
							</div>
							<span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
								{health.db_connected ? 'Connected' : 'Disconnected'}
							</span>
						</div>

						{/* LLM Engine Latency */}
						<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
							<div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
								<div style={{ 
									width: '10px', height: '10px', borderRadius: '50%', 
									background: health.llm_latency_ms < 1000 ? 'var(--color-success)' : 'var(--color-warning)',
									boxShadow: `0 0 8px ${health.llm_latency_ms < 1000 ? 'var(--color-success)' : 'var(--color-warning)'}`
								}} />
								<span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>LLM Inference Engine</span>
							</div>
							<span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
								{health.llm_latency_ms}ms ping
							</span>
						</div>

						{/* Active Websockets */}
						<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
							<div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
								<div style={{ 
									width: '10px', height: '10px', borderRadius: '50%', 
									background: 'var(--color-accent)',
									boxShadow: `0 0 8px var(--color-accent)`
								}} />
								<span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>WebRTC Streams</span>
							</div>
							<span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
								{health.active_websockets} active
							</span>
						</div>

						{/* CPU Usage */}
						<div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
							<div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
								<span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Cluster CPU Usage</span>
								<span style={{ color: cpu > 85 ? 'var(--color-error)' : 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
									{cpu.toFixed(1)}%
								</span>
							</div>
							<div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
								<div style={{ 
									height: '100%', 
									width: `${cpu}%`, 
									background: cpu > 85 ? 'var(--color-error)' : cpu > 60 ? 'var(--color-warning)' : 'var(--color-success)',
									transition: 'width 1.5s ease'
								}} />
							</div>
						</div>

						{/* Memory Usage */}
						<div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
							<div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
								<span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Container Memory</span>
								<span style={{ color: mem > 85 ? 'var(--color-error)' : 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
									{mem.toFixed(1)}%
								</span>
							</div>
							<div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
								<div style={{ 
									height: '100%', 
									width: `${mem}%`, 
									background: mem > 85 ? 'var(--color-error)' : 'var(--color-accent)',
									transition: 'width 1.5s ease'
								}} />
							</div>
						</div>

					</div>
				</section>

				{/* System Terminal Logs */}
				<section className="panel" style={{ padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
					<div className="panel-header" style={{ padding: '1rem 1.5rem', background: 'rgba(0,0,0,0.2)', margin: 0, borderBottom: '1px solid var(--border-color)' }}>
						<span>System Event Logs</span>
						<span style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', background: 'rgba(255,255,255,0.1)', borderRadius: '0.25rem' }}>Live TTY</span>
					</div>
					
					<div style={{ 
						padding: '1.5rem', 
						background: '#09070a', 
						fontFamily: 'var(--font-mono)', 
						fontSize: '0.85rem', 
						display: 'flex', 
						flexDirection: 'column', 
						gap: '0.75rem',
						height: '320px',
						overflowY: 'auto'
					}}>
						{logs.map(log => (
							<div key={log.id} style={{ display: 'flex', gap: '1rem', borderBottom: '1px dashed rgba(255,255,255,0.05)', paddingBottom: '0.75rem' }}>
								<span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
									{new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}
								</span>
								<span style={{ 
									color: log.level === 'error' ? 'var(--color-error)' : log.level === 'warn' ? 'var(--color-warning)' : '#6ee7b7',
									fontWeight: 'bold',
									width: '50px'
								}}>
									[{log.level.toUpperCase()}]
								</span>
								<span style={{ color: 'var(--color-accent)', width: '120px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
									{log.source}
								</span>
								<span style={{ color: log.level === 'error' ? '#fca5a5' : 'var(--text-primary)' }}>
									{log.message}
								</span>
							</div>
						))}
						{isRefreshing && (
							<div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>&gt; Tail fetching new logs...</div>
						)}
					</div>
				</section>

			</div>
		</div>
	);
}
