'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

interface Step {
	id: number;
	session_id: string;
	type: 'thought' | 'tool_call' | 'tool_result' | 'user_feedback' | 'system';
	content: string;
	metadata: string;
	created_at: string;
}

interface ClaimAudit {
	id: number;
	candidate_id: string;
	claim_text: string;
	evidence_text: string;
	file_path: string;
	status: 'verified' | 'exaggerated' | 'failed';
	severity: 'high' | 'medium' | 'none';
	created_at: string;
}

interface Candidate {
	id: string;
	name: string;
	email: string;
	role: string;
	github_username: string;
	sourcing_score: number;
	status: 'evaluating' | 'completed' | 'failed' | 'pending';
	recording_s3_url?: string;
}

interface ProctoringEvent {
	id: number;
	candidate_id: string;
	timestamp: string;
	event_type: 'look_away' | 'tab_switch' | 'voice_detected';
	duration: number;
	details: string;
	created_at: string;
}

interface InterviewQuestion {
	id: number;
	question: string;
	expectedTopic: string;
}

export default function CandidateDetail({ params }: { params: { id: string } }) {
	const [candidate, setCandidate] = useState<Candidate | null>(null);
	const [steps, setSteps] = useState<Step[]>([]);
	const [audits, setAudits] = useState<ClaimAudit[]>([]);
	const [proctoring, setProctoring] = useState<ProctoringEvent[]>([]);
	const [selectedProctorEvent, setSelectedProctorEvent] = useState<ProctoringEvent | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [selectedAudit, setSelectedAudit] = useState<ClaimAudit | null>(null);

	// Proctoring States
	const [webcamActive, setWebcamActive] = useState(false);
	const [tabBlurCount, setTabBlurCount] = useState(0);
	const [proctorError, setProctorError] = useState<string | null>(null);
	const [faceStatus, setFaceStatus] = useState<'no_face' | 'looking' | 'away'>('no_face');
	const [lookAwayStart, setLookAwayStart] = useState<number | null>(null);
	const [audioLevel, setAudioLevel] = useState(0);

	// Screening Interview states
	const [interviewActive, setInterviewActive] = useState(false);
	const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
	const [answers, setAnswers] = useState<string[]>(['', '', '']);
	const [interviewSubmitted, setInterviewSubmitted] = useState(false);

	const terminalEndRef = useRef<HTMLDivElement>(null);
	const webcamRef = useRef<HTMLVideoElement>(null);
	const webcamStreamRef = useRef<MediaStream | null>(null);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const faceLandmarkerRef = useRef<any>(null);
	const animFrameRef = useRef<number>(0);
	const lastAlertRef = useRef<number>(0);
	const audioContextRef = useRef<AudioContext | null>(null);
	const audioIntervalRef = useRef<number | null>(null);

	// MediaRecorder refs for session archiving
	const mediaRecorderRef = useRef<MediaRecorder | null>(null);
	const recordedChunksRef = useRef<Blob[]>([]);
	const pcRef = useRef<RTCPeerConnection | null>(null);

	const apiBase = 'http://localhost:8080';

	const fetchCandidateData = async () => {
		try {
			const res = await fetch(`${apiBase}/api/candidates/${params.id}`);
			if (!res.ok) throw new Error('Candidate details not found');
			const data = await res.json();
			setCandidate(data.candidate);
			setSteps(data.steps || []);
			setAudits(data.audits || []);
			
			const proctorLogs = data.proctoring || [];
			setProctoring(proctorLogs);
			if (proctorLogs.length > 0 && !selectedProctorEvent) {
				setSelectedProctorEvent(proctorLogs[0]);
			}

			if (data.audits && data.audits.length > 0 && !selectedAudit) {
				setSelectedAudit(data.audits[0]);
			}

			setError(null);
		} catch (err) {
			setError((err as Error).message);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchCandidateData();
		// Poll if active session is evaluating
		const timer = setInterval(() => {
			if (candidate && (candidate.status === 'evaluating' || interviewActive)) {
				fetchCandidateData();
			}
		}, 1500);

		return () => clearInterval(timer);
	}, [candidate?.status, interviewActive]);

	// Auto Scroll live terminal logs to bottom
	useEffect(() => {
		if (terminalEndRef.current) {
			terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
		}
	}, [steps]);

	// Live Webcam Feed + MediaPipe Face Detection + MediaRecorder
	const startWebcam = async () => {
		setProctorError(null);
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: true });
			webcamStreamRef.current = stream;
			if (webcamRef.current) {
				webcamRef.current.srcObject = stream;
				await webcamRef.current.play();
			}
			setWebcamActive(true);

			// Initialize Web Audio API analyser
			try {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
				const ctx = new AudioContextClass();
				audioContextRef.current = ctx;
				const source = ctx.createMediaStreamSource(stream);
				const analyser = ctx.createAnalyser();
				analyser.fftSize = 512;
				analyser.smoothingTimeConstant = 0.8;
				source.connect(analyser);
				const data = new Uint8Array(analyser.fftSize);

				const interval = window.setInterval(() => {
					analyser.getByteTimeDomainData(data);
					let sum = 0;
					for (let i = 0; i < data.length; i++) {
						const v = (data[i] - 128) / 128;
						sum += v * v;
					}
					const rms = Math.sqrt(sum / data.length);
					const level = Math.min(1, rms * 3.2);
					setAudioLevel(level);
				}, 100);
				audioIntervalRef.current = interval;
			} catch (audioErr) {
				console.warn('Audio analyser failed to initialize:', audioErr);
			}

			// Initialize MediaRecorder for assessment session archiving
			if (interviewActive) {
				try {
					recordedChunksRef.current = [];
					const options = { mimeType: 'video/webm;codecs=vp9,opus' };
					if (typeof MediaRecorder !== 'undefined') {
						const recorder = new MediaRecorder(stream, options);
						mediaRecorderRef.current = recorder;
						
						recorder.ondataavailable = (e) => {
							if (e.data && e.data.size > 0) {
								recordedChunksRef.current.push(e.data);
							}
						};
						
						recorder.start(1000); // chunk slices every 1s
						console.log('MediaRecorder session capture started.');
					}
				} catch (recErr) {
					console.warn('MediaRecorder setup failed, trying fallback codec:', recErr);
					try {
						const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
						mediaRecorderRef.current = recorder;
						recorder.ondataavailable = (e) => {
							if (e.data && e.data.size > 0) {
								recordedChunksRef.current.push(e.data);
							}
						};
						recorder.start(1000);
					} catch (fallbackErr) {
						console.error('MediaRecorder fallback failed entirely:', fallbackErr);
					}
				}
			}

			// Initialize MediaPipe FaceLandmarker locally
			try {
				const vision = await import('@mediapipe/tasks-vision');
				const filesetResolver = await vision.FilesetResolver.forVisionTasks(
					'/wasm'
				);
				const landmarker = await vision.FaceLandmarker.createFromOptions(filesetResolver, {
					baseOptions: {
						modelAssetPath: '/models/face_landmarker.task',
						delegate: 'GPU',
					},
					runningMode: 'VIDEO',
					numFaces: 1,
				});
				faceLandmarkerRef.current = landmarker;
				startDetectionLoop();
			} catch (err) {
				console.error('MediaPipe init failed, falling back to basic camera mode:', err);
				setProctorError('MediaPipe model asset load failure. Fallback to basic webcam mode active.');
			}
		} catch (err) {
			console.error('Webcam access denied:', err);
			setProctorError('Camera permission denied or camera blocked.');
		}
	};

	const startDetectionLoop = () => {
		const detect = () => {
			if (!webcamRef.current || !faceLandmarkerRef.current || !webcamActive) return;
			const video = webcamRef.current;
			if (video.readyState < 2) {
				animFrameRef.current = requestAnimationFrame(detect);
				return;
			}

			try {
				const results = faceLandmarkerRef.current.detectForVideo(video, performance.now());
				if (!results.faceLandmarks || results.faceLandmarks.length === 0) {
					setFaceStatus('no_face');
					handleLookAway(true);
				} else {
					const landmarks = results.faceLandmarks[0];
					const noseTip = landmarks[1];
					const leftEar = landmarks[234];
					const rightEar = landmarks[454];

					const faceCenter = (leftEar.x + rightEar.x) / 2;
					const faceWidth = Math.abs(rightEar.x - leftEar.x);
					const noseOffset = Math.abs(noseTip.x - faceCenter);
					const offsetRatio = noseOffset / (faceWidth || 0.1);

					const topHead = landmarks[10];
					const chin = landmarks[152];
					const faceHeight = Math.abs(chin.y - topHead.y);
					const vertCenter = (topHead.y + chin.y) / 2;
					const vertOffset = Math.abs(noseTip.y - vertCenter) / (faceHeight || 0.1);

					if (offsetRatio > 0.35 || vertOffset > 0.45) {
						setFaceStatus('away');
						handleLookAway(true);
					} else {
						setFaceStatus('looking');
						handleLookAway(false);
					}
				}
			} catch {
				// Continue loop on frame errors
			}

			animFrameRef.current = requestAnimationFrame(detect);
		};
		animFrameRef.current = requestAnimationFrame(detect);
	};

	const handleLookAway = (isAway: boolean) => {
		if (isAway) {
			if (!lookAwayStart) {
				setLookAwayStart(Date.now());
			} else {
				const duration = (Date.now() - lookAwayStart) / 1000;
				if (duration > 2 && (Date.now() - lastAlertRef.current) > 10000 && candidate) {
					lastAlertRef.current = Date.now();
					const now = new Date();
					const ts = `${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
					fetch(`${apiBase}/api/proctoring`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							candidate_id: candidate.id,
							timestamp: ts,
							event_type: 'look_away',
							duration: Math.round(duration),
							details: `MediaPipe tracking alert: Gaze deviation / head turned off-screen for ${Math.round(duration)} seconds.`
						}),
					}).catch(console.error);
					fetchCandidateData();
				}
			}
		} else {
			setLookAwayStart(null);
		}
	};

	const stopWebcam = () => {
		if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
		if (faceLandmarkerRef.current) {
			try { faceLandmarkerRef.current.close(); } catch {}
			faceLandmarkerRef.current = null;
		}
		if (audioIntervalRef.current) {
			clearInterval(audioIntervalRef.current);
			audioIntervalRef.current = null;
		}
		if (audioContextRef.current) {
			audioContextRef.current.close().catch(() => {});
			audioContextRef.current = null;
		}
		if (webcamStreamRef.current) {
			webcamStreamRef.current.getTracks().forEach(t => t.stop());
			webcamStreamRef.current = null;
		}
		setWebcamActive(false);
		setFaceStatus('no_face');
		setAudioLevel(0);
	};

	// Active Tab-Blur Detector
	useEffect(() => {
		if (!candidate || (candidate.status !== 'evaluating' && !interviewActive)) return;

		const handleBlur = () => {
			setTabBlurCount(prev => prev + 1);
			const now = new Date();
			const ts = `${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
			fetch(`${apiBase}/api/proctoring`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					candidate_id: candidate.id,
					timestamp: ts,
					event_type: 'tab_switch',
					duration: 3,
					details: 'OS blur alert: Candidate switched tabs or opened secondary windows.'
				}),
			}).catch(console.error);
			fetchCandidateData();
		};

		window.addEventListener('blur', handleBlur);
		return () => {
			window.removeEventListener('blur', handleBlur);
			stopWebcam();
		};
	}, [candidate?.id, candidate?.status, interviewActive]);

	// Simulated proctor alert
	const simulateAlert = async (eventType: 'look_away' | 'voice_detected') => {
		if (!candidate) return;
		const now = new Date();
		const ts = `${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
		await fetch(`${apiBase}/api/proctoring`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				candidate_id: candidate.id,
				timestamp: ts,
				event_type: eventType,
				duration: eventType === 'look_away' ? 5 : 8,
				details: eventType === 'look_away'
					? 'Webcam detected candidate eyes moving off-screen for extended period.'
					: 'Secondary voice or speech pattern detected in audio feed.'
			}),
		}).catch(console.error);
		fetchCandidateData();
	};

	const startInterview = async () => {
		setInterviewActive(true);
		setInterviewSubmitted(false);
		setCurrentQuestionIndex(0);
		setAnswers(['', '', '']);
		setTabBlurCount(0);
		
		await startWebcam();
		await startWebRTC();
	};

	const startWebRTC = async () => {
		if (!candidate) return;
		const pc = new RTCPeerConnection();
		pcRef.current = pc;

		const audioEl = document.createElement('audio');
		audioEl.autoplay = true;
		pc.ontrack = (e) => {
			audioEl.srcObject = e.streams[0];
		};

		if (webcamStreamRef.current) {
			const audioTracks = webcamStreamRef.current.getAudioTracks();
			if (audioTracks.length > 0) {
				pc.addTrack(audioTracks[0], webcamStreamRef.current);
			}
		}

		const offer = await pc.createOffer();
		await pc.setLocalDescription(offer);

		const sdpResponse = await fetch(`${apiBase}/api/session/realtime/${candidate.id}`, {
			method: 'POST',
			body: offer.sdp,
			headers: { 'Content-Type': 'application/sdp' }
		});
		
		if (!sdpResponse.ok) {
			console.error("Failed to fetch SDP from backend");
			return;
		}

		const answer = { type: 'answer' as RTCSdpType, sdp: await sdpResponse.text() };
		await pc.setRemoteDescription(answer);
	};

	const submitInterview = async () => {
		if (!candidate) return;

		// Stop recording and trigger async upload to backend/S3
		if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
			mediaRecorderRef.current.onstop = async () => {
				const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
				const formData = new FormData();
				formData.append('candidate_id', candidate.id);
				formData.append('video', blob, 'interview.webm');

				try {
					await fetch(`${apiBase}/api/candidates/recording`, {
						method: 'POST',
						body: formData
					});
					console.log('Recorded interview session uploaded successfully.');
				} catch (uploadErr) {
					console.error('Failed to upload session recording:', uploadErr);
				}

				// Trigger Go agent to audit candidate answers and update database score
				triggerAuditSession();
			};
			mediaRecorderRef.current.stop();
		} else {
			triggerAuditSession();
		}

		stopWebcam();
		setInterviewActive(false);
		setInterviewSubmitted(true);
	};

	const triggerAuditSession = async () => {
		if (!candidate) return;
		try {
			await fetch(`${apiBase}/api/sessions`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					candidate_id: candidate.id,
					mode: 'advanced'
				}),
			});
			fetchCandidateData();
		} catch (err) {
			console.error('Audit session start failed:', err);
		}
	};

	const getTimelinePercent = (timestamp: string) => {
		const parts = timestamp.split(':');
		if (parts.length !== 2) return 50;
		const min = parseInt(parts[0], 10);
		const sec = parseInt(parts[1], 10);
		const totalSecs = (min * 60) + sec;
		const percent = (totalSecs / 600) * 100;
		return Math.min(Math.max(percent, 5), 95);
	};

	if (loading) {
		return (
			<div className="app-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
				<p style={{ color: 'var(--text-secondary)' }}>Loading auditing workspace details...</p>
			</div>
		);
	}

	if (error || !candidate) {
		return (
			<div className="app-container" style={{ padding: '2rem' }}>
				<div style={{ padding: '1.5rem', background: 'rgba(244,63,94,0.1)', border: '1px solid var(--color-failure)', borderRadius: '0.5rem', color: '#fca5a5' }}>
					<h3>Vetting Workspace Error</h3>
					<p>{error || 'Candidate profile not seeded in database.'}</p>
					<Link href="/" className="btn btn-secondary" style={{ marginTop: '1rem', display: 'inline-block' }}>
						Return to Sourcing Pipeline
					</Link>
				</div>
			</div>
		);
	}

	return (
		<div className="app-container">
			{/* Header Navigation */}
			<header className="header">
				<div className="header-title-wrapper">
					<Link href="/" className="logo-icon" style={{ textDecoration: 'none', background: 'linear-gradient(135deg, var(--color-accent) 0%, #a855f7 100%)' }}>
						ZS
					</Link>
					<div>
						<div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
							<h1>{candidate.name}</h1>
							<span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>@{candidate.github_username}</span>
						</div>
						<p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
							Audited Vetting Session: {candidate.role}
						</p>
					</div>
				</div>
				<div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
					<span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', fontWeight: 800, color: 'var(--color-accent)' }}>
						Vetting Rank: {candidate.sourcing_score > 0 ? `${candidate.sourcing_score}/100` : 'Pending'}
					</span>
					<Link href="/" className="btn btn-secondary">
						Pipeline Overview
					</Link>
				</div>
			</header>

			{/* INTERACTIVE TECHNICAL INTERVIEW SANDBOX PANEL */}
			{!interviewSubmitted && (candidate.status === 'pending' || candidate.status === 'evaluating' || interviewActive) && (
				<section className="panel" style={{ marginTop: '1.5rem', border: '1px solid var(--color-accent)', background: 'rgba(99,102,241,0.02)' }}>
					<div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
						<span>🧠 Vetting Interview Assessment Simulator (micro1 Clone)</span>
						<span className="badge running">Active Screening Session</span>
					</div>

					{!interviewActive ? (
						<div style={{ padding: '1.5rem', textAlign: 'center' }}>
							<h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
								Hi {candidate.name.split(' ')[0]}, welcome to the {candidate.role} Vetting Assessment.
							</h3>
							<p style={{ color: 'var(--text-secondary)', marginBottom: '1.25rem', fontSize: '0.85rem' }}>
								This session will be recorded and proctored via eye-tracking and tab-focus security sensors to verify credentials.
							</p>
							<button className="btn btn-primary" onClick={startInterview}>
								Start Vetting Interview Session
							</button>
						</div>
					) : (
						<div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '2rem', marginTop: '1rem' }}>
							{/* Live Voice AI Panel */}
							<div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
								<div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
									<span>Live AI Vetting</span>
									<span style={{ color: 'var(--color-accent)', fontWeight: 600 }}>Security: Active Gaze Tracking & Video REC</span>
								</div>

								<div style={{ background: '#09070a', padding: '1.25rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px' }}>
									<h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: '1.5', textAlign: 'center' }}>
										Interactive Voice Interview in Progress...
									</h3>
									<p style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '1rem' }}>
										Please speak naturally with the AI. Your microphone and webcam are active.
									</p>
								</div>

								<div style={{ display: 'flex', justifyContent: 'flex-end' }}>
									<button
										className="btn btn-primary"
										style={{ background: 'linear-gradient(135deg, var(--color-accent) 0%, #a855f7 100%)' }}
										onClick={submitInterview}
									>
										End & Submit Interview
									</button>
								</div>
							</div>

							{/* Live Webcam Proctoring HUD (Side panel during interview) */}
							<div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
								<div style={{
									height: '180px',
									background: '#09070a',
									border: `2px solid ${faceStatus === 'looking' ? '#10b981' : faceStatus === 'away' ? '#ef4444' : '#f59e0b'}`,
									borderRadius: '0.5rem',
									position: 'relative',
									overflow: 'hidden',
									display: 'flex',
									justifyContent: 'center',
									alignItems: 'center'
								}}>
									<video
										ref={webcamRef}
										autoPlay
										playsInline
										muted
										style={{
											width: '100%',
											height: '100%',
											objectFit: 'cover',
											display: webcamActive ? 'block' : 'none',
											transform: 'scaleX(-1)'
										}}
									/>
									{!webcamActive && (
										<div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Camera Loading...</div>
									)}

									{/* Visual reticle HUD */}
									{webcamActive && (
										<div style={{ position: 'absolute', inset: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', pointerEvents: 'none' }}>
											<div style={{
												width: '90px',
												height: '90px',
												borderRadius: '50%',
												border: `2px dashed ${faceStatus === 'looking' ? 'rgba(16, 185, 129, 0.4)' : faceStatus === 'away' ? 'rgba(239, 68, 68, 0.6)' : 'rgba(245, 158, 11, 0.4)'}`,
												position: 'relative'
											}} />
											
											{/* Pulsating red REC indicator */}
											<div style={{ position: 'absolute', top: '8px', left: '10px', display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'rgba(0,0,0,0.6)', padding: '0.1rem 0.35rem', borderRadius: '0.2rem' }}>
												<span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ef4444', animation: 'pulse 1s infinite' }}></span>
												<span style={{ fontSize: '0.55rem', color: '#fca5a5', fontWeight: 'bold', fontFamily: 'var(--font-mono)' }}>REC</span>
											</div>

											<span style={{
												position: 'absolute',
												bottom: '8px',
												fontSize: '0.6rem',
												fontFamily: 'var(--font-mono)',
												color: faceStatus === 'looking' ? '#10b981' : faceStatus === 'away' ? '#ef4444' : '#f59e0b',
												background: 'rgba(0,0,0,0.8)',
												padding: '0.1rem 0.4rem',
												borderRadius: '0.2rem'
											}}>
												{faceStatus === 'looking' ? 'LOCK ACTIVE' : faceStatus === 'away' ? 'DEVIATION DETECTED' : 'ALIGNING TARGET'}
											</span>
										</div>
									)}
								</div>

								{webcamActive && (
									<div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: '0.5rem', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
										<div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
											<span>🎙 Mic Sensitivity Volume:</span>
											<span style={{ color: audioLevel > 0.15 ? 'var(--color-success)' : 'var(--text-muted)', fontWeight: 'bold' }}>
												{audioLevel > 0.15 ? 'SPEECH ACTIVE' : 'Muted/Silence'}
											</span>
										</div>
										<div style={{ height: '8px', background: '#09070a', borderRadius: '4px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)' }}>
											<div style={{
												height: '100%',
												width: `${audioLevel * 100}%`,
												background: audioLevel > 0.15 ? 'linear-gradient(90deg, #10b981 0%, #3b82f6 100%)' : '#64748b',
												transition: 'width 0.1s ease',
												boxShadow: audioLevel > 0.15 ? '0 0 8px rgba(16, 185, 129, 0.6)' : 'none'
											}} />
										</div>
									</div>
								)}

								{/* Dynamic stats */}
								<div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: '0.5rem', padding: '1rem', fontSize: '0.85rem' }}>
									<h4 style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Session Alerts Logged</h4>
									<div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
										<div style={{ display: 'flex', justifyContent: 'space-between' }}>
											<span style={{ color: 'var(--text-secondary)' }}>Tab switches:</span>
											<span style={{ color: tabBlurCount > 0 ? '#ef4444' : 'var(--text-muted)', fontWeight: 'bold' }}>{tabBlurCount} alerts</span>
										</div>
										<div style={{ display: 'flex', justifyContent: 'space-between' }}>
											<span style={{ color: 'var(--text-secondary)' }}>Gaze warnings:</span>
											<span style={{ color: proctoring.filter(p => p.event_type === 'look_away').length > 0 ? '#ef4444' : 'var(--text-muted)', fontWeight: 'bold' }}>
												{proctoring.filter(p => p.event_type === 'look_away').length} alerts
											</span>
										</div>
									</div>
								</div>
							</div>
						</div>
					)}
				</section>
			)}

			{/* Grid workspace */}
			<div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2.5rem', marginTop: '1.5rem' }}>
				
				{/* Live Auditing terminal window */}
				<div className="panel" style={{ flex: 1 }}>
					<div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
						<div style={{ display: 'flex', gap: '0.4rem' }}>
							<span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444' }}></span>
							<span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f59e0b' }}></span>
							<span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981' }}></span>
						</div>
						<span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>ZaraSourcing Shell v3.1-lite</span>
						<span className="badge running">LIVE AUDIT WORKSPACE</span>
					</div>

					<div className="terminal-logs">
						{steps.map((step) => {
							let typeLabel = step.type.toUpperCase();
							let color = 'var(--text-secondary)';
							if (step.type === 'tool_call') {
								typeLabel = `CALL [${step.content}]`;
								color = 'var(--color-accent)';
							} else if (step.type === 'tool_result') {
								typeLabel = `RESULT [${step.content}]`;
								color = '#10b981';
							} else if (step.type === 'thought') {
								typeLabel = 'ZARASOURCING THOUGHT';
								color = '#a855f7';
							} else if (step.type === 'system') {
								color = '#64748b';
							}

							return (
								<div key={step.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
									<div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.02)', paddingBottom: '0.25rem' }}>
										<span style={{ fontWeight: 700, color, fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
											{typeLabel}
										</span>
										<span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
											{step.created_at.split('T')[1]?.substring(0, 8) || step.created_at}
										</span>
									</div>

									{step.type !== 'thought' && step.type !== 'tool_result' && (
										<div className="step-content" style={{ color: step.type === 'system' ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
											{step.content}
										</div>
									)}

									{step.type === 'thought' && (
										<div className="step-content thought" style={{ fontStyle: 'italic', background: 'rgba(168,85,247,0.02)', borderLeft: '3px solid #a855f7', padding: '0.5rem 1rem', borderRadius: '0 0.5rem 0.5rem 0' }}>
											{step.content}
										</div>
									)}
									{step.type === 'tool_result' && (
										<div className="step-content tool-result" style={{ background: '#09070a', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '0.35rem', padding: '0.75rem' }}>
											<pre style={{ fontSize: '0.75rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: '#10b981', fontFamily: 'var(--font-mono)' }}>{step.metadata}</pre>
										</div>
									)}
									{step.type === 'user_feedback' && (
										<div className="step-content" style={{ color: 'var(--color-warning)', fontWeight: 600 }}>
											{step.content}
										</div>
									)}
								</div>
							);
						})}

						{candidate.status === 'evaluating' && (
							<div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-accent)', fontWeight: 600 }}>
								<span>ZaraSourcing is auditing repository files</span>
								<span className="cursor-blink"></span>
							</div>
						)}
						<div ref={terminalEndRef} />
					</div>
				</div>

				{/* Live Webcam Proctoring Monitor */}
				{!interviewActive && (
					<div className="panel" style={{ border: '1px solid rgba(99,102,241,0.2)', background: 'rgba(99,102,241,0.01)' }}>
						<div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
							<span>🎥 Live Webcam &amp; Focus Proctoring Monitor</span>
							<div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
								{tabBlurCount > 0 && (
									<span className="badge failed" style={{ fontSize: '0.7rem' }}>
										{tabBlurCount} Tab Switch{tabBlurCount > 1 ? 'es' : ''} Detected
									</span>
								)}
								{webcamActive ? (
									<button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.3rem 0.65rem' }} onClick={stopWebcam}>
										Stop Camera
									</button>
								) : (
									<button className="btn btn-primary" style={{ fontSize: '0.75rem', padding: '0.3rem 0.65rem' }} onClick={startWebcam}>
										Start Camera
									</button>
								)}
							</div>
						</div>

						{proctorError && (
							<div style={{ padding: '0.5rem 1rem', margin: '0.5rem 0', background: 'rgba(244,63,94,0.1)', border: '1px solid var(--color-failure)', borderRadius: '0.35rem', color: '#fca5a5', fontSize: '0.8rem' }}>
								{proctorError}
							</div>
						)}

						<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginTop: '0.75rem' }}>
							{/* Webcam Video Feed */}
							<div style={{
								height: '220px',
								background: '#09070a',
								border: `2px solid ${webcamActive ? 'var(--color-success)' : 'var(--border-color)'}`,
								borderRadius: '0.75rem',
								position: 'relative',
								overflow: 'hidden',
								display: 'flex',
								justifyContent: 'center',
								alignItems: 'center'
							}}>
								<video
									ref={webcamRef}
									autoPlay
									playsInline
									muted
									style={{
										width: '100%',
										height: '100%',
										objectFit: 'cover',
										display: webcamActive ? 'block' : 'none',
										transform: 'scaleX(-1)'
									}}
								/>
								{!webcamActive && (
									<div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
										<p style={{ fontSize: '0.9rem' }}>Camera Off</p>
										<p style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>Click &quot;Start Camera&quot; to enable live proctoring</p>
									</div>
								)}
								{/* Camera overlay */}
								{webcamActive && (
									<div style={{ position: 'absolute', top: '8px', left: '10px', display: 'flex', alignItems: 'center', gap: '0.4rem', zIndex: 10 }}>
										<span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', animation: 'pulse 1.5s infinite' }}></span>
										<span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>LIVE</span>
									</div>
								)}
								
								{/* Target reticle HUD overlay */}
								{webcamActive && (
									<div style={{
										position: 'absolute',
										inset: 0,
										display: 'flex',
										justifyContent: 'center',
										alignItems: 'center',
										pointerEvents: 'none',
										zIndex: 5
									}}>
										<div style={{
											width: '140px',
											height: '140px',
											borderRadius: '50%',
											border: `2px dashed ${faceStatus === 'looking' ? 'rgba(16, 185, 129, 0.4)' : faceStatus === 'away' ? 'rgba(239, 68, 68, 0.6)' : 'rgba(245, 158, 11, 0.4)'}`,
											display: 'flex',
											justifyContent: 'center',
											alignItems: 'center',
											position: 'relative'
										}}>
											<div style={{ position: 'absolute', width: '20px', height: '2px', background: faceStatus === 'looking' ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.6)' }} />
											<div style={{ position: 'absolute', height: '20px', width: '2px', background: faceStatus === 'looking' ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.6)' }} />
										</div>
										
										<div style={{
											position: 'absolute',
											bottom: '15px',
											fontSize: '0.7rem',
											fontFamily: 'var(--font-mono)',
											fontWeight: 'bold',
											letterSpacing: '1px',
											color: faceStatus === 'looking' ? '#10b981' : faceStatus === 'away' ? '#ef4444' : '#f59e0b',
											background: 'rgba(0,0,0,0.7)',
											padding: '0.2rem 0.5rem',
											borderRadius: '0.25rem',
											border: '1px solid rgba(255,255,255,0.05)'
										}}>
											{faceStatus === 'looking' ? 'TARGET LOCK INTACT' : faceStatus === 'away' ? 'GAZE DEVIATION WARNING' : 'NO TARGET DETECTED'}
										</div>
									</div>
								)}
							</div>

							{/* Proctoring Controls & Status */}
							<div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
								<div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: '0.5rem', padding: '1rem' }}>
									<h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Active Detectors</h4>
									<div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8rem' }}>
										<div style={{ display: 'flex', justifyContent: 'space-between' }}>
											<span style={{ color: 'var(--text-secondary)' }}>Tab/Window Focus</span>
											<span style={{ color: candidate?.status === 'evaluating' || interviewActive ? 'var(--color-success)' : 'var(--text-muted)' }}>
												{candidate?.status === 'evaluating' || interviewActive ? '● Active' : '○ Standby'}
											</span>
										</div>
										<div style={{ display: 'flex', justifyContent: 'space-between' }}>
											<span style={{ color: 'var(--text-secondary)' }}>Face Detection (MediaPipe)</span>
											<span style={{ color: faceStatus === 'looking' ? 'var(--color-success)' : faceStatus === 'away' ? 'var(--color-failure)' : webcamActive ? 'var(--color-warning)' : 'var(--text-muted)' }}>
												{faceStatus === 'looking' ? '● Tracking' : faceStatus === 'away' ? '⚠ AWAY' : webcamActive ? '● No Face' : '○ Off'}
											</span>
										</div>
										<div style={{ display: 'flex', justifyContent: 'space-between' }}>
											<span style={{ color: 'var(--text-secondary)' }}>Audio Monitor</span>
											<span style={{ color: webcamActive ? 'var(--color-success)' : 'var(--text-muted)' }}>
												{webcamActive ? '● Active' : '○ Standby'}
											</span>
										</div>
									</div>
								</div>

								{webcamActive && (
									<div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: '0.5rem', padding: '1rem' }}>
										<div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
											<span>🎙 Microphone Activity:</span>
											<span style={{ color: audioLevel > 0.15 ? 'var(--color-success)' : 'var(--text-muted)', fontWeight: 'bold' }}>
												{audioLevel > 0.15 ? 'SPEECH DETECTED' : 'Silence'}
											</span>
										</div>
										<div style={{ height: '6px', background: '#09070a', borderRadius: '3px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)' }}>
											<div style={{
												height: '100%',
												width: `${audioLevel * 100}%`,
												background: audioLevel > 0.15 ? 'linear-gradient(90deg, #10b981 0%, #3b82f6 100%)' : '#64748b',
												transition: 'width 0.1s ease',
												boxShadow: audioLevel > 0.15 ? '0 0 8px rgba(16, 185, 129, 0.4)' : 'none'
											}} />
										</div>
									</div>
								)}

								<div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: '0.5rem', padding: '1rem' }}>
									<h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Simulate Alerts (Demo)</h4>
									<div style={{ display: 'flex', gap: '0.5rem' }}>
										<button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem', flex: 1 }} onClick={() => simulateAlert('look_away')}>
											👁 Look Away
										</button>
										<button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem', flex: 1 }} onClick={() => simulateAlert('voice_detected')}>
											🎤 Voice Alert
										</button>
									</div>
								</div>
							</div>
						</div>
					</div>
				)}

				{/* Interactive AI Proctoring Timeline & Webcam HUD */}
				{candidate.status === 'completed' && proctoring.length > 0 && (
					<div className="panel" style={{ border: '1px solid rgba(244,63,94,0.2)', background: 'rgba(244,63,94,0.01)' }}>
						<div className="panel-header" style={{ color: 'var(--color-failure)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
							<span>✗ AI Proctoring & Focus Plagiarism Timeline</span>
							<span className="badge failed">Camera & OS Security Monitor</span>
						</div>
						
						<div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '2rem', marginTop: '1rem' }}>
							
							{/* Video Stream Mockup & Progress Timeline */}
							<div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
								{/* Video Display Monitor */}
								<div style={{
									height: '240px',
									background: '#09070a',
									border: `2px solid ${selectedProctorEvent?.event_type === 'look_away' ? '#f43f5e' : selectedProctorEvent?.event_type === 'tab_switch' ? '#f59e0b' : '#3b82f6'}`,
									borderRadius: '0.75rem',
									position: 'relative',
									display: 'flex',
									justifyContent: 'center',
									alignItems: 'center',
									flexDirection: 'column',
									overflow: 'hidden',
									boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
								}}>
									<div style={{ position: 'absolute', top: '10px', left: '12px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
										<span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', animation: 'pulse 1.5s infinite' }}></span>
										<span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>REC [WEBCAM_01]</span>
									</div>
									<div style={{ position: 'absolute', top: '10px', right: '12px', fontSize: '0.7rem', color: 'var(--color-failure)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
										ALERT STATUS: {selectedProctorEvent?.event_type.replace('_', ' ').toUpperCase()}
									</div>

									{selectedProctorEvent?.event_type === 'look_away' && (
										<div style={{ textAlign: 'center' }}>
											<svg width="70" height="70" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" strokeWidth="1.5">
												<circle cx="12" cy="12" r="10"/>
												<path d="M16 14c0-1.5-1.8-3-4-3s-4 1.5-4 3"/>
												<circle cx="8" cy="9" r="1"/>
												<circle cx="12" cy="9" r="1"/>
												<path d="M15 7l3-3m0 0h-3m3 0v3"/>
											</svg>
											<p style={{ color: '#f43f5e', fontSize: '0.85rem', fontWeight: 700, marginTop: '0.75rem', textTransform: 'uppercase' }}>Eye-Tracking: Focus off-screen alert</p>
										</div>
									)}

									{selectedProctorEvent?.event_type === 'tab_switch' && (
										<div style={{ textAlign: 'center' }}>
											<svg width="70" height="70" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.5">
												<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
												<line x1="9" y1="3" x2="9" y2="21"/>
												<path d="M12 9l3 3-3 3"/>
											</svg>
											<p style={{ color: '#f59e0b', fontSize: '0.85rem', fontWeight: 700, marginTop: '0.75rem', textTransform: 'uppercase' }}>OS Window: Focus blur alert</p>
										</div>
									)}

									{selectedProctorEvent?.event_type === 'voice_detected' && (
										<div style={{ textAlign: 'center' }}>
											<svg width="70" height="70" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.5">
												<path d="M12 3v18M17 8v8M7 8v8M22 10v4M2 10v4"/>
											</svg>
											<p style={{ color: '#3b82f6', fontSize: '0.85rem', fontWeight: 700, marginTop: '0.75rem', textTransform: 'uppercase' }}>Audio Audit: Secondary speech warning</p>
										</div>
									)}

									<div style={{
										position: 'absolute',
										inset: 0,
										background: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06))',
										backgroundSize: '100% 4px, 6px 100%',
										pointerEvents: 'none'
									}}></div>
								</div>

								<div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
									<div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
										<span>Session Start (00:00)</span>
										<span>10:00 Cap</span>
									</div>
									<div style={{
										height: '10px',
										background: '#18151f',
										borderRadius: '5px',
										position: 'relative',
										border: '1px solid rgba(255,255,255,0.05)',
										boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.8)'
									}}>
										{proctoring.map((p) => {
											const leftPercent = getTimelinePercent(p.timestamp);
											const isSelected = selectedProctorEvent?.id === p.id;
											return (
												<div
													key={p.id}
													onClick={() => setSelectedProctorEvent(p)}
													style={{
														position: 'absolute',
														left: `${leftPercent}%`,
														top: '50%',
														transform: 'translate(-50%, -50%)',
														width: isSelected ? '18px' : '12px',
														height: isSelected ? '18px' : '12px',
														borderRadius: '50%',
														background: p.event_type === 'look_away' ? '#f43f5e' : p.event_type === 'tab_switch' ? '#f59e0b' : '#3b82f6',
														border: '2px solid #ffffff',
														cursor: 'pointer',
														transition: 'all 0.2s',
														boxShadow: '0 0 10px rgba(0,0,0,0.8)'
													}}
													title={`${p.event_type} at ${p.timestamp}`}
												/>
											);
										})}
									</div>
								</div>
							</div>

							{selectedProctorEvent && (
								<div style={{
									background: 'rgba(255,255,255,0.02)',
									border: '1px solid var(--border-color)',
									padding: '1.25rem',
									borderRadius: '0.5rem',
									display: 'flex',
									flexDirection: 'column',
									gap: '1rem',
									justifyContent: 'space-between'
								}}>
									<div>
										<h4 style={{ color: 'var(--text-primary)', fontSize: '1rem', fontWeight: 700, textTransform: 'capitalize' }}>
											{selectedProctorEvent.event_type.replace('_', ' ')}
										</h4>
										<span style={{ fontSize: '0.8rem', color: 'var(--color-failure)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
											Anomaly Timestamp: {selectedProctorEvent.timestamp}
										</span>
										<p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.5rem', lineHeight: '1.5' }}>
											{selectedProctorEvent.details}
										</p>
									</div>

									<div>
										<div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.5rem' }}>
											<span style={{ color: 'var(--text-muted)' }}>Focus Out Time</span>
											<span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{selectedProctorEvent.duration} seconds</span>
										</div>
										<div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginTop: '0.5rem' }}>
											<span style={{ color: 'var(--text-muted)' }}>Vetting Impact</span>
											<span className="badge failed" style={{ fontSize: '0.7rem' }}>HIGH RISK EXPOSURE</span>
										</div>
									</div>
								</div>
							)}
						</div>

						{/* Playback player */}
						{candidate.recording_s3_url && (
							<div style={{ marginTop: '1.5rem', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: '0.5rem', padding: '1rem' }}>
								<h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>
									🎥 Recorded Screening Interview Playback
								</h4>
								<video
									src={candidate.recording_s3_url.startsWith('s3://') 
										? `${apiBase}/recordumes/${candidate.id}_interview.webm` 
										: candidate.recording_s3_url}
									controls
									playsInline
									style={{
										width: '100%',
										maxHeight: '280px',
										borderRadius: '0.35rem',
										border: '1px solid rgba(255,255,255,0.05)',
										background: '#000000'
									}}
								/>
								<p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem', fontFamily: 'var(--font-mono)' }}>
									Bucket Location: {candidate.recording_s3_url}
								</p>
							</div>
						)}

					</div>
				)}

				{/* Verification scorecards (when completed) */}
				{candidate.status === 'completed' && audits.length > 0 && (
					<div style={{ marginTop: '2rem' }}>
						<h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '1rem', background: 'linear-gradient(135deg, var(--text-primary) 50%, var(--color-accent) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
							Grounded Claims Audit Trail
						</h2>

						<div style={{ display: 'grid', gridTemplateColumns: '0.4fr 0.6fr', gap: '1.5rem' }}>
							
							{/* Audit Grid list */}
							<div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
								{audits.map((a) => (
									<div
										key={a.id}
										className={`test-item ${selectedAudit?.id === a.id ? 'selected' : ''}`}
										onClick={() => setSelectedAudit(a)}
										style={{ flex: 1, padding: '1.25rem', cursor: 'pointer' }}
									>
										<div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '90%' }}>
											<span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>Claim under review:</span>
											<span style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 700, lineHeight: '1.4' }}>
												&ldquo;{a.claim_text}&rdquo;
											</span>
											<span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
												Verified in: <strong style={{ color: 'var(--color-accent)' }}>{a.file_path.split(':')[0]}</strong>
											</span>
										</div>
										<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'space-between', height: '100%' }}>
											<span className={`badge ${a.status === 'verified' ? 'passed' : a.status === 'exaggerated' ? 'wait-hitl' : 'failed'}`}>
												{a.status.toUpperCase()}
											</span>
										</div>
									</div>
								))}
							</div>

							{/* Audit details with code highlights diff window */}
							{selectedAudit && (
								<div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1.5rem' }}>
									<div className="panel-header" style={{ color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
										<span>Verification Citation</span>
										<span className={`badge ${selectedAudit.status === 'verified' ? 'passed' : selectedAudit.status === 'exaggerated' ? 'wait-hitl' : 'failed'}`}>
											{selectedAudit.status.toUpperCase()}
										</span>
									</div>

									<div>
										<h4 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Audit Evidence:</h4>
										<p style={{ fontSize: '0.95rem', color: '#e2e8f0', lineHeight: '1.5', marginTop: '0.25rem' }}>
											{selectedAudit.evidence_text}
										</p>
									</div>

									<div style={{
										background: '#09070a',
										borderRadius: '0.5rem',
										border: '1px solid rgba(255,255,255,0.05)',
										overflow: 'hidden',
										fontFamily: 'var(--font-mono)',
										display: 'flex',
										flexDirection: 'column'
									}}>
										<div style={{
											background: '#120f18',
											padding: '0.5rem 1rem',
											fontSize: '0.75rem',
											color: 'var(--text-muted)',
											borderBottom: '1px solid rgba(255,255,255,0.04)',
											display: 'flex',
											justifyContent: 'space-between',
											alignItems: 'center'
										}}>
											<span>📂 {selectedAudit.file_path}</span>
											<span style={{ color: 'var(--color-accent)', fontWeight: 600 }}>ZaraSourcing Vetted Code</span>
										</div>
										
										<div style={{
											padding: '1rem',
											fontSize: '0.8rem',
											overflowX: 'auto',
											lineHeight: '1.5',
											background: 'rgba(16, 185, 129, 0.01)'
										}}>
											{selectedAudit.file_path !== 'Resume Text' ? (
												<div style={{ display: 'flex', gap: '1rem' }}>
													<div style={{ color: 'rgba(255,255,255,0.15)', userSelect: 'none', textAlign: 'right' }}>
														<div>01</div>
														<div>02</div>
														<div>03</div>
														<div>04</div>
														<div>05</div>
													</div>
													<div style={{ color: '#10b981', flex: 1 }}>
														{/* Code Quote Mockup */}
														<span style={{ color: 'rgba(255,255,255,0.4)' }}>{"// Audited functional footprints matched:"}</span>
														<br />
														{selectedAudit.evidence_text.includes('WAL') ? (
															<code>
																{"db, err := sql.Open(\"sqlite\", path)"}
																<br />
																<span style={{ background: 'rgba(16,185,129,0.1)', display: 'block' }}>{"db.Exec(\"PRAGMA journal_mode=WAL;\") // WAL Connection Wrapper verified"}</span>
															</code>
														) : selectedAudit.evidence_text.includes('state') ? (
															<code>
																{"const [weight, setWeight] = useState(50);"}
																<br />
																<span style={{ background: 'rgba(16,185,129,0.1)', display: 'block' }}>{"<input type=\"range\" value={weight} onChange={e => setWeight(Number(e.target.value))} />"}</span>
															</code>
														) : (
															<code>
																<span style={{ background: 'rgba(244,63,94,0.1)', display: 'block' }}>{"// No matching repository codebase exists for this claim"}</span>
															</code>
														)}
													</div>
												</div>
											) : (
												<div style={{ color: 'var(--text-secondary)', fontStyle: 'italic', textAlign: 'center', padding: '1rem' }}>
													Verified purely by structural resume context. No code file associated.
												</div>
											)}
										</div>
									</div>
								</div>
							)}

						</div>
					</div>
				)}

			</div>
		</div>
	);
}
