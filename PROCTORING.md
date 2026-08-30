# Online Proctoring — how it works and how to verify it

ZaraSourcing's interview integrity checks are decided by **Amazon Rekognition**, not by
browser heuristics. The browser's only job is to capture a webcam frame and ship it to
our backend; AWS returns the labels and face geometry, and the backend turns those into
a verdict and an audit-log entry.

## Pipeline

```
Browser (interview page)
  └─ captures a 480px JPEG frame every 3.5s (demo) / 7s (real interview)
       │  POST /api/proctoring/analyze  { candidate_id, timestamp, image_base64 }
       ▼
Go backend  (backend/pkg/proctor)
  ├─ Rekognition DetectLabels  (MaxLabels 30, MinConfidence 60)
  ├─ Rekognition DetectFaces   (Attributes: ALL → pose, eyes open, confidence)
  ├─ derives a verdict
  └─ writes any finding to proctoring_events for that candidate
       ▼
Recruiter dashboard → candidate page → integrity timeline
```

MediaPipe still runs in the browser, but only to draw the live face mesh and bounding
box. It does not decide whether a session is flagged.

## Verdicts

| Verdict | Trigger | Logged event |
|---|---|---|
| `ok` | exactly one face, head pose within limits, no flagged objects | — |
| `device_detected` | Rekognition returns a phone / laptop / screen / tablet / book / paper label above 60% | `phone_detected` |
| `multiple_faces` | more than one face above 90% confidence | `multiple_faces` |
| `no_face` | zero faces above 90% confidence | `look_away` |
| `gaze_away` | \|yaw\| > 28° or \|pitch\| > 22° | `look_away` |

Thresholds live in one place (`backend/pkg/proctor/rekognition.go`) and are exported so
the tests assert against the same constants the runtime uses.

## Verify it yourself

**1. The rules — offline, no AWS account needed**

```bash
make test-proctor
```

Seven tests cover each verdict path, plus the guard that low-confidence face
detections are ignored.

**2. The AWS call — with your own photos**

```bash
make verify-proctor FRAMES="clean.jpg phone.jpg two_people.jpg"
```

Point it at any JPEGs — a selfie, a selfie holding a phone, a photo with two people.
It prints the verdict, face count, head pose, round-trip latency, the flagged labels
with confidences, and the full raw Rekognition label set, so you can see the AWS
response behind the decision.

Requires `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and a region
(`AWS_REGION` or `AWS_S3_REGION`), with IAM permission for `rekognition:DetectLabels`
and `rekognition:DetectFaces`.

**3. The deployment**

```bash
curl -s https://<your-backend>/api/health
```

```json
{
  "status": "ok",
  "proctoring": {
    "provider": "aws_rekognition",
    "ready": true,
    "checks": ["phone_detected", "multiple_faces", "look_away", "no_face"]
  }
}
```

`ready: false` means credentials or IAM permissions are missing.

**4. The live interview**

Open `/demo` → **Launch demo interview** in Chrome or Edge, allow camera and mic. The
right-hand **Amazon Rekognition** panel shows the provider, `● LIVE` with the current
latency, the verdict, face count, head pose, and any flagged labels with confidence.
Hold a phone up to the camera and the verdict flips to `DEVICE_DETECTED` within one
polling interval; the finding is written to the candidate's audit log.

## Graceful degradation

If AWS credentials are absent, `/api/proctoring/analyze` returns
`{"provider":"unavailable","verdict":"skipped"}`, the panel reads `NOT CONFIGURED`, and
the interview continues with the MediaPipe overlay, gaze tracking, and tab-switch
detection. Set `PROCTOR_PROVIDER=local` to force this path.

## Cost

Rekognition bills per image. At 7s polling, a 10-minute interview is ~86 frames × 2 API
calls. Raise the interval in `frontend/src/app/interview/[token]/page.tsx` to trade
detection latency for cost.
