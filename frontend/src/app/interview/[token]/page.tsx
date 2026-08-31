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

const GREETING = "Hello, my name is Zara Sourcing, and I'll be conducting your interview. Can you tell me about yourself?";

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
	const listenArmedRef = useRef(false);
	const onSpeechRef = useRef<(event: any) => void>(() => {});
	const [onIntro, setOnIntro] = useState(true);
	const [cameraReady, setCameraReady] = useState(false);
	const [camError, setCamError] = useState('');
	const [micLevel, setMicLevel] = useState(0);
	const [isDemoMode, setIsDemoMode] = useState(false);
	const [speechHint, setSpeechHint] = useState('');
	const [hadFace, setHadFace] = useState(false);

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
		listenArmedRef.current = false;
		if (recognitionRef.current) {
			try { recognitionRef.current.stop(); } catch { /* ignore */ }
			recognitionRef.current = null;
		}
	};

	const bootSpeechRecognition = () => {
		const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
		if (!SR) {
			setSpeechHint('Live captions need Chrome or Edge. Your mic is still recorded.');
			setIsListening(false);
			return;
		}
		listenArmedRef.current = true;
		if (recognitionRef.current) {
			setIsListening(true);
			return;
		}
		const recognition = new SR();
		recognition.continuous = true;
		recognition.interimResults = true;
		recognition.lang = 'en-US';
		recognition.maxAlternatives = 1;
		recognition.onstart = () => setIsListening(true);
		recognition.onresult = (event: any) => onSpeechRef.current(event);
		recognition.onerror = (event: { error?: string }) => {
			if (event.error === 'not-allowed') {
				listenArmedRef.current = false;
				setIsListening(false);
				setSpeechHint('Microphone permission is blocked for captions. Allow the mic and retry.');
				return;
			}
			// no-speech / aborted / network: onend restarts.
		};
		recognition.onend = () => {
			if (!listenArmedRef.current) {
				setIsListening(false);
				return;
			}
			window.setTimeout(() => {
				if (!listenArmedRef.current || recognitionRef.current !== recognition) return;
				try {
					recognition.start();
					setIsListening(true);
				} catch {
					setIsListening(false);
				}
			}, 180);
		};
		recognitionRef.current = recognition;
		try {
			recognition.start();
			setIsListening(true);
			setSpeechHint('');
		} catch {
			window.setTimeout(() => {
				if (!listenArmedRef.current) return;
				try { recognition.start(); setIsListening(true); } catch { /* ignore */ }
			}, 250);
		}
	};

	const saysAdvance = (text: string) => {
		const t = text.toLowerCase().trim();
		return /\b(next question|move on|i'?m done|im done|i am done|that'?s all|that is all|go to the next|next please|i'?m finished|im finished)\b/.test(t);
	};

	const wantsNext = (full: string) => saysAdvance(full.slice(-80));

	const saysStillAnswering = (text: string) => {
		const t = text.toLowerCase().trim();
		return t.length > 12 && !saysAdvance(t) && !/\b(no|wait|hold on|not yet|one moment)\b/.test(t);
	};

	const setSpeaking = (v: boolean) => {
		isSpeakingRef.current = v;
		setIsSpeaking(v);
	};

	const applyFaceStatus = (next: FaceStatus) => {
		// Warnings must show immediately. "In frame" waits a beat so a glance
		// or a walk-off is not overwritten by one lucky frame.
		if (next !== 'locked') {
			pendingFaceRef.current = null;
			setFaceStatus(next);
			return;
		}
		if (!pendingFaceRef.current || pendingFaceRef.current.status !== 'locked') {
			pendingFaceRef.current = { status: 'locked', since: Date.now() };
			return;
		}
		if (Date.now() - pendingFaceRef.current.since >= 350) {
			setFaceStatus('locked');
			setHadFace(true);
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
		clearListenTimers();

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
		listenModeRef.current = 'confirm';
		bootSpeechRecognition();
		setIsListening(true);
	};

	const startAnswerListening = (mode: 'intro' | 'question', questionIdx = 0, resume = false) => {
		awaitingConfirmRef.current = false;
		setAwaitingConfirm(false);
		clearListenTimers();
		listenModeRef.current = mode;
		listenQuestionIdxRef.current = questionIdx;
		if (!resume) {
			accumulatedRef.current = '';
			committedRef.current = '';
			setTranscript('');
		}
		lastSpeechAtRef.current = Date.now();
		bootSpeechRecognition();
		setSpeaking(false);
		scheduleSilencePrompt();
	};

	onSpeechRef.current = (event: any) => {
		if (isSpeakingRef.current) return;
		let interim = '';
		for (let i = event.resultIndex; i < event.results.length; i++) {
			const piece = event.results[i][0].transcript;
			if (event.results[i].isFinal) {
				committedRef.current = `${committedRef.current} ${piece}`.replace(/\s+/g, ' ').trim();
			} else {
				interim += piece;
			}
		}
		const t = `${committedRef.current} ${interim}`.replace(/\s+/g, ' ').trim();
		accumulatedRef.current = t;
		setTranscript(t);
		lastSpeechAtRef.current = Date.now();
		if (listenModeRef.current !== 'confirm') scheduleSilencePrompt();

		if (listenModeRef.current === 'confirm') {
			if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
			confirmTimerRef.current = setTimeout(() => {
				if (listenModeRef.current !== 'confirm') return;
				if (saysAdvance(t) || wantsNext(t)) finishConfirmAdvance();
				else if (saysStillAnswering(t) || t.length > 8) {
					awaitingConfirmRef.current = false;
					setAwaitingConfirm(false);
					listenModeRef.current = pendingAdvanceRef.current === 'intro' ? 'intro' : 'question';
				}
			}, 2200);
			return;
		}

		if (wantsNext(t)) {
			const mode = listenModeRef.current;
			const idx = listenQuestionIdxRef.current;
			window.setTimeout(() => {
				if (listenModeRef.current !== mode) return;
				if (mode === 'intro') advanceFromIntro();
				else advanceAfterQuestion(idx);
			}, 700);
		}
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
		const intervalMs = isDemoMode ? 1800 : 2800;
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
		bootSpeechRecognition();
		try { audioCtxRef.current?.resume(); } catch { /* ignore */ }
		if (!streamRef.current) await enablePreview();
		if (!streamRef.current) return;
		greetingDoneRef.current = false;
		setHadFace(false);
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
		bootSpeechRecognition();
		const greeting = GREETING;
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
				const make = (delegate: 'GPU' | 'CPU') => vision.FaceLandmarker.createFromOptions(filesetResolver, {
					baseOptions: { modelAssetPath: modelPath, delegate },
					runningMode: 'VIDEO',
					numFaces: 3,
					outputFaceBlendshapes: false,
					outputFacialTransformationMatrixes: true,
				});
				let landmarker;
				try {
					landmarker = await make('GPU');
				} catch {
					landmarker = await make('CPU');
				}
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
		grab.width = 960;
		grab.height = Math.round((video.videoHeight / video.videoWidth) * 960) || 540;
		const ctx = grab.getContext('2d');
		if (!ctx) return null;
		ctx.drawImage(video, 0, 0, grab.width, grab.height);
		return grab.toDataURL('image/jpeg', 0.86);
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
				rekogHoldUntilRef.current = Date.now() + 10000;
				setFaceStatus('phone_detected');
				setArAlerts(a => ({ ...a, phone: a.phone + 1 }));
				postProctorEvent('phone_detected', 0, data.details || 'Unauthorized device in frame');
			} else if (data.verdict === 'multiple_faces') {
				rekogHoldUntilRef.current = Date.now() + 6000;
				setFaceStatus('multiple_faces');
				setArAlerts(a => ({ ...a, multipleFaces: a.multipleFaces + 1 }));
			} else if (data.verdict === 'no_face') {
				rekogHoldUntilRef.current = Date.now() + 2000;
				setFaceStatus('no_face');
				postProctorEvent('look_away', 0, data.details || 'Left the camera');
			} else if (data.verdict === 'gaze_away' || data.event_type === 'look_away') {
				rekogHoldUntilRef.current = Date.now() + 2500;
				setFaceStatus('deviation');
				postProctorEvent('look_away', 0, data.details || 'Looked away from camera');
			}
		} catch { /* transient network — next tick retries */ } finally {
			rekogInFlightRef.current = false;
		}
	};

	const runARLoop = () => {
		const detect = () => {
			if (!activeRef.current) return;
			if (!videoRef.current || !faceLandmarkerRef.current) {
				animFrameRef.current = requestAnimationFrame(detect);
				return;
			}
			const video = videoRef.current;
			if (video.readyState < 2) { animFrameRef.current = requestAnimationFrame(detect); return; }
			try {
				const results = faceLandmarkerRef.current.detectForVideo(video, performance.now());
				const canvas = canvasRef.current;
				const ctx = canvas?.getContext('2d');
				if (results.faceLandmarks?.length > 0) {
					const evaled = evaluateFaces(results.faceLandmarks, results.facialTransformationMatrixes);
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

					if (canvas && ctx) {
						canvas.width = video.videoWidth;
						canvas.height = video.videoHeight;
						ctx.clearRect(0, 0, canvas.width, canvas.height);
						const lms = results.faceLandmarks[0];
						const w = canvas.width;
						const h = canvas.height;
						const xs = lms.map((l: { x: number }) => l.x * w);
						const ys = lms.map((l: { y: number }) => l.y * h);
						const bx = Math.min(...xs) - 12;
						const by = Math.min(...ys) - 12;
						const bw = Math.max(...xs) - bx + 12;
						const bh = Math.max(...ys) - by + 12;
						const alertStatus = evaled.status === 'deviation' || evaled.status === 'multiple_faces' || evaled.status === 'phone_detected';
						ctx.strokeStyle = alertStatus ? (evaled.status === 'multiple_faces' ? '#c084fc' : evaled.status === 'phone_detected' ? '#f59e0b' : '#ef4444') : '#10b981';
						ctx.lineWidth = 3;
						ctx.strokeRect(bx, by, bw, bh);
					}
				} else {
					if (Date.now() >= rekogHoldUntilRef.current) applyFaceStatus('no_face');
					if (!lookAwayStartRef.current) lookAwayStartRef.current = Date.now();
					else if (Date.now() - lookAwayStartRef.current > 2500) {
						const dur = Math.round((Date.now() - lookAwayStartRef.current) / 1000);
						postProctorEvent('look_away', dur, 'No face in camera');
						lookAwayStartRef.current = Date.now();
					}
					if (canvas && ctx) {
						canvas.width = video.videoWidth;
						canvas.height = video.videoHeight;
						ctx.clearRect(0, 0, canvas.width, canvas.height);
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
		setIsListening(true);
		if (!resume) setTranscript('');
		clearListenTimers();
		bootSpeechRecognition();

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
						<div>✓ First, Zara introduces herself and asks about you</div>
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
	const statusLine = isSpeaking ? 'Interviewer speaking' : isListening ? (awaitingConfirm ? 'Say you are done when ready' : 'Your turn — speak your answer') : 'Ready';
	const questionText = onIntro ? GREETING : (currentQ?.question || '');
	const faceOk = faceStatus === 'locked';
	const faceWarn = faceStatus === 'deviation' || faceStatus === 'multiple_faces' || faceStatus === 'phone_detected' || faceStatus === 'no_face';
	const lastQuestion = !onIntro && currentIdx >= questions.length - 1;
	const transcriptPlaceholder = isSpeaking
		? 'Listen…'
		: speechHint
			? speechHint
			: (isListening && micLevel > 0.1)
				? 'Hearing you…'
				: isListening
					? 'Your answer appears here as you speak.'
					: 'Waiting for the microphone…';

	return (
		<div className="interview-room">
			<div className="interview-room-head">
				<div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
					<div className="logo-icon" style={{ width: '1.7rem', height: '1.7rem', fontSize: '0.6rem' }}>ZS</div>
					<div>
						<p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700 }}>{candidate?.name || 'Interview'}</p>
						<p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)' }}>{candidate?.role || 'Live session'}</p>
					</div>
				</div>
				<div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', flexWrap: 'wrap' }}>
					<span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{onIntro ? 'Introduction' : `Question ${currentIdx + 1} of ${questions.length}`}</span>
					{cameraReady && (
						<span className="interview-pill">
							<span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', animation: 'pulseStatus 1.5s infinite', display: 'inline-block' }} />
							{' '}REC
						</span>
					)}
					<span className="interview-pill" style={{ background: faceOk ? 'rgba(16,185,129,0.85)' : faceWarn ? 'rgba(239,68,68,0.85)' : 'rgba(0,0,0,0.55)' }}>
						{STATUS_COPY[faceStatus]}
					</span>
				</div>
			</div>

			<div className={`interview-room-video ${faceOk ? 'is-ok' : ''} ${faceWarn ? 'is-warn' : ''}`}>
				<video ref={videoRef} autoPlay playsInline muted style={{ transform: 'scaleX(-1)' }} />
				<canvas ref={canvasRef} style={{ transform: 'scaleX(-1)' }} />
				{faceStatus === 'phone_detected' && (
					<div style={{ position: 'absolute', inset: 0, zIndex: 3, background: 'rgba(120, 53, 15, 0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.25rem', textAlign: 'center' }}>
						<p style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#fff' }}>Device detected — this is logged as cheating</p>
					</div>
				)}
				{faceStatus === 'deviation' && (
					<div style={{ position: 'absolute', inset: 0, zIndex: 3, background: 'rgba(127, 29, 29, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.25rem', textAlign: 'center' }}>
						<p style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#fff' }}>Looking away — this is logged</p>
					</div>
				)}
				{faceStatus === 'no_face' && hadFace && (
					<div style={{ position: 'absolute', inset: 0, zIndex: 3, background: 'rgba(15, 23, 42, 0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.25rem', textAlign: 'center' }}>
						<p style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#fff' }}>Get back in camera</p>
					</div>
				)}
				<div style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 2 }}>
					<span className="interview-pill" style={{ background: faceOk ? 'rgba(16,185,129,0.9)' : faceWarn ? 'rgba(239,68,68,0.9)' : 'rgba(0,0,0,0.7)' }}>
						{STATUS_COPY[faceStatus]}
					</span>
				</div>
			</div>

			<div style={{ marginTop: '1.15rem' }}>
				<p style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: isListening ? '#6ee7b7' : 'var(--color-accent)', margin: '0 0 0.45rem' }}>
					{statusLine}
				</p>
				<h1 style={{ fontSize: '1.35rem', fontWeight: 800, lineHeight: 1.35, margin: '0 0 0.75rem' }}>{questionText}</h1>
				<div style={{ padding: '1rem 1.1rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '0.75rem', minHeight: '4.5rem', marginBottom: '1rem' }}>
					<p style={{ fontSize: '0.95rem', color: transcript ? 'var(--text-primary)' : 'var(--text-muted)', lineHeight: 1.55, margin: 0 }}>
						{transcript || transcriptPlaceholder}
					</p>
				</div>
				<div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', alignItems: 'center' }}>
					<button className="btn btn-secondary" onClick={() => onIntro ? speakGreeting(true) : speakQuestion(currentIdx, true)} disabled={isSpeaking}>
						Repeat
					</button>
					{!lastQuestion && (
						<button className="btn btn-secondary" onClick={saveAndNext} disabled={isSpeaking}>I&apos;m done</button>
					)}
					{lastQuestion && (
						<button className="btn btn-primary" onClick={saveAndNext} disabled={isSpeaking}>Finish interview</button>
					)}
				</div>
				<p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.85rem 0 0' }}>
					The interviewer moves on when you say “I’m done” or “next question.” A second device in frame is flagged.
				</p>
			</div>
		</div>
	);
}
