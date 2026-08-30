'use client';
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';

interface Question { id: number; question: string; order_index: number; }
interface Session { id: string; candidate_id: string; job_id: string; token: string; status: string; interview_score: number; fit_summary: string; }
interface Candidate { id: string; name: string; role: string; }

type Phase = 'loading' | 'intro' | 'interview' | 'submitting' | 'done' | 'error';

export default function InterviewPage() {
	const { token } = useParams() as { token: string };
	const [phase, setPhase] = useState<Phase>('loading');
	const [session, setSession] = useState<Session | null>(null);
	const [candidate, setCandidate] = useState<Candidate | null>(null);
	const [questions, setQuestions] = useState<Question[]>([]);
	const [currentIdx, setCurrentIdx] = useState(0);
	const [answers, setAnswers] = useState<Record<string, string>>({});
	const answersRef = useRef<Record<string, string>>({});
	const [isListening, setIsListening] = useState(false);
	const [isSpeaking, setIsSpeaking] = useState(false);
	const [transcript, setTranscript] = useState('');
	const [errorMsg, setErrorMsg] = useState('');
	const [finalScore, setFinalScore] = useState(0);
	const [fitSummary, setFitSummary] = useState('');
	const [faceStatus, setFaceStatus] = useState<'no_face' | 'locked' | 'deviation'>('no_face');
	const [tabSwitchCount, setTabSwitchCount] = useState(0);
	const lookAwayStartRef = useRef<number | null>(null);
	const lastProctorPostRef = useRef<number>(0);

	// Webcam + AR
	const videoRef = useRef<HTMLVideoElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const faceLandmarkerRef = useRef<any>(null);
	const animFrameRef = useRef<number>(0);
	const activeRef = useRef(false);

	// Video recording
	const mediaRecorderRef = useRef<MediaRecorder | null>(null);
	const recordedChunksRef = useRef<Blob[]>([]);

	// Speech
	const recognitionRef = useRef<any>(null);
	const listenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const accumulatedRef = useRef('');
	const listenModeRef = useRef<'intro' | 'question' | 'confirm'>('intro');
	const listenQuestionIdxRef = useRef(0);
	const pendingAdvanceRef = useRef<'intro' | number>('intro');
	const lastSpeechAtRef = useRef(0);
	const [awaitingConfirm, setAwaitingConfirm] = useState(false);
	const awaitingConfirmRef = useRef(false);

	// Intro phase: track if greeting has been spoken
	const greetingDoneRef = useRef(false);

	const SILENCE_BEFORE_PROMPT_MS = 15000;
	const SILENCE_AUTO_ADVANCE_MS = 10000;
	const MAX_ANSWER_MS = 120000;

	const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

	const clearListenTimers = () => {
		if (listenTimerRef.current) clearTimeout(listenTimerRef.current);
		if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
		if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
		listenTimerRef.current = null;
		silenceTimerRef.current = null;
		confirmTimerRef.current = null;
	};

	const stopRecognition = () => {
		if (recognitionRef.current) {
			try { recognitionRef.current.stop(); } catch { /* ignore */ }
			recognitionRef.current = null;
		}
	};

	const saysAdvance = (text: string) => {
		const t = text.toLowerCase().trim();
		return /\b(yes|yeah|yep|sure|continue|next|done|that'?s all|that is all|go ahead|move on|i'?m done|im done|no more)\b/.test(t);
	};

	const saysStillAnswering = (text: string) => {
		const t = text.toLowerCase().trim();
		return t.length > 12 && !saysAdvance(t) && !/\b(no|wait|hold on|not yet|one moment)\b/.test(t);
	};

	const scheduleSilencePrompt = () => {
		if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
		silenceTimerRef.current = setTimeout(() => {
			promptContinueToNext();
		}, SILENCE_BEFORE_PROMPT_MS);
	};

	const saveCurrentAnswer = () => {
		const text = accumulatedRef.current.trim();
		let merged = { ...answersRef.current };
		if (listenModeRef.current === 'intro' || pendingAdvanceRef.current === 'intro') {
			merged = { ...merged, intro: text };
		} else {
			const idx = typeof pendingAdvanceRef.current === 'number'
				? pendingAdvanceRef.current
				: listenQuestionIdxRef.current;
			const q = questions[idx];
			if (q) merged = { ...merged, [String(q.id)]: text };
		}
		answersRef.current = merged;
		setAnswers(merged);
		setTranscript(text);
		return merged;
	};

	const submitInterview = async (answersOverride?: Record<string, string>) => {
		if (!session) return;
		clearListenTimers();
		stopRecognition();
		setPhase('submitting');
		await stopCamera();
		const payload = answersOverride ?? answersRef.current;
		try {
			const res = await fetch(`${apiBase}/api/interview/complete`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ session_id: session.id, answers: payload, job_title: candidate?.role || 'Software Engineer' }),
			});
			const data = await res.json();
			setFinalScore(data.score);
			setFitSummary(data.fit_summary);
			setPhase('done');
		} catch {
			setPhase('done');
			setFinalScore(0);
			setFitSummary('Interview submitted. Results will be reviewed by the hiring team.');
		}
	};

	const advanceAfterQuestion = (idx: number) => {
		awaitingConfirmRef.current = false;
		setAwaitingConfirm(false);
		clearListenTimers();
		stopRecognition();
		saveCurrentAnswer();
		const next = idx + 1;
		if (next < questions.length) {
			setCurrentIdx(next);
			speakQuestion(next);
		} else {
			submitInterview(answersRef.current);
		}
	};

	const advanceFromIntro = () => {
		awaitingConfirmRef.current = false;
		setAwaitingConfirm(false);
		clearListenTimers();
		stopRecognition();
		saveCurrentAnswer();
		setCurrentIdx(0);
		speakQuestion(0);
	};

	const finishConfirmAdvance = () => {
		if (pendingAdvanceRef.current === 'intro') advanceFromIntro();
		else advanceAfterQuestion(pendingAdvanceRef.current as number);
	};

	const promptContinueToNext = async () => {
		if (awaitingConfirmRef.current || isSpeaking) return;
		pendingAdvanceRef.current = listenModeRef.current === 'intro'
			? 'intro'
			: listenQuestionIdxRef.current;
		awaitingConfirmRef.current = true;
		setAwaitingConfirm(true);
		stopRecognition();
		clearListenTimers();
		setIsListening(false);

		const prompt = "Are you done? I didn't hear anything for a while. Should I continue to the next question? Say yes to continue, or keep speaking if you're not finished.";
		setIsSpeaking(true);
		await speak(prompt, () => {
			setIsSpeaking(false);
			startConfirmListening();
		});
	};

	const startConfirmListening = () => {
		const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
		if (!SR) {
			finishConfirmAdvance();
			return;
		}

		listenModeRef.current = 'confirm';
		const recognition = new SR();
		recognition.continuous = true;
		recognition.interimResults = true;
		recognition.lang = 'en-US';
		let heard = '';

		recognition.onresult = (event: any) => {
			let t = '';
			for (let i = event.resultIndex; i < event.results.length; i++) t += event.results[i][0].transcript;
			heard = t.trim();
			setTranscript(heard);
			lastSpeechAtRef.current = Date.now();
			if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
			confirmTimerRef.current = setTimeout(() => {
				if (listenModeRef.current !== 'confirm') return;
				if (saysAdvance(heard)) finishConfirmAdvance();
				else if (saysStillAnswering(heard)) {
					awaitingConfirmRef.current = false;
					setAwaitingConfirm(false);
					accumulatedRef.current = heard;
					stopRecognition();
					if (pendingAdvanceRef.current === 'intro') startListeningForGreeting();
					else startListening(pendingAdvanceRef.current as number);
				}
			}, 2500);
		};

		recognition.onend = () => {
			if (listenModeRef.current === 'confirm') setIsListening(false);
		};

		recognitionRef.current = recognition;
		recognition.start();
		setIsListening(true);

		confirmTimerRef.current = setTimeout(() => {
			if (listenModeRef.current !== 'confirm') return;
			finishConfirmAdvance();
		}, SILENCE_AUTO_ADVANCE_MS);
	};

	const startAnswerListening = (mode: 'intro' | 'question', questionIdx = 0) => {
		const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
		if (!SR) {
			if (mode === 'intro') { advanceFromIntro(); return; }
			advanceAfterQuestion(questionIdx);
			return;
		}

		awaitingConfirmRef.current = false;
		setAwaitingConfirm(false);
		clearListenTimers();
		stopRecognition();

		listenModeRef.current = mode;
		listenQuestionIdxRef.current = questionIdx;
		accumulatedRef.current = '';
		lastSpeechAtRef.current = Date.now();

		const recognition = new SR();
		recognition.continuous = true;
		recognition.interimResults = true;
		recognition.lang = 'en-US';

		recognition.onresult = (event: any) => {
			let t = '';
			for (let i = event.resultIndex; i < event.results.length; i++) t += event.results[i][0].transcript;
			accumulatedRef.current = t;
			setTranscript(t);
			lastSpeechAtRef.current = Date.now();
			scheduleSilencePrompt();

			if (mode === 'question' && saysAdvance(t) && t.trim().length < 40) {
				setTimeout(() => {
					if (listenModeRef.current === 'question') advanceAfterQuestion(questionIdx);
				}, 800);
			}
		};

		recognition.onend = () => {
			if (listenModeRef.current === 'question' || listenModeRef.current === 'intro') {
				setIsListening(false);
			}
		};

		recognitionRef.current = recognition;
		recognition.start();
		setIsListening(true);
		setIsSpeaking(false);
		scheduleSilencePrompt();

		listenTimerRef.current = setTimeout(() => {
			if (listenModeRef.current === 'intro') advanceFromIntro();
			else advanceAfterQuestion(questionIdx);
		}, MAX_ANSWER_MS);
	};

	useEffect(() => { loadSession(); }, [token]);

	// Tab-switch proctoring
	useEffect(() => {
		if (phase !== 'interview' || !candidate) return;
		const onBlur = () => {
			setTabSwitchCount(n => n + 1);
			postProctorEvent('tab_switch', 0, 'Candidate switched away from interview window');
		};
		window.addEventListener('blur', onBlur);
		return () => window.removeEventListener('blur', onBlur);
	}, [phase, candidate]);

	const postProctorEvent = async (eventType: string, duration: number, details: string) => {
		if (!candidate) return;
		const now = Date.now();
		if (now - lastProctorPostRef.current < 3000) return;
		lastProctorPostRef.current = now;
		const mins = Math.floor((Date.now() - (session?.created_at ? new Date(session.created_at).getTime() : Date.now())) / 60000);
		const secs = Math.floor(((Date.now() - (session?.created_at ? new Date(session.created_at).getTime() : Date.now())) % 60000) / 1000);
		const ts = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
		try {
			await fetch(`${apiBase}/api/proctoring`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ candidate_id: candidate.id, timestamp: ts, event_type: eventType, duration, details }),
			});
		} catch { /* non-blocking */ }
	};

	const loadSession = async () => {
		if (!token || token.length < 10) {
			setErrorMsg('Invalid interview link. Please use the link sent to you after applying.');
			setPhase('error');
			return;
		}
		try {
			const res = await fetch(`${apiBase}/api/interview/${token}`);
			if (!res.ok) throw new Error('Interview session not found. This link may be invalid or expired.');
			const data = await res.json();
			setSession(data.session);
			setCandidate(data.candidate);
			setQuestions(data.questions || []);
			if (data.session.status === 'completed') {
				setFinalScore(data.session.interview_score);
				setFitSummary(data.session.fit_summary);
				setPhase('done');
			} else {
				setPhase('intro');
			}
		} catch (err) {
			setErrorMsg((err as Error).message);
			setPhase('error');
		}
	};

	const startInterview = async () => {
		setPhase('interview');
		await startCamera();
		speakGreeting();
	};

	// Speak warm greeting + "tell us about yourself" before Q1
	const speakGreeting = async () => {
		if (greetingDoneRef.current) { speakQuestion(0); return; }
		greetingDoneRef.current = true;
		setIsSpeaking(true);
		setTranscript('');

		const firstName = candidate?.name?.split(' ')[0] || 'there';
		const role = candidate?.role || 'this role';
		const greeting = `Hi ${firstName}! Welcome to your AI-powered interview for ${role}. I hope you're feeling great today. Before we dive into the technical questions, could you please tell us a little bit about yourself and your background?`;

		await speak(greeting, () => {
			startListeningForGreeting();
		});
	};

	const startListeningForGreeting = () => {
		startAnswerListening('intro');
	};

	const speak = async (text: string, onDone: () => void) => {
		try {
			const audio = new Audio(`${apiBase}/api/speak?text=${encodeURIComponent(text)}`);
			audio.onended = onDone;
			audio.onerror = onDone;
			await audio.play();
		} catch {
			if (window.speechSynthesis) {
				window.speechSynthesis.cancel();
				const utt = new SpeechSynthesisUtterance(text);
				utt.onend = onDone;
				window.speechSynthesis.speak(utt);
			} else {
				onDone();
			}
		}
	};

	const startCamera = async () => {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: true });
			streamRef.current = stream;
			if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
			activeRef.current = true;

			// Start recording
			try {
				const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' });
				recorder.ondataavailable = e => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
				recorder.start(1000);
				mediaRecorderRef.current = recorder;
			} catch { /* recording optional */ }

			// AR face tracking — load model from Google CDN (works on Railway without bundling)
			try {
				const vision = await import('@mediapipe/tasks-vision');
				const filesetResolver = await vision.FilesetResolver.forVisionTasks('/wasm');
				const modelPath = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
				const landmarker = await vision.FaceLandmarker.createFromOptions(filesetResolver, {
					baseOptions: { modelAssetPath: modelPath, delegate: 'GPU' },
					runningMode: 'VIDEO',
					numFaces: 1,
					outputFaceBlendshapes: false,
				});
				faceLandmarkerRef.current = landmarker;
				runARLoop();
			} catch (e) {
				console.warn('AR init failed, continuing without face mesh:', e);
			}
		} catch { /* camera denied */ }
	};

	const runARLoop = () => {
		const detect = () => {
			if (!activeRef.current || !videoRef.current || !faceLandmarkerRef.current) return;
			const video = videoRef.current;
			if (video.readyState < 2) { animFrameRef.current = requestAnimationFrame(detect); return; }
			try {
				const results = faceLandmarkerRef.current.detectForVideo(video, performance.now());
				const canvas = canvasRef.current;
				const ctx = canvas?.getContext('2d');
				if (canvas && ctx) {
					canvas.width = video.videoWidth;
					canvas.height = video.videoHeight;
					ctx.clearRect(0, 0, canvas.width, canvas.height);
					if (results.faceLandmarks?.length > 0) {
						const lms = results.faceLandmarks[0];
						const w = canvas.width;
						const h = canvas.height;

						// Gaze: compare nose tip (1) to face center
						const nose = lms[1];
						const leftCheek = lms[234];
						const rightCheek = lms[454];
						const faceCenterX = (leftCheek.x + rightCheek.x) / 2;
						const gazeOffset = Math.abs(nose.x - faceCenterX);
						const isLocked = gazeOffset < 0.04;
						const status = isLocked ? 'locked' : 'deviation';
						setFaceStatus(status);

						if (!isLocked) {
							if (!lookAwayStartRef.current) lookAwayStartRef.current = Date.now();
						} else if (lookAwayStartRef.current) {
							const dur = Math.round((Date.now() - lookAwayStartRef.current) / 1000);
							if (dur > 2) postProctorEvent('look_away', dur, `Gaze deviation detected for ${dur}s`);
							lookAwayStartRef.current = null;
						}

						const meshColor = isLocked ? 'rgba(16,185,129,0.55)' : 'rgba(239,68,68,0.55)';
						const boxColor = isLocked ? '#10b981' : '#ef4444';

						ctx.fillStyle = meshColor;
						for (const lm of lms) {
							ctx.beginPath();
							ctx.arc(lm.x * w, lm.y * h, 1.1, 0, Math.PI * 2);
							ctx.fill();
						}

						const xs = lms.map((l: { x: number }) => l.x * w);
						const ys = lms.map((l: { y: number }) => l.y * h);
						const bx = Math.min(...xs) - 12;
						const by = Math.min(...ys) - 12;
						const bw = Math.max(...xs) - bx + 12;
						const bh = Math.max(...ys) - by + 12;
						ctx.strokeStyle = boxColor;
						ctx.lineWidth = 2;
						ctx.strokeRect(bx, by, bw, bh);

						// Status label
						ctx.fillStyle = isLocked ? 'rgba(16,185,129,0.85)' : 'rgba(239,68,68,0.85)';
						ctx.fillRect(bx, by - 22, 110, 18);
						ctx.fillStyle = '#fff';
						ctx.font = 'bold 10px monospace';
						ctx.fillText(isLocked ? 'LOCKED ON' : 'GAZE DEVIATION', bx + 4, by - 9);
					} else {
						setFaceStatus('no_face');
					}
				}
			} catch { /* frame skip */ }
			animFrameRef.current = requestAnimationFrame(detect);
		};
		animFrameRef.current = requestAnimationFrame(detect);
	};

	const stopCamera = async () => {
		activeRef.current = false;
		cancelAnimationFrame(animFrameRef.current);

		// Stop recorder and upload
		if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
			mediaRecorderRef.current.stop();
			await new Promise(r => setTimeout(r, 800)); // wait for final chunk
		}
		if (recordedChunksRef.current.length > 0 && session && candidate) {
			try {
				const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
				const form = new FormData();
				form.append('video', blob, 'interview.webm');
				form.append('candidate_id', candidate.id);
				await fetch(`${apiBase}/api/candidates/recording`, { method: 'POST', body: form });
			} catch { /* upload optional */ }
		}

		streamRef.current?.getTracks().forEach(t => t.stop());
		streamRef.current = null;
	};

	const speakQuestion = async (idx: number) => {
		if (!questions[idx]) return;
		setIsSpeaking(true);
		setIsListening(false);
		setTranscript('');
		clearListenTimers();
		stopRecognition();

		const text = `Question ${idx + 1}: ${questions[idx].question}`;
		await speak(text, () => { setIsSpeaking(false); startListening(idx); });
	};

	const startListening = (idx: number) => {
		startAnswerListening('question', idx);
	};

	const saveAndNext = () => {
		if (pendingAdvanceRef.current === 'intro' || listenModeRef.current === 'intro') advanceFromIntro();
		else advanceAfterQuestion(listenQuestionIdxRef.current);
	};

	const currentQ = questions[currentIdx];
	const progress = questions.length > 0 ? (currentIdx / questions.length) * 100 : 0;

	if (phase === 'loading') return (
		<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
			<p style={{ color: 'var(--text-secondary)' }}>Loading your interview session...</p>
		</div>
	);

	if (phase === 'error') return (
		<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
			<div className="panel" style={{ maxWidth: '480px', textAlign: 'center', padding: '2.5rem' }}>
				<p style={{ fontSize: '2rem', marginBottom: '1rem' }}>⚠️</p>
				<h2 style={{ color: 'var(--color-failure)', marginBottom: '0.5rem' }}>Access Denied</h2>
				<p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{errorMsg}</p>
				<p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '1rem' }}>This interview room is only accessible via your personal interview link.</p>
			</div>
		</div>
	);

	if (phase === 'done') return (
		<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
			<div className="panel" style={{ maxWidth: '560px', width: '100%', padding: '2.5rem', textAlign: 'center' }}>
				<div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎉</div>
				<h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Interview Complete</h2>
				<p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '2rem' }}>Your responses have been recorded, scored by AI, and your video has been saved.</p>
				<div style={{ padding: '1.5rem', background: 'rgba(99,102,241,0.05)', border: '1px solid var(--border-color)', borderRadius: '0.75rem', marginBottom: '1.5rem' }}>
					<p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Your Interview Score</p>
					<p style={{ fontSize: '3.5rem', fontWeight: 900, fontFamily: 'var(--font-mono)', color: finalScore >= 75 ? '#10b981' : finalScore >= 50 ? '#f59e0b' : '#ef4444', margin: 0 }}>{finalScore}%</p>
					<p style={{ fontSize: '0.8rem', marginTop: '0.5rem', fontWeight: 700, color: finalScore >= 75 ? '#10b981' : finalScore >= 50 ? '#f59e0b' : '#ef4444' }}>
						{finalScore >= 75 ? 'STRONG FIT' : finalScore >= 50 ? 'POSSIBLE FIT' : 'NOT A FIT'}
					</p>
				</div>
				{fitSummary && (
					<div style={{ padding: '1.25rem', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: '0.5rem', textAlign: 'left' }}>
						<p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.5rem', textTransform: 'uppercase' }}>AI Feedback</p>
						<p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>{fitSummary}</p>
					</div>
				)}
				<p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '1.5rem' }}>The hiring team will review your results and be in touch.</p>
			</div>
		</div>
	);

	if (phase === 'submitting') return (
		<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
			<div style={{ textAlign: 'center' }}>
				<div style={{ width: '48px', height: '48px', border: '3px solid var(--border-color)', borderTopColor: 'var(--color-accent)', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 1rem auto' }} />
				<p style={{ color: 'var(--text-secondary)' }}>Saving your video and scoring your interview...</p>
			</div>
		</div>
	);

	if (phase === 'intro') return (
		<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
			<div className="panel" style={{ maxWidth: '560px', width: '100%', padding: '2.5rem', textAlign: 'center' }}>
				<div className="logo-icon" style={{ margin: '0 auto 1.5rem auto', background: 'linear-gradient(135deg, var(--color-accent) 0%, #a855f7 100%)', width: '3rem', height: '3rem', fontSize: '1rem' }}>ZS</div>
				<h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
					Hi {candidate?.name?.split(' ')[0] || 'there'} 👋
				</h2>
				<p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '2rem', lineHeight: '1.6' }}>
					You&apos;re about to take an AI-powered voice interview for <strong style={{ color: 'var(--text-primary)' }}>{candidate?.role}</strong>.
					The AI will greet you, ask you to introduce yourself, then ask {questions.length} technical question{questions.length !== 1 ? 's' : ''}. Just speak naturally.
				</p>
				<div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '2rem', textAlign: 'left', padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '0.5rem', border: '1px solid var(--border-color)' }}>
					{[
						'Allow microphone & camera access when prompted',
						'Speak clearly — answers are transcribed live',
						'Pause when done — the AI will ask before moving on',
						'Say "yes" or stay silent to continue to the next question',
						`Intro + ${questions.length} technical questions — ~10 minutes`
					].map((tip, i) => (
						<div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
							<span style={{ color: 'var(--color-accent)' }}>✓</span> {tip}
						</div>
					))}
				</div>
				<button className="btn btn-primary" style={{ width: '100%', padding: '1rem', fontSize: '1rem', fontWeight: 700 }} onClick={startInterview}>
					Start Interview →
				</button>
			</div>
		</div>
	);

	// Interview phase
	const isGreetingPhase = !greetingDoneRef.current || (currentIdx === 0 && isSpeaking && questions.length > 0);

	return (
		<div className="interview-grid">
			{/* Left — question + transcript */}
			<div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
				{/* Progress */}
				<div>
					<div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
						<span>{greetingDoneRef.current ? `Question ${currentIdx + 1} of ${questions.length}` : 'Introduction'}</span>
						<span style={{ color: isListening ? '#10b981' : isSpeaking ? 'var(--color-accent)' : 'var(--text-muted)', fontWeight: 600 }}>
							{isSpeaking ? '🔊 AI Speaking...' : isListening ? (awaitingConfirm ? '🎙 Waiting for yes/no...' : '🎙 Listening...') : ''}
						</span>
					</div>
					<div style={{ height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
						<div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg, var(--color-accent), #a855f7)', transition: 'width 0.5s ease', borderRadius: '2px' }} />
					</div>
				</div>

				{/* Question card */}
				<div style={{ padding: '2rem', background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '0.75rem' }}>
					<p style={{ fontSize: '0.75rem', color: 'var(--color-accent)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
						{greetingDoneRef.current ? `Question ${currentIdx + 1}` : 'Introduction'}
					</p>
					<p style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: '1.5' }}>
						{greetingDoneRef.current ? currentQ?.question : 'Tell us about yourself and your background.'}
					</p>
				</div>

				{/* Live transcript */}
				<div style={{ flex: 1, padding: '1.5rem', background: 'rgba(255,255,255,0.02)', border: `1px solid ${isListening ? 'rgba(16,185,129,0.3)' : 'var(--border-color)'}`, borderRadius: '0.75rem', transition: 'border-color 0.3s', minHeight: '160px' }}>
					<p style={{ fontSize: '0.75rem', color: isListening ? '#10b981' : 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
						{isListening ? '● Live Transcription' : 'Your Answer'}
					</p>
					{transcript ? (
						<p style={{ fontSize: '1rem', color: 'var(--text-primary)', lineHeight: '1.7' }}>{transcript}</p>
					) : (
						<p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic' }}>
							{isSpeaking ? 'Listen to the question...' : isListening ? 'Speak your answer — no button needed when you\'re done' : 'Waiting...'}
						</p>
					)}
				</div>

				{greetingDoneRef.current && (
					<div style={{ display: 'flex', gap: '0.75rem' }}>
						<button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => speakQuestion(currentIdx)} disabled={isSpeaking}>
							🔁 Repeat Question
						</button>
						<button className="btn btn-secondary" style={{ flex: 1, fontSize: '0.85rem' }} onClick={saveAndNext} disabled={isSpeaking}>
							Skip to next →
						</button>
					</div>
				)}
			</div>

			{/* Right — webcam + AR */}
			<div style={{ background: '#09070a', borderLeft: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', padding: '1.5rem', gap: '1rem' }}>
				<div style={{ position: 'relative', borderRadius: '0.75rem', overflow: 'hidden', background: '#000', aspectRatio: '4/3', border: `2px solid ${faceStatus === 'locked' ? '#10b981' : faceStatus === 'deviation' ? '#ef4444' : 'var(--border-color)'}`, transition: 'border-color 0.3s' }}>
					<video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
					<canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', transform: 'scaleX(-1)' }} />
					<div style={{ position: 'absolute', top: '8px', left: '10px', display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'rgba(0,0,0,0.7)', padding: '0.2rem 0.5rem', borderRadius: '0.25rem' }}>
						<span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ef4444', animation: 'pulseStatus 1.5s infinite' }} />
						<span style={{ fontSize: '0.6rem', color: '#fca5a5', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>REC</span>
					</div>
					<div style={{ position: 'absolute', bottom: '8px', left: '50%', transform: 'translateX(-50%)', background: faceStatus === 'locked' ? 'rgba(16,185,129,0.85)' : faceStatus === 'deviation' ? 'rgba(239,68,68,0.85)' : 'rgba(100,116,139,0.85)', padding: '0.2rem 0.65rem', borderRadius: '0.25rem', fontSize: '0.65rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#fff' }}>
						{faceStatus === 'locked' ? 'LOCKED ON' : faceStatus === 'deviation' ? 'GAZE DEVIATION' : 'ALIGN FACE'}
					</div>
				</div>

				<div style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: '0.5rem' }}>
					<p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Session Status</p>
					<div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8rem' }}>
						<div style={{ display: 'flex', justifyContent: 'space-between' }}>
							<span style={{ color: 'var(--text-secondary)' }}>AI Voice</span>
							<span style={{ color: isSpeaking ? 'var(--color-accent)' : 'var(--text-muted)' }}>{isSpeaking ? '● Speaking' : '○ Idle'}</span>
						</div>
						<div style={{ display: 'flex', justifyContent: 'space-between' }}>
							<span style={{ color: 'var(--text-secondary)' }}>Microphone</span>
							<span style={{ color: isListening ? '#10b981' : 'var(--text-muted)' }}>{isListening ? '● Listening' : '○ Standby'}</span>
						</div>
						<div style={{ display: 'flex', justifyContent: 'space-between' }}>
							<span style={{ color: 'var(--text-secondary)' }}>Face Tracking</span>
							<span style={{ color: faceStatus === 'locked' ? '#10b981' : faceStatus === 'deviation' ? '#ef4444' : 'var(--text-muted)' }}>
								{faceStatus === 'locked' ? '● Locked' : faceStatus === 'deviation' ? '● Deviation' : '○ Waiting'}
							</span>
						</div>
						<div style={{ display: 'flex', justifyContent: 'space-between' }}>
							<span style={{ color: 'var(--text-secondary)' }}>Tab switches</span>
							<span style={{ color: tabSwitchCount > 0 ? '#ef4444' : 'var(--text-muted)' }}>{tabSwitchCount}</span>
						</div>
					</div>
				</div>

				<div style={{ padding: '0.75rem 1rem', background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: '0.5rem' }}>
					<p style={{ fontSize: '0.75rem', color: '#f59e0b', fontWeight: 600, margin: 0 }}>⚠ Proctored Session</p>
					<p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>Gaze and tab-switch monitoring is active. Video is being recorded.</p>
				</div>
			</div>
		</div>
	);
}
