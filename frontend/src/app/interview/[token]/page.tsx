'use client';
import { getApiBase } from '@/lib/api';
import { evaluateFaces, STATUS_COPY, type FaceStatus } from '@/lib/proctor';
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';

interface Question { id: number; question: string; order_index: number; }
interface Session { id: string; candidate_id: string; job_id: string; token: string; status: string; interview_score: number; fit_summary: string; created_at?: string; }
interface Candidate { id: string; name: string; role: string; }

interface Detection { label: string; confidence: number; }
interface RekognitionVerdict {
	provider: string;
	verdict: string;
	event_type?: string;
	details: string;
	face_count?: number;
	yaw_degrees?: number;
	pitch_degrees?: number;
	labels?: Detection[];
	flagged?: Detection[];
	latency_ms?: number;
}

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
	const [faceStatus, setFaceStatus] = useState<FaceStatus>('no_face');
	const [recordingPreview, setRecordingPreview] = useState('');
	const [recordingSaved, setRecordingSaved] = useState(false);
	const rekogHoldUntilRef = useRef(0);
	const [tabSwitchCount, setTabSwitchCount] = useState(0);
	const [arAlerts, setArAlerts] = useState({ multipleFaces: 0, phone: 0 });
	const [rekognition, setRekognition] = useState<RekognitionVerdict | null>(null);
	const lookAwayStartRef = useRef<number | null>(null);
	const lastProctorPostRef = useRef<number>(0);
	const lastMultiFacePostRef = useRef<number>(0);

	// Amazon Rekognition frame analysis
	const frameCanvasRef = useRef<HTMLCanvasElement | null>(null);
	const rekogInFlightRef = useRef(false);
	const rekognitionRef = useRef<RekognitionVerdict | null>(null);
	const candidateRef = useRef<Candidate | null>(null);

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
	const committedRef = useRef('');
	const listenModeRef = useRef<'intro' | 'question' | 'confirm'>('intro');
	const listenQuestionIdxRef = useRef(0);
	const pendingAdvanceRef = useRef<'intro' | number>('intro');
	const lastSpeechAtRef = useRef(0);
	const isSpeakingRef = useRef(false);
	const pollyOkRef = useRef<boolean | null>(null);
	const [awaitingConfirm, setAwaitingConfirm] = useState(false);
	const awaitingConfirmRef = useRef(false);

	const greetingDoneRef = useRef(false);
	const [onIntro, setOnIntro] = useState(true);
	const [cameraReady, setCameraReady] = useState(false);
	const [isDemoMode, setIsDemoMode] = useState(false);

	const silenceBeforePromptMs = isDemoMode ? 7000 : 12000;
	const maxAnswerMs = isDemoMode ? 45000 : 120000;
	const silenceAutoAdvanceMs = isDemoMode ? 8000 : 12000;

	const apiBase = getApiBase();

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

	const setSpeaking = (v: boolean) => {
		isSpeakingRef.current = v;
		setIsSpeaking(v);
	};

	const scheduleSilencePrompt = () => {
		if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
		const spoken = accumulatedRef.current.trim().length;
		const delay = spoken > 24 ? silenceBeforePromptMs * 2 : silenceBeforePromptMs;
		silenceTimerRef.current = setTimeout(() => {
			promptContinueToNext();
		}, delay);
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
			if (!res.ok) {
				const errText = await res.text();
				throw new Error(errText || 'Interview scoring failed');
			}
			const data = await res.json();
			setFinalScore(data.score);
			setFitSummary(data.fit_summary);
			setPhase('done');
		} catch (err) {
			setPhase('done');
			setFinalScore(0);
			setFitSummary((err as Error).message || 'Interview submitted. Results will be reviewed by the hiring team.');
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
		greetingDoneRef.current = true;
		setOnIntro(false);
		clearListenTimers();
		stopRecognition();
		saveCurrentAnswer();
		if (questions.length === 0) {
			submitInterview(answersRef.current);
			return;
		}
		setCurrentIdx(0);
		speakQuestion(0);
	};

	const finishConfirmAdvance = () => {
		if (pendingAdvanceRef.current === 'intro') advanceFromIntro();
		else advanceAfterQuestion(pendingAdvanceRef.current as number);
	};

	const promptContinueToNext = async () => {
		if (awaitingConfirmRef.current || isSpeakingRef.current) return;
		pendingAdvanceRef.current = listenModeRef.current === 'intro'
			? 'intro'
			: listenQuestionIdxRef.current;
		awaitingConfirmRef.current = true;
		setAwaitingConfirm(true);
		stopRecognition();
		clearListenTimers();
		setIsListening(false);

		const pending = pendingAdvanceRef.current;
		const questionText = pending === 'intro'
			? 'Can you tell me about yourself?'
			: (questions[typeof pending === 'number' ? pending : listenQuestionIdxRef.current]?.question || '');
		const hadAnswer = accumulatedRef.current.trim().length > 20;
		const prompt = hadAnswer
			? 'If you are finished, say yes. If you want more time, keep speaking.'
			: (questionText
				? `I didn't hear you. ${questionText} Say yes for the next question, or keep answering.`
				: 'I did not hear you. Say yes for the next question, or keep speaking.');
		setSpeaking(true);
		await speak(prompt, () => {
			setSpeaking(false);
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
			for (let i = 0; i < event.results.length; i++) t += event.results[i][0].transcript;
			heard = t.replace(/\s+/g, ' ').trim();
			setTranscript(heard);
			lastSpeechAtRef.current = Date.now();
			if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
			confirmTimerRef.current = setTimeout(() => {
				if (listenModeRef.current !== 'confirm') return;
				if (saysAdvance(heard)) finishConfirmAdvance();
				else if (saysStillAnswering(heard) || heard.length > 8) {
					awaitingConfirmRef.current = false;
					setAwaitingConfirm(false);
					const merged = `${committedRef.current} ${heard}`.replace(/\s+/g, ' ').trim();
					committedRef.current = merged;
					accumulatedRef.current = merged;
					stopRecognition();
					if (pendingAdvanceRef.current === 'intro') startAnswerListening('intro', 0, true);
					else startAnswerListening('question', pendingAdvanceRef.current as number, true);
				}
			}, 2200);
		};

		recognition.onend = () => {
			if (listenModeRef.current !== 'confirm' || !activeRef.current) {
				setIsListening(false);
				return;
			}
			try {
				recognition.start();
				setIsListening(true);
			} catch {
				setIsListening(false);
			}
		};

		recognitionRef.current = recognition;
		try { recognition.start(); } catch { /* already started */ }
		setIsListening(true);

		confirmTimerRef.current = setTimeout(() => {
			if (listenModeRef.current !== 'confirm') return;
			if (accumulatedRef.current.trim().length > 24) return;
			finishConfirmAdvance();
		}, silenceAutoAdvanceMs);
	};

	const startAnswerListening = (mode: 'intro' | 'question', questionIdx = 0, resume = false) => {
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
		if (!resume) {
			accumulatedRef.current = '';
			committedRef.current = '';
			setTranscript('');
		}
		lastSpeechAtRef.current = Date.now();

		const recognition = new SR();
		recognition.continuous = true;
		recognition.interimResults = true;
		recognition.lang = 'en-US';
		let lastFinalCount = 0;

		recognition.onresult = (event: any) => {
			let interim = '';
			let finalsSeen = 0;
			for (let i = 0; i < event.results.length; i++) {
				const piece = event.results[i][0].transcript;
				if (event.results[i].isFinal) {
					if (i >= lastFinalCount) {
						committedRef.current = `${committedRef.current} ${piece}`.replace(/\s+/g, ' ').trim();
					}
					finalsSeen += 1;
				} else {
					interim += piece;
				}
			}
			lastFinalCount = finalsSeen;
			const t = `${committedRef.current} ${interim}`.replace(/\s+/g, ' ').trim();
			accumulatedRef.current = t;
			setTranscript(t);
			lastSpeechAtRef.current = Date.now();
			scheduleSilencePrompt();

			if (mode === 'question' && saysAdvance(t) && t.trim().length < 28) {
				setTimeout(() => {
					if (listenModeRef.current === 'question') advanceAfterQuestion(questionIdx);
				}, 800);
			}
		};

		recognition.onend = () => {
			lastFinalCount = 0;
			if (listenModeRef.current !== mode || awaitingConfirmRef.current || !activeRef.current) {
				setIsListening(false);
				return;
			}
			try {
				recognition.start();
				setIsListening(true);
			} catch {
				setIsListening(false);
			}
		};

		recognitionRef.current = recognition;
		try { recognition.start(); } catch { /* already started */ }
		setIsListening(true);
		setSpeaking(false);
		scheduleSilencePrompt();

		listenTimerRef.current = setTimeout(() => {
			if (listenModeRef.current === 'intro') advanceFromIntro();
			else advanceAfterQuestion(questionIdx);
		}, maxAnswerMs);
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

	useEffect(() => { rekognitionRef.current = rekognition; }, [rekognition]);
	useEffect(() => { candidateRef.current = candidate; }, [candidate]);

	// Server-side integrity sweep: ship a frame to Amazon Rekognition on a fixed cadence
	useEffect(() => {
		if (phase !== 'interview' || !cameraReady) return;
		const intervalMs = isDemoMode ? 3500 : 7000;
		runRekognitionCheck();
		const id = setInterval(runRekognitionCheck, intervalMs);
		return () => clearInterval(id);
	}, [phase, cameraReady, isDemoMode]);

	const postProctorEvent = async (eventType: string, duration: number, details: string) => {
		if (!candidate) return;
		const now = Date.now();
		const throttleMs = eventType === 'multiple_faces' || eventType === 'phone_detected' ? 8000 : 3000;
		if (now - lastProctorPostRef.current < throttleMs) return;
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
			setIsDemoMode(data.demo_mode === true || data.session?.job_id === 'demo_interview');
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
		greetingDoneRef.current = false;
		setOnIntro(true);
		await startCamera();
		speakGreeting();
	};

	const speakGreeting = async (resume = false) => {
		if (greetingDoneRef.current) { speakQuestion(0, resume); return; }
		setSpeaking(true);
		const greeting = 'Hello, how are you doing? Can you tell me about yourself?';
		await speak(greeting, () => {
			startAnswerListening('intro', 0, resume);
		});
	};

	const speakBrowser = (text: string, onDone: () => void) => {
		if (window.speechSynthesis) {
			window.speechSynthesis.cancel();
			const utt = new SpeechSynthesisUtterance(text);
			utt.rate = 1;
			utt.onend = onDone;
			utt.onerror = onDone;
			window.speechSynthesis.speak(utt);
		} else {
			onDone();
		}
	};

	const speak = async (text: string, onDone: () => void) => {
		if (pollyOkRef.current === false) {
			speakBrowser(text, onDone);
			return;
		}
		try {
			const ctrl = new AbortController();
			const timer = window.setTimeout(() => ctrl.abort(), 1800);
			const res = await fetch(`${apiBase}/api/speak?text=${encodeURIComponent(text)}`, { signal: ctrl.signal });
			window.clearTimeout(timer);
			if (!res.ok) {
				pollyOkRef.current = false;
				speakBrowser(text, onDone);
				return;
			}
			const blob = await res.blob();
			if (!blob.size || !(blob.type || '').startsWith('audio')) {
				pollyOkRef.current = false;
				speakBrowser(text, onDone);
				return;
			}
			pollyOkRef.current = true;
			const url = URL.createObjectURL(blob);
			const audio = new Audio(url);
			audio.onended = () => { URL.revokeObjectURL(url); onDone(); };
			audio.onerror = () => { URL.revokeObjectURL(url); speakBrowser(text, onDone); };
			await audio.play();
		} catch {
			pollyOkRef.current = false;
			speakBrowser(text, onDone);
		}
	};

	const startCamera = async () => {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: true });
			streamRef.current = stream;
			if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
			activeRef.current = true;
			setCameraReady(true);

			recordedChunksRef.current = [];
			const mime = ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4']
				.find(t => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t));
			try {
				const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
				recorder.ondataavailable = e => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
				recorder.start(1000);
				mediaRecorderRef.current = recorder;
			} catch (e) {
				console.warn('Interview recording could not start:', e);
			}

			// AR face tracking — load model from Google CDN (works on Railway without bundling)
			try {
				const vision = await import('@mediapipe/tasks-vision');
				const filesetResolver = await vision.FilesetResolver.forVisionTasks('/wasm');
				const modelPath = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
				const landmarker = await vision.FaceLandmarker.createFromOptions(filesetResolver, {
					baseOptions: { modelAssetPath: modelPath, delegate: 'GPU' },
					runningMode: 'VIDEO',
					numFaces: 3,
					outputFaceBlendshapes: false,
					outputFacialTransformationMatrixes: true,
				});
				faceLandmarkerRef.current = landmarker;
				runARLoop();
			} catch (e) {
				console.warn('AR init failed, continuing without face mesh:', e);
			}
		} catch {
			setCameraReady(false);
		}
	};

	// Capture the current webcam frame as a JPEG data URL for server-side analysis.
	const captureFrame = (): string | null => {
		const video = videoRef.current;
		if (!video || video.readyState < 2 || !video.videoWidth) return null;
		const grab = frameCanvasRef.current || document.createElement('canvas');
		frameCanvasRef.current = grab;
		grab.width = 480;
		grab.height = Math.round((video.videoHeight / video.videoWidth) * 480) || 360;
		const ctx = grab.getContext('2d');
		if (!ctx) return null;
		ctx.drawImage(video, 0, 0, grab.width, grab.height);
		return grab.toDataURL('image/jpeg', 0.72);
	};

	// Amazon Rekognition is the authority on integrity findings. The browser only
	// ships frames; DetectLabels/DetectFaces decide whether a session is clean.
	const runRekognitionCheck = async () => {
		if (!activeRef.current || rekogInFlightRef.current) return;
		const frame = captureFrame();
		if (!frame) return;
		rekogInFlightRef.current = true;
		try {
			const res = await fetch(`${apiBase}/api/proctoring/analyze`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					candidate_id: candidateRef.current?.id || '',
					timestamp: new Date().toLocaleTimeString(),
					image_base64: frame,
				}),
			});
			if (!res.ok) return;
			const data: RekognitionVerdict = await res.json();
			setRekognition(data);
			if (data.verdict === 'device_detected') {
				rekogHoldUntilRef.current = Date.now() + 8000;
				setFaceStatus('phone_detected');
				setArAlerts(a => ({ ...a, phone: a.phone + 1 }));
			} else if (data.verdict === 'multiple_faces') {
				rekogHoldUntilRef.current = Date.now() + 6000;
				setFaceStatus('multiple_faces');
				setArAlerts(a => ({ ...a, multipleFaces: a.multipleFaces + 1 }));
			}
		} catch { /* transient network — next tick retries */ } finally {
			rekogInFlightRef.current = false;
		}
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
						const evaled = evaluateFaces(results.faceLandmarks);
						const faceCount = evaled.faceCount;
						const holdingRekog = Date.now() < rekogHoldUntilRef.current;
						if (!holdingRekog) setFaceStatus(evaled.status);

						if (evaled.status === 'multiple_faces') {
							const now = Date.now();
							if (now - lastMultiFacePostRef.current > 8000) {
								lastMultiFacePostRef.current = now;
								setArAlerts(a => ({ ...a, multipleFaces: a.multipleFaces + 1 }));
								postProctorEvent('multiple_faces', 0, `${faceCount} faces in frame — possible coaching`);
							}
						}

						const lms = results.faceLandmarks[0];
						const w = canvas.width;
						const h = canvas.height;
						const isLocked = evaled.status === 'locked';

						if (evaled.lookingAway || evaled.status === 'no_face') {
							if (!lookAwayStartRef.current) lookAwayStartRef.current = Date.now();
						} else if (lookAwayStartRef.current) {
							const dur = Math.round((Date.now() - lookAwayStartRef.current) / 1000);
							if (dur > 2) postProctorEvent('look_away', dur, `Looked away for ${dur}s`);
							lookAwayStartRef.current = null;
						}

						const meshColor = isLocked ? 'rgba(16,185,129,0.55)' : 'rgba(239,68,68,0.55)';
						const boxColor = isLocked ? '#10b981' : '#ef4444';

						ctx.fillStyle = meshColor;
						for (let i = 0; i < lms.length; i += 3) {
							const lm = lms[i];
							ctx.beginPath();
							ctx.arc(lm.x * w, lm.y * h, 1.05, 0, Math.PI * 2);
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
					} else {
						if (Date.now() >= rekogHoldUntilRef.current) setFaceStatus('no_face');
						if (!lookAwayStartRef.current) lookAwayStartRef.current = Date.now();
						else if (Date.now() - lookAwayStartRef.current > 2500) {
							const dur = Math.round((Date.now() - lookAwayStartRef.current) / 1000);
							postProctorEvent('look_away', dur, 'No face in camera');
							lookAwayStartRef.current = Date.now();
						}
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

		const blob = await new Promise<Blob | null>((resolve) => {
			const rec = mediaRecorderRef.current;
			if (!rec || rec.state === 'inactive') {
				resolve(recordedChunksRef.current.length ? new Blob(recordedChunksRef.current, { type: 'video/webm' }) : null);
				return;
			}
			const finish = () => resolve(recordedChunksRef.current.length ? new Blob(recordedChunksRef.current, { type: 'video/webm' }) : null);
			rec.onstop = finish;
			try { rec.stop(); } catch { finish(); }
			setTimeout(finish, 2500);
		});

		if (blob && blob.size > 0 && candidate) {
			const preview = URL.createObjectURL(blob);
			setRecordingPreview(preview);
			try {
				const form = new FormData();
				form.append('video', blob, 'interview.webm');
				form.append('candidate_id', candidate.id);
				const res = await fetch(`${apiBase}/api/candidates/recording`, { method: 'POST', body: form });
				setRecordingSaved(res.ok);
			} catch {
				setRecordingSaved(false);
			}
		}

		streamRef.current?.getTracks().forEach(t => t.stop());
		streamRef.current = null;
	};

	const speakQuestion = async (idx: number, resume = false) => {
		if (!questions[idx]) {
			submitInterview(answersRef.current);
			return;
		}
		setSpeaking(true);
		setIsListening(false);
		if (!resume) setTranscript('');
		clearListenTimers();
		stopRecognition();

		const text = questions[idx].question;
		await speak(text, () => { setSpeaking(false); startAnswerListening('question', idx, resume); });
	};

	const saveAndNext = () => {
		if (onIntro || listenModeRef.current === 'intro' || pendingAdvanceRef.current === 'intro') advanceFromIntro();
		else advanceAfterQuestion(listenQuestionIdxRef.current);
	};

	const currentQ = questions[currentIdx];

	if (phase === 'loading') return (
		<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
			<div style={{ textAlign: 'center' }}>
				<div style={{ width: '36px', height: '36px', border: '2px solid var(--border-color)', borderTopColor: 'var(--color-accent)', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 1rem auto' }} />
				<p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Preparing your interview…</p>
			</div>
		</div>
	);

	if (phase === 'error') return (
		<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
			<div className="panel" style={{ maxWidth: '480px', textAlign: 'center', padding: '2.5rem' }}>
				<h2 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem', fontSize: '1.25rem' }}>This link is no longer valid</h2>
				<p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{errorMsg}</p>
				<p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '1rem' }}>Ask the hiring team to send a new invitation.</p>
			</div>
		</div>
	);

	if (phase === 'done') return (
		<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
			<div className="panel" style={{ maxWidth: '440px', width: '100%', padding: '2.75rem 2.25rem', textAlign: 'center' }}>
				<div className="logo-icon" style={{ margin: '0 auto 1.25rem', background: 'linear-gradient(135deg, var(--color-accent) 0%, #a855f7 100%)' }}>ZS</div>
				<h2 style={{ fontSize: '1.65rem', fontWeight: 800, marginBottom: '0.6rem' }}>Interview complete</h2>
				<p style={{ color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: 1.6, margin: 0 }}>You can now exit this page.</p>
			</div>
		</div>
	);

	if (phase === 'submitting') return (
		<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
			<div style={{ textAlign: 'center' }}>
				<div style={{ width: '48px', height: '48px', border: '3px solid var(--border-color)', borderTopColor: 'var(--color-accent)', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 1rem auto' }} />
				<p style={{ color: 'var(--text-secondary)' }}>Saving your session…</p>
			</div>
		</div>
	);

	if (phase === 'intro') {
		const firstName = candidate?.name?.split(' ')[0];
		const greetName = firstName && firstName.toLowerCase() !== 'demo' ? firstName : null;
		return (
		<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
			<div className="panel" style={{ maxWidth: '520px', width: '100%', padding: '2.5rem' }}>
				<div className="logo-icon" style={{ margin: '0 auto 1.5rem auto', background: 'linear-gradient(135deg, var(--color-accent) 0%, #a855f7 100%)', width: '2.75rem', height: '2.75rem', fontSize: '0.9rem' }}>ZS</div>
				<p style={{ textAlign: 'center', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-accent)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>ZaraSourcing</p>
				<h2 style={{ fontSize: '1.65rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.5rem', textAlign: 'center' }}>
					{greetName ? `${greetName}, your interview is ready` : 'Your interview is ready'}
				</h2>
				<p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '1.75rem', lineHeight: '1.65', textAlign: 'center' }}>
					{candidate?.role ? <>You&apos;re interviewing for <strong style={{ color: 'var(--text-primary)' }}>{candidate.role}</strong>. </> : null}
					Questions are asked out loud. Speak naturally — we transcribe as you go. Stay in frame; this session is recorded.
				</p>
				<div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '1.75rem', textAlign: 'left', padding: '1.1rem 1.15rem', background: 'rgba(255,255,255,0.02)', borderRadius: '0.65rem', border: '1px solid var(--border-color)' }}>
					{[
						'Use Chrome or Edge, and allow camera and microphone',
						'Answer out loud — transcription appears as you speak',
						'Stay in frame. Looking away or a second person is logged',
						'This session is recorded for the hiring team',
					].map((tip, i) => (
						<div key={i} style={{ display: 'flex', gap: '0.65rem', alignItems: 'flex-start', fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
							<span style={{ color: 'var(--color-accent)', fontWeight: 700 }}>✓</span> {tip}
						</div>
					))}
				</div>
				<button className="btn btn-primary" style={{ width: '100%', padding: '1rem', fontSize: '1rem', fontWeight: 700 }} onClick={startInterview}>
					Begin interview
				</button>
				<p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '1rem' }}>Quiet room. Camera at eye level. You can repeat a question at any time.</p>
			</div>
		</div>
		);
	}

	const totalSteps = questions.length + 1;
	const stepNum = onIntro ? 1 : currentIdx + 2;
	const stepProgress = (stepNum / totalSteps) * 100;
	const statusLine = isSpeaking ? 'The interviewer is speaking' : isListening ? (awaitingConfirm ? 'Say yes for the next question' : 'Listening — speak your answer') : 'Ready';

	return (
		<div className="interview-grid">
			<div style={{ padding: '1.75rem 1.75rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
				<div>
					<p style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em', margin: '0 0 0.85rem' }}>
						{candidate?.name ? `${candidate.name}` : 'Interview'}{candidate?.role ? ` · ${candidate.role}` : ''}
					</p>
					<div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
						<span>{onIntro ? 'Introduction' : `Question ${currentIdx + 1} of ${questions.length}`}</span>
						<span>{stepNum} / {totalSteps}</span>
					</div>
					<div style={{ height: '3px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
						<div style={{ height: '100%', width: `${stepProgress}%`, background: 'var(--color-accent)', transition: 'width 0.4s ease' }} />
					</div>
				</div>

				<div style={{ padding: '1.75rem', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: '0.85rem' }}>
					<p style={{ fontSize: '0.72rem', color: 'var(--color-accent)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.65rem' }}>
						{onIntro ? 'To start' : `Question ${currentIdx + 1}`}
					</p>
					<p style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.45, margin: 0 }}>
						{onIntro ? 'Hello, how are you doing? Can you tell me about yourself?' : currentQ?.question}
					</p>
				</div>

				<div style={{ flex: 1, padding: '1.25rem 1.4rem', background: '#09070a', border: `1px solid ${isListening ? 'rgba(16,185,129,0.35)' : 'var(--border-color)'}`, borderRadius: '0.85rem', minHeight: '150px' }}>
					<p style={{ fontSize: '0.72rem', color: isListening ? '#10b981' : 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.04em', marginBottom: '0.65rem' }}>
						{statusLine}
					</p>
					<p style={{ fontSize: '1.05rem', color: transcript ? 'var(--text-primary)' : 'var(--text-muted)', lineHeight: 1.65, margin: 0 }}>
						{transcript || (isSpeaking ? 'Listen…' : 'Your answer will appear here as you speak.')}
					</p>
				</div>

				<div style={{ display: 'flex', gap: '0.65rem' }}>
					<button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => onIntro ? speakGreeting(true) : speakQuestion(currentIdx, true)} disabled={isSpeaking}>
						Repeat
					</button>
					<button className="btn btn-primary" style={{ flex: 1 }} onClick={saveAndNext} disabled={isSpeaking}>
						{onIntro || currentIdx < questions.length - 1 ? 'Next' : 'Finish'}
					</button>
				</div>
			</div>

			<div style={{ background: '#07080c', borderLeft: '1px solid var(--border-color)', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
				<div style={{ position: 'relative', borderRadius: '0.85rem', overflow: 'hidden', background: '#000', aspectRatio: '4/3', border: `2px solid ${faceStatus === 'locked' ? '#10b981' : faceStatus === 'deviation' || faceStatus === 'no_face' ? '#ef4444' : faceStatus === 'multiple_faces' ? '#a855f7' : faceStatus === 'phone_detected' ? '#f59e0b' : 'var(--border-color)'}` }}>
					<video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
					<canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', transform: 'scaleX(-1)' }} />
					{cameraReady && (
						<div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'rgba(0,0,0,0.65)', padding: '0.2rem 0.5rem', borderRadius: '0.25rem' }}>
							<span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', animation: 'pulseStatus 1.5s infinite' }} />
							<span style={{ fontSize: '0.6rem', color: '#fca5a5', fontWeight: 700, letterSpacing: '0.06em' }}>REC</span>
						</div>
					)}
					<div style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', background: faceStatus === 'locked' ? 'rgba(16,185,129,0.9)' : 'rgba(0,0,0,0.7)', padding: '0.28rem 0.7rem', borderRadius: '999px', fontSize: '0.68rem', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>
						{STATUS_COPY[faceStatus]}
					</div>
				</div>
				<p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.45 }}>
					Stay in frame. This session is recorded. Looking away, a second person, or leaving the tab is logged for the hiring team.
					{tabSwitchCount > 0 ? ` Tab switches: ${tabSwitchCount}.` : ''}
					{(arAlerts.multipleFaces > 0 || arAlerts.phone > 0) ? ' Integrity flags were raised.' : ''}
				</p>
			</div>
		</div>
	);
}
