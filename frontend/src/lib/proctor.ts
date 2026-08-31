/**
 * Client-side interview integrity checks.
 * Add a new check by appending to CHECKS and implementing evaluate() —
 * the interview page only consumes FaceEval, it does not hardcode landmark math.
 */

export type FaceStatus = 'no_face' | 'locked' | 'deviation' | 'multiple_faces' | 'phone_detected';

export type Landmark = { x: number; y: number; z?: number };

export type FaceEval = {
	status: FaceStatus;
	label: string;
	faceCount: number;
	gazeOffset: number;
	lookingAway: boolean;
	checkId: string;
};

export type ProctorCheck = {
	id: string;
	evaluate: (faces: Landmark[][]) => FaceEval | null;
};

const LEFT_IRIS = 468;
const RIGHT_IRIS = 473;
const LEFT_EYE_OUTER = 33;
const LEFT_EYE_INNER = 133;
const RIGHT_EYE_INNER = 362;
const RIGHT_EYE_OUTER = 263;
const NOSE = 1;
const LEFT_CHEEK = 234;
const RIGHT_CHEEK = 454;

// Laptop webcams sit below eye line. A tight lock (0.03) marks a normal
// seated pose as “looking away.” Only flag a clear head turn.
const NOSE_AWAY = 0.12;
const IRIS_AWAY = 0.16;

function has(lms: Landmark[], i: number) {
	return i < lms.length && Number.isFinite(lms[i]?.x);
}

function irisOffset(lms: Landmark[]): number | null {
	if (!has(lms, LEFT_IRIS) || !has(lms, RIGHT_IRIS)) return null;
	const leftSpan = Math.abs(lms[LEFT_EYE_INNER].x - lms[LEFT_EYE_OUTER].x) || 0.02;
	const rightSpan = Math.abs(lms[RIGHT_EYE_OUTER].x - lms[RIGHT_EYE_INNER].x) || 0.02;
	const leftMid = (lms[LEFT_EYE_INNER].x + lms[LEFT_EYE_OUTER].x) / 2;
	const rightMid = (lms[RIGHT_EYE_INNER].x + lms[RIGHT_EYE_OUTER].x) / 2;
	const left = Math.abs(lms[LEFT_IRIS].x - leftMid) / leftSpan;
	const right = Math.abs(lms[RIGHT_IRIS].x - rightMid) / rightSpan;
	return (left + right) / 2;
}

function noseOffset(lms: Landmark[]): number {
	if (!has(lms, NOSE) || !has(lms, LEFT_CHEEK) || !has(lms, RIGHT_CHEEK)) return 0;
	const center = (lms[LEFT_CHEEK].x + lms[RIGHT_CHEEK].x) / 2;
	return Math.abs(lms[NOSE].x - center);
}

const facePresence: ProctorCheck = {
	id: 'face_presence',
	evaluate: (faces) => {
		if (faces.length === 0) {
			return { status: 'no_face', label: 'Finding your face', faceCount: 0, gazeOffset: 1, lookingAway: true, checkId: 'face_presence' };
		}
		return null;
	},
};

const secondPerson: ProctorCheck = {
	id: 'second_person',
	evaluate: (faces) => {
		if (faces.length > 1) {
			return { status: 'multiple_faces', label: 'SECOND PERSON', faceCount: faces.length, gazeOffset: 0, lookingAway: false, checkId: 'second_person' };
		}
		return null;
	},
};

const gaze: ProctorCheck = {
	id: 'gaze',
	evaluate: (faces) => {
		if (faces.length !== 1) return null;
		const lms = faces[0];
		const nose = noseOffset(lms);
		const iris = irisOffset(lms);
		const lookingAway = nose > NOSE_AWAY || (iris != null && iris > IRIS_AWAY);
		const offset = iris ?? nose;
		return {
			status: lookingAway ? 'deviation' : 'locked',
			label: lookingAway ? 'Looking away' : 'In frame',
			faceCount: 1,
			gazeOffset: offset,
			lookingAway,
			checkId: 'gaze',
		};
	},
};

/** Ordered: first non-null result wins. Append new checks before `gaze` to take priority. */
export const CHECKS: ProctorCheck[] = [facePresence, secondPerson, gaze];

export function evaluateFaces(faces: Landmark[][]): FaceEval {
	for (const check of CHECKS) {
		const hit = check.evaluate(faces);
		if (hit) return hit;
	}
	return { status: 'no_face', label: 'Finding your face', faceCount: 0, gazeOffset: 1, lookingAway: true, checkId: 'face_presence' };
}

export const STATUS_COPY: Record<FaceStatus, string> = {
	no_face: 'Finding your face',
	locked: 'In frame',
	deviation: 'Looking away',
	multiple_faces: 'Second person',
	phone_detected: 'Device in frame',
};
