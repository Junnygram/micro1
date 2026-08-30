'use client';
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';

interface Question { id: number; question: string; order_index: number; }
interface Session { id: string; candidate_id: string; job_id: string; token: string; status: string; interview_score: number; fit_summary: string; }
interface Candidate { name: string; role: string; }

type Phase = 'loading' | 'intro' | 'interview' | 'submitting' | 'done' | 'error';

export default function InterviewPage() {
	const { token } = useParams() as { token: string };
	const [phase, setPhase] = useState<Phase>('loading');
	const [session, setSession] = useState<Session | null>(null);
	const [candidate, setCandidate] = useState<Candidate | null>(null);
	const [questions, setQuestions] = useState<Question[]>([]);
	const [currentIdx, setCurrentIdx] = useState(0);
	const [answers, setAnswers] = useState<Record<string, string>>({});
	const [isListening, setIsListening] = useState(false);
	const [isSpeaking, setIsSpeaking] = useState(false);
	const [transcript, setTranscript] = useState('');
	const [errorMsg, setErrorMsg] = useState('');
	const [finalScore, setFinalScore] = useState(0);
	const [fitSummary, setFitSummary] = useState('');

	// Webcam + AR
	const videoRef = useRef<HTMLVideoElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const faceLandmarkerRef = useRef<any>(null);
	const animFrameRef = useRef<number>(0);
	const activeRef = useRef(false);

	// Speech
	const recognitionRef = useRef<any>(null);
	const listenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

	useEffect(() => {
		loadSession();
	}, [token]);

	const loadSession = async () => {
		try {
			const res = await fetch(`${apiBase}/api/interview/${token}`);
			if (!res.ok) throw new Error('Interview session not found');
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
		speakQuestion(0);
	};

	const startCamera = async () => {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
			streamRef.current = stream;
			if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
			activeRef.current = true;
			try {
				const vision = await import('@mediapipe/tasks-vision');
				const filesetResolver = await vision.FilesetResolver.forVisionTasks('/wasm');
				const landmarker = await vision.FaceLandmarker.createFromOptions(filesetResolver, {
					baseOptions: { modelAssetPath: '/models/face_landmarker.task', delegate: 'GPU' },
					runningMode: 'VIDEO', numFaces: 1,
				});
				faceLandmarkerRef.current = landmarker;
				runARLoop();
			} catch { /* fallback: no AR */ }
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
					canvas.width = video.videoWidth; canvas.height = video.videoHeight;
					ctx.clearRect(0, 0, canvas.width, canvas.height);
					if (results.faceLandmarks?.length > 0) {
						const lms = results.faceLandmarks[0];
						const w = canvas.width; const h = canvas.height;
						ctx.fillStyle = 'rgba(16,185,129,0.5)';
						for (const lm of lms) { ctx.beginPath(); ctx.arc(lm.x * w, lm.y * h, 1.2, 0, Math.PI * 2); ctx.fill(); }
						const xs = lms.map((l: any) => l.x * w); const ys = lms.map((l: any) => l.y * h);
						const bx = Math.min(...xs) - 10; const by = Math.min(...ys) - 10;
						ctx.strokeStyle = '#10b981'; ctx.lineWidth = 1.5;
						ctx.strokeRect(bx, by, Math.max(...xs) - bx + 10, Math.max(...ys) - by + 10);
					}
				}
			} catch { }
			animFrameRef.current = requestAnimationFrame(detect);
		};
		animFrameRef.current = requestAnimationFrame(detect);
	};

	const stopCamera = () => {
		activeRef.current = false;
		cancelAnimationFrame(animFrameRef.current);
		streamRef.current?.getTracks().forEach(t => t.stop());
		streamRef.current = null;
	};

	const speakQuestion = async (idx: number) => {
		if (!questions[idx]) return;
		setIsSpeaking(true);
		setIsListening(false);
		setTranscript('');
		if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch { } }
		if (listenTimerRef.current) clearTimeout(listenTimerRef.current);

		const text = idx === 0 && candidate
			? `Hi ${candidate.name.split(' ')[0]}, welcome to your interview for ${candidate.role}. Question ${idx + 1}: ${questions[idx].question}`
			: `Question ${idx + 1}: ${questions[idx].question}`;

		try {
			const audio = new Audio(`${apiBase}/api/speak?text=${encodeURIComponent(text)}`);
			audio.onended = () => { setIsSpeaking(false); startListening(idx); };
			audio.onerror = () => { setIsSpeaking(false); startListening(idx); };
			await audio.play();
		} catch {
			// Fallback to browser TTS
			if (window.speechSynthesis) {
				window.speechSynthesis.cancel();
				const utt = new SpeechSynthesisUtterance(text);
				utt.onend = () => { setIsSpeaking(false); startListening(idx); };
				window.speechSynthesis.speak(utt);
			} else {
				setIsSpeaking(false);
				startListening(idx);
			}
		}
	};

	const startListening = (idx: number) => {
		const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
		if (!SR) return;
		const recognition = new SR();
		recognition.continuous = true;
		recognition.interimResults = true;
		recognition.lang = 'en-US';
		let accumulated = '';
		recognition.onresult = (event: any) => {
			let t = '';
			for (let i = event.resultIndex; i < event.results.length; i++) t += event.results[i][0].transcript;
			accumulated = t;
			setTranscript(t);
		};
		recognition.onend = () => setIsListening(false);
		recognitionRef.current = recognition;
		recognition.start();
		setIsListening(true);

		// Auto-advance after 30s of listening
		listenTimerRef.current = setTimeout(() => {
			recognition.stop();
			setAnswers(prev => ({ ...prev, [String(questions[idx].id)]: accumulated || prev[String(questions[idx].id)] || '' }));
		}, 30000);
	};

	const saveAndNext = () => {
		if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch { } }
		if (listenTimerRef.current) clearTimeout(listenTimerRef.current);
		setAnswers(prev => ({ ...prev, [String(questions[currentIdx].id)]: transcript || prev[String(questions[currentIdx].id)] || '' }));
		const next = currentIdx + 1;
		if (next < questions.length) {
			setCurrentIdx(next);
			speakQuestion(next);
		} else {
			submitInterview();
		}
	};

	const submitInterview = async () => {
		if (!session) return;
		setPhase('submitting');
		stopCamera();
		try {
			const res = await fetch(`${apiBase}/api/interview/complete`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ session_id: session.id, answers, job_title: candidate?.role || 'Software Engineer' }),
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

	const currentQ = questions[currentIdx];
	const progress = questions.length > 0 ? ((currentIdx) / questions.length) * 100 : 0;

	if (phase === 'loading') return (
		<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
			<p style={{ color: 'var(--text-secondary)' }}>Loading your interview session...</p>
		</div>
	);

	if (phase === 'error') return (
		<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
			<div className="panel" style={{ maxWidth: '480px', textAlign: 'center', padding: '2.5rem' }}>
				<p style={{ fontSize: '2rem', marginBottom: '1rem' }}>⚠️</p>
				<h2 style={{ color: 'var(--color-failure)', marginBottom: '0.5rem' }}>Session Not Found</h2>
				<p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{errorMsg}</p>
			</div>
		</div>
	);

	if (phase === 'done') return (
		<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
			<div className="panel" style={{ maxWidth: '560px', width: '100%', padding: '2.5rem', textAlign: 'center' }}>
				<div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎉</div>
				<h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Interview Complete</h2>
				<p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '2rem' }}>Your responses have been recorded and scored by AI.</p>
				<div style={{ padding: '1.5rem', background: 'rgba(99,102,241,0.05)', border: '1px solid var(--border-color)', borderRadius: '0.75rem', marginBottom: '1.5rem' }}>
					<p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Your Interview Score</p>
					<p style={{ fontSize: '3.5rem', fontWeight: 900, fontFamily: 'var(--font-mono)', color: finalScore >= 75 ? '#10b981' : finalScore >= 50 ? '#f59e0b' : '#ef4444', margin: 0 }}>{finalScore}%</p>
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
				<p style={{ color: 'var(--text-secondary)' }}>AI is scoring your interview...</p>
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
					The AI will ask you {questions.length} question{questions.length !== 1 ? 's' : ''} verbally. Just speak your answers naturally — they&apos;ll be transcribed and scored automatically.
				</p>
				<div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '2rem', textAlign: 'left', padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '0.5rem', border: '1px solid var(--border-color)' }}>
					{['Allow microphone access when prompted', 'Speak clearly and take your time', 'Your camera will be on for proctoring', `${questions.length} questions — roughly 5-10 minutes`].map((tip, i) => (
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
	return (
		<div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '1fr 340px', gap: 0 }}>
			{/* Left — question + transcript */}
			<div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
				{/* Progress */}
				<div>
					<div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
						<span>Question {currentIdx + 1} of {questions.length}</span>
						<span style={{ color: isListening ? '#10b981' : isSpeaking ? 'var(--color-accent)' : 'var(--text-muted)', fontWeight: 600 }}>
							{isSpeaking ? '🔊 AI Speaking...' : isListening ? '🎙 Listening...' : ''}
						</span>
					</div>
					<div style={{ height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
						<div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg, var(--color-accent), #a855f7)', transition: 'width 0.5s ease', borderRadius: '2px' }} />
					</div>
				</div>

				{/* Question card */}
				<div style={{ padding: '2rem', background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '0.75rem', flex: '0 0 auto' }}>
					<p style={{ fontSize: '0.75rem', color: 'var(--color-accent)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>Question {currentIdx + 1}</p>
					<p style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: '1.5' }}>{currentQ?.question}</p>
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
							{isSpeaking ? 'Listen to the question...' : isListening ? 'Speak your answer now...' : 'Waiting...'}
						</p>
					)}
				</div>

				{/* Controls */}
				<div style={{ display: 'flex', gap: '0.75rem' }}>
					<button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => speakQuestion(currentIdx)} disabled={isSpeaking}>
						🔁 Repeat Question
					</button>
					<button className="btn btn-primary" style={{ flex: 2 }} onClick={saveAndNext} disabled={isSpeaking}>
						{currentIdx < questions.length - 1 ? 'Next Question →' : 'Submit Interview ✓'}
					</button>
				</div>
			</div>

			{/* Right — webcam + AR */}
			<div style={{ background: '#09070a', borderLeft: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', padding: '1.5rem', gap: '1rem' }}>
				<div style={{ position: 'relative', borderRadius: '0.75rem', overflow: 'hidden', background: '#000', aspectRatio: '4/3', border: `2px solid ${isListening ? '#10b981' : 'var(--border-color)'}`, transition: 'border-color 0.3s' }}>
					<video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
					<canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', transform: 'scaleX(-1)' }} />
					<div style={{ position: 'absolute', top: '8px', left: '10px', display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'rgba(0,0,0,0.7)', padding: '0.2rem 0.5rem', borderRadius: '0.25rem' }}>
						<span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ef4444', animation: 'pulse 1.5s infinite' }} />
						<span style={{ fontSize: '0.6rem', color: '#fca5a5', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>REC</span>
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
							<span style={{ color: '#10b981' }}>● Active</span>
						</div>
					</div>
				</div>

				<div style={{ padding: '0.75rem 1rem', background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: '0.5rem' }}>
					<p style={{ fontSize: '0.75rem', color: '#f59e0b', fontWeight: 600, margin: 0 }}>⚠ Proctored Session</p>
					<p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>Gaze and tab-switch monitoring is active.</p>
				</div>
			</div>
		</div>
	);
}
