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

const CAMERA: MediaStreamConstraints = {
	video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user', frameRate: { ideal: 30 } },
	audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
};

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
	const previewRef = useRef<HTMLVideoElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const sessionBootRef = useRef(false);
	const micRafRef = useRef(0);
	const audioCtxRef = useRef<AudioContext | null>(null);
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
	const speakGenRef = useRef(0);
	const speakTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const pendingFaceRef = useRef<{ status: FaceStatus; since: number } | null>(null);
	const [awaitingConfirm, setAwaitingConfirm] = useState(false);
	const awaitingConfirmRef = useRef(false);

	const greetingDoneRef = useRef(false);
	const [onIntro, setOnIntro] = useState(true);
	const [cameraReady, setCameraReady] = useState(false);
	const [camError, setCamError] = useState('');
	const [micLevel, setMicLevel] = useState(0);
	const [isDemoMode, setIsDemoMode] = useState(false);

	const silenceBeforePromptMs = 25000;

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
		return /\b(next question|move on|i'?m done|im done|that'?s all|that is all|go to the next)\b/.test(t);
	};

	const saysStillAnswering = (text: string) => {
		const t = text.toLowerCase().trim();
		return t.length > 12 && !saysAdvance(t) && !/\b(no|wait|hold on|not yet|one moment)\b/.test(t);
	};

	const setSpeaking = (v: boolean) => {
		isSpeakingRef.current = v;
		setIsSpeaking(v);
	};

	const applyFaceStatus = (next: FaceStatus) => {
		if (next === 'multiple_faces' || next === 'phone_detected' || next === 'locked') {
			pendingFaceRef.current = null;
			setFaceStatus(next);
			return;
		}
		if (!pendingFaceRef.current || pendingFaceRef.current.status !== next) {
			pendingFaceRef.current = { status: next, since: Date.now() };
			return;
		}
		if (Date.now() - pendingFaceRef.current.since >= 1400) {
			setFaceStatus(next);
		}
	};

	const scheduleSilencePrompt = () => {
		if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
		if (isSpeakingRef.current) return;
		silenceTimerRef.current = setTimeout(() => {
			if (isSpeakingRef.current) return;
			if (Date.now() - lastSpeechAtRef.current < 8000) {
				scheduleSilencePrompt();
				return;
			}
			promptContinueToNext();
		}, silenceBeforePromptMs);
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
			? 'Take your time. Keep answering, or say next when you are done.'
			: (questionText
				? `I will wait. ${questionText}`
				: 'I am still listening. Go ahead when you are ready.');
		setSpeaking(true);
		await speak(prompt, () => {
			setSpeaking(false);
			if (pending === 'intro') startAnswerListening('intro', 0, true);
			else startAnswerListening('question', pending as number, true);
		});
	};

	const startConfirmListening = () => {
		const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
		if (!SR) {
			setIsListening(false);
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

		// Stay on this question until they say yes or press Next. Do not auto-skip.
	};

	const startAnswerListening = (mode: 'intro' | 'question', questionIdx = 0, resume = false) => {
		const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
		if (!SR) {
			setIsListening(false);
			setSpeaking(false);
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

			if (saysAdvance(t) && t.trim().length < 22) {
				setTimeout(() => {
					if (listenModeRef.current !== mode) return;
					if (mode === 'intro') advanceFromIntro();
					else advanceAfterQuestion(questionIdx);
				}, 900);
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

	const startMicMeter = (stream: MediaStream) => {
		try {
			const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
			const ctx = new Ctx();
			audioCtxRef.current = ctx;
			const src = ctx.createMediaStreamSource(stream);
			const analyser = ctx.createAnalyser();
			analyser.fftSize = 256;
			src.connect(analyser);
			const data = new Uint8Array(analyser.fftSize);
			const tick = () => {
				analyser.getByteTimeDomainData(data);
				let sum = 0;
				for (let i = 0; i < data.length; i++) {
					const v = (data[i] - 128) / 128;
					sum += v * v;
				}
				setMicLevel(Math.min(1, Math.sqrt(sum / data.length) * 5));
				micRafRef.current = requestAnimationFrame(tick);
			};
			tick();
		} catch { /* meter is optional */ }
	};

	const attachVideo = async (el: HTMLVideoElement | null) => {
		if (!el || !streamRef.current) return;
		el.srcObject = streamRef.current;
		try { await el.play(); } catch { /* autoplay race */ }
	};

	const enablePreview = async () => {
		try {
			if (!streamRef.current) {
				const stream = await navigator.mediaDevices.getUserMedia(CAMERA);
				streamRef.current = stream;
				startMicMeter(stream);
			}
			await attachVideo(previewRef.current);
			setCameraReady(true);
			setCamError('');
		} catch {
			setCameraReady(false);
			setCamError('Camera or microphone was blocked. Allow both in Chrome, then try again.');
		}
	};

	const startInterview = async () => {
		if (!streamRef.current) await enablePreview();
		if (!streamRef.current) return;
		greetingDoneRef.current = false;
		setOnIntro(true);
		sessionBootRef.current = false;
		setPhase('interview');
	};

	useEffect(() => {
		if (phase === 'intro') enablePreview();
	}, [phase]);

	useEffect(() => {
		if (phase !== 'interview' || sessionBootRef.current) return;
		sessionBootRef.current = true;
		(async () => {
			await attachVideo(videoRef.current);
			await startCamera();
			speakGreeting();
		})();
	}, [phase]);

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
		speakGenRef.current += 1;
		const gen = speakGenRef.current;
		if (speakTimeoutRef.current) clearTimeout(speakTimeoutRef.current);
		let settled = false;
		const done = () => {
			if (settled || speakGenRef.current !== gen) return;
			settled = true;
			onDone();
		};
		// Only if TTS never ends — must be longer than the spoken line.
		speakTimeoutRef.current = setTimeout(done, Math.max(12000, 4000 + text.length * 100));

		if (pollyOkRef.current === false) {
			speakBrowser(text, done);
			return;
		}
		try {
			const ctrl = new AbortController();
			const timer = window.setTimeout(() => ctrl.abort(), 1800);
			const res = await fetch(`${apiBase}/api/speak?text=${encodeURIComponent(text)}`, { signal: ctrl.signal });
			window.clearTimeout(timer);
			if (!res.ok) {
				pollyOkRef.current = false;
				speakBrowser(text, done);
				return;
			}
			const blob = await res.blob();
			if (!blob.size || !(blob.type || '').startsWith('audio')) {
				pollyOkRef.current = false;
				speakBrowser(text, done);
				return;
			}
			pollyOkRef.current = true;
			const url = URL.createObjectURL(blob);
			const audio = new Audio(url);
			audio.onended = () => { URL.revokeObjectURL(url); done(); };
			audio.onerror = () => { URL.revokeObjectURL(url); speakBrowser(text, done); };
			await audio.play();
		} catch {
			pollyOkRef.current = false;
			speakBrowser(text, done);
		}
	};

	const startCamera = async () => {
		try {
			if (!streamRef.current) {
				const stream = await navigator.mediaDevices.getUserMedia(CAMERA);
				streamRef.current = stream;
				startMicMeter(stream);
			}
			await attachVideo(videoRef.current);
			activeRef.current = true;
			setCameraReady(true);

			recordedChunksRef.current = [];
			if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
				try { mediaRecorderRef.current.stop(); } catch { /* already stopped */ }
			}
			const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
				.find(t => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t));
			try {
				const recorder = mime
					? new MediaRecorder(streamRef.current, { mimeType: mime, videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 128_000 })
					: new MediaRecorder(streamRef.current, { videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 128_000 });
				recorder.ondataavailable = e => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
				recorder.start(1000);
				mediaRecorderRef.current = recorder;
			} catch (e) {
				console.warn('Interview recording could not start:', e);
			}

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
				console.warn('AR init failed, continuing without face tracking:', e);
			}
		} catch {
			setCameraReady(false);
			setCamError('Camera or microphone was blocked. Allow both in Chrome, then try again.');
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
						if (!holdingRekog) applyFaceStatus(evaled.status);

						if (evaled.status === 'multiple_faces') {
							const now = Date.now();
							if (now - lastMultiFacePostRef.current > 8000) {
								lastMultiFacePostRef.current = now;
								setArAlerts(a => ({ ...a, multipleFaces: a.multipleFaces + 1 }));
								postProctorEvent('multiple_faces', 0, `${faceCount} faces in frame — possible coaching`);
							}
						}

						if (evaled.lookingAway || evaled.status === 'no_face') {
							if (!lookAwayStartRef.current) lookAwayStartRef.current = Date.now();
						} else if (lookAwayStartRef.current) {
							const dur = Math.round((Date.now() - lookAwayStartRef.current) / 1000);
							if (dur > 2) postProctorEvent('look_away', dur, `Looked away for ${dur}s`);
							lookAwayStartRef.current = null;
						}

						const alertStatus = evaled.status === 'deviation' || evaled.status === 'multiple_faces' || evaled.status === 'phone_detected';
						if (alertStatus) {
							ctx.strokeStyle = evaled.status === 'multiple_faces' ? '#c084fc' : evaled.status === 'phone_detected' ? '#f59e0b' : '#ef4444';
							ctx.lineWidth = Math.max(6, canvas.width * 0.007);
							ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
						}
					} else {
						if (Date.now() >= rekogHoldUntilRef.current) applyFaceStatus('no_face');
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

		cancelAnimationFrame(micRafRef.current);
		try { audioCtxRef.current?.close(); } catch { /* ignore */ }
		audioCtxRef.current = null;
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
		const micBars = [0, 1, 2, 3, 4];
		return (
			<div className="interview-lobby">
				<div className="interview-lobby-copy">
					<div className="logo-icon" style={{ marginBottom: '1.15rem', background: 'linear-gradient(135deg, var(--color-accent) 0%, #a855f7 100%)', width: '2.5rem', height: '2.5rem', fontSize: '0.85rem' }}>ZS</div>
					<p style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-accent)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.45rem' }}>Camera check</p>
					<h2 style={{ fontSize: '1.7rem', fontWeight: 800, marginBottom: '0.5rem', letterSpacing: '-0.03em' }}>
						{greetName ? `${greetName}, check your setup` : 'Check your setup'}
					</h2>
					<p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '1.35rem', lineHeight: 1.6 }}>
						{candidate?.role ? <>Interviewing for <strong style={{ color: 'var(--text-primary)' }}>{candidate.role}</strong>. </> : null}
						Fit your face in the oval. We only start recording after you begin.
					</p>
					<div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', marginBottom: '1.4rem', fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
						<div>✓ Chrome or Edge · camera and mic allowed</div>
						<div>✓ Face the light. Camera at eye level.</div>
						<div>✓ First question: tell me about yourself</div>
					</div>
					{camError && <p style={{ color: '#f59e0b', fontSize: '0.85rem', marginBottom: '0.85rem' }}>{camError}</p>}
					<div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.15rem' }}>
						<span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Mic</span>
						<div className="interview-mic">
							{micBars.map(i => {
								const on = micLevel * 5 > i;
								return <span key={i} style={{ height: on ? `${8 + i * 2.5}px` : '4px', opacity: on ? 1 : 0.28 }} />;
							})}
						</div>
						<span style={{ fontSize: '0.78rem', color: cameraReady ? '#10b981' : 'var(--text-muted)' }}>
							{cameraReady ? 'Camera ready' : 'Waiting for camera…'}
						</span>
					</div>
					<button className="btn btn-primary" style={{ width: '100%', padding: '0.95rem', fontSize: '1rem', fontWeight: 700 }} onClick={startInterview} disabled={!cameraReady && !camError}>
						{cameraReady ? 'Begin interview' : camError ? 'Try camera again' : 'Allow camera to continue'}
					</button>
					{camError && (
						<button className="btn btn-secondary" style={{ width: '100%', marginTop: '0.6rem' }} onClick={enablePreview}>Allow camera</button>
					)}
					<p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.9rem' }}>This session is recorded for the hiring team. You can repeat a question at any time.</p>
				</div>
				<div className="interview-lobby-preview">
					<video ref={previewRef} autoPlay playsInline muted />
					<div className="interview-oval" />
					{!cameraReady && (
						<p style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', zIndex: 1, padding: '1.5rem', textAlign: 'center' }}>
							{camError || 'Allow the camera to see your framing'}
						</p>
					)}
				</div>
			</div>
		);
	}

	const totalSteps = questions.length + 1;
	const stepNum = onIntro ? 1 : currentIdx + 2;
	const statusLine = isSpeaking ? 'Interviewer speaking' : isListening ? (awaitingConfirm ? 'Say you are done when ready' : 'Your turn') : 'Ready';
	const questionText = onIntro ? 'Hello, how are you doing? Can you tell me about yourself?' : (currentQ?.question || '');
	const faceOk = faceStatus === 'locked';
	const faceWarn = faceStatus === 'deviation' || faceStatus === 'multiple_faces' || faceStatus === 'phone_detected';

	return (
		<div className="interview-stage">
			<div className="interview-stage-feed">
				<video ref={videoRef} autoPlay playsInline muted style={{ transform: 'scaleX(-1)' }} />
				<canvas ref={canvasRef} style={{ transform: 'scaleX(-1)' }} />
				<div className="interview-vignette" />
			</div>

			<div className="interview-top">
				<div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
					<div className="logo-icon" style={{ width: '1.7rem', height: '1.7rem', fontSize: '0.6rem' }}>ZS</div>
					<div>
						<p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700 }}>{candidate?.name || 'Interview'}</p>
						<p style={{ margin: 0, fontSize: '0.68rem', color: 'rgba(255,255,255,0.55)' }}>{candidate?.role || 'Live session'}</p>
					</div>
				</div>
				<div className="interview-dots" aria-label={`Step ${stepNum} of ${totalSteps}`}>
					{Array.from({ length: totalSteps }).map((_, i) => (
						<i key={i} className={i < stepNum ? 'on' : undefined} />
					))}
				</div>
				<div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center' }}>
					{cameraReady && (
						<span className="interview-pill">
							<span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', animation: 'pulseStatus 1.5s infinite' }} />
							REC
						</span>
					)}
					<span className="interview-pill" style={{ background: faceOk ? 'rgba(16,185,129,0.85)' : faceWarn ? 'rgba(239,68,68,0.85)' : 'rgba(0,0,0,0.55)' }}>
						{STATUS_COPY[faceStatus]}
					</span>
				</div>
			</div>

			<div className="interview-bottom">
				<p style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: isListening ? '#6ee7b7' : 'rgba(103,232,249,0.9)', margin: '0 0 0.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
					{isSpeaking && (
						<span style={{ display: 'inline-flex', gap: 2, height: 12, alignItems: 'flex-end' }}>
							{[0, 1, 2].map(i => (
								<span key={i} style={{ width: 3, height: 10, background: '#67e8f9', borderRadius: 1, animation: `waveSpeak 0.7s ease-in-out ${i * 0.12}s infinite` }} />
							))}
						</span>
					)}
					{statusLine}
					{onIntro ? ' · Introduction' : ` · ${currentIdx + 1} of ${questions.length}`}
				</p>
				<h1 className="interview-q">{questionText}</h1>
				{transcript ? (
					<p className="interview-caption">{transcript}</p>
				) : isListening ? (
					<p className="interview-caption" style={{ color: 'rgba(255,255,255,0.45)' }}>Speak naturally. Your words appear here.</p>
				) : null}
				<div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap' }}>
					<button className="btn btn-secondary" style={{ minWidth: '7.5rem' }} onClick={() => onIntro ? speakGreeting(true) : speakQuestion(currentIdx, true)} disabled={isSpeaking}>
						Repeat
					</button>
					<button className="btn btn-primary" style={{ minWidth: '8.5rem' }} onClick={saveAndNext} disabled={isSpeaking}>
						{onIntro || currentIdx < questions.length - 1 ? 'Next' : 'Finish'}
					</button>
				</div>
			</div>
		</div>
	);
}
