"""원본 31·32항: 사용자가 허가한 로컬 녹화 영상에서 실제 MediaPipe Pose 자세 추출.
별도 설치된 MediaPipe Task .task 모델만 사용. 다운로드·원본 변조 없음.
표준출력 JSON에는 얼굴 이미지/실제 프레임 대신 재현용 본 회전만 담는다.
"""
import argparse
import json
import math
import sys

BONES = {
    "leftUpperArm": (11, 13), "rightUpperArm": (12, 14),
    "leftLowerArm": (13, 15), "rightLowerArm": (14, 16),
    "leftUpperLeg": (23, 25), "rightUpperLeg": (24, 26),
    "leftLowerLeg": (25, 27), "rightLowerLeg": (26, 28),
}
REQUIRED = {0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28}
MAX_DURATION_SEC = 30.0
MAX_SAMPLE_FRAMES = 300


def clamp(value, minimum, maximum):
    return max(minimum, min(maximum, value))


def direction(a, b):
    return math.degrees(math.atan2(b.x - a.x, a.y - b.y))


def wrap_difference(value, reference):
    return (value - reference + 180.0) % 360.0 - 180.0


def midpoint(a, b):
    return (a.x + b.x) / 2.0, (a.y + b.y) / 2.0


def posture(landmarks):
    shoulders = midpoint(landmarks[11], landmarks[12])
    hips = midpoint(landmarks[23], landmarks[24])
    spine = math.degrees(math.atan2(shoulders[0] - hips[0], hips[1] - shoulders[1]))
    head = math.degrees(math.atan2(landmarks[0].x - shoulders[0],
                                   shoulders[1] - landmarks[0].y))
    angles = {name: direction(landmarks[a], landmarks[b]) for name, (a, b) in BONES.items()}
    angles["spine"] = spine
    angles["head"] = head
    return angles, hips[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", required=True)
    parser.add_argument("--model", required=True)
    args = parser.parse_args()
    try:
        import cv2
        import numpy as np
        import mediapipe as mp
        from mediapipe.tasks import python as mp_python
        from mediapipe.tasks.python import vision
    except ImportError as error:
        raise RuntimeError("실제 MediaPipe Tasks·OpenCV·NumPy가 설치된 로컬 Python이 필요합니다.") from error

    capture = cv2.VideoCapture(args.video)
    if not capture.isOpened():
        raise RuntimeError("등록된 동작 참고 MP4/WebM 영상을 로컬에서 열지 못했습니다.")
    try:
        fps = float(capture.get(cv2.CAP_PROP_FPS))
        frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
        if not math.isfinite(fps) or fps < 1 or fps > 240 or frame_count < 2:
            raise RuntimeError("동작 참고 영상의 FPS/프레임 정보를 확인할 수 없습니다.")
        duration = frame_count / fps
        if not 0 < duration <= MAX_DURATION_SEC:
            raise RuntimeError("실제 동작 참고 영상은 최대 30초까지 추출할 수 있습니다.")
        options = vision.PoseLandmarkerOptions(
            base_options=mp_python.BaseOptions(model_asset_path=args.model),
            running_mode=vision.RunningMode.VIDEO,
            num_poses=1,
            min_pose_detection_confidence=0.55,
            min_pose_presence_confidence=0.55,
            min_tracking_confidence=0.5,
        )
        samples = []
        neutral = None
        neutral_hip = None
        previous_ms = -1
        step = max(1, int(round(fps / 10.0)))
        with vision.PoseLandmarker.create_from_options(options) as detector:
            for frame_index in range(frame_count):
                if len(samples) >= MAX_SAMPLE_FRAMES:
                    break
                ok, frame = capture.read()
                if not ok:
                    break
                if frame_index % step:
                    continue
                h, w = frame.shape[:2]
                if not h or not w:
                    continue
                if max(w, h) > 640:
                    fraction = 640.0 / max(w, h)
                    frame = cv2.resize(frame, (max(1, round(w * fraction)),
                                               max(1, round(h * fraction))))
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                rgb = np.ascontiguousarray(rgb)
                ms = int(round(frame_index * 1000.0 / fps))
                ms = max(previous_ms + 1, ms)
                previous_ms = ms
                image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
                result = detector.detect_for_video(image, ms)
                if not result.pose_landmarks:
                    continue
                pose = result.pose_landmarks[0]
                if len(pose) < 33:
                    continue
                if any(getattr(pose[i], "visibility", 1.0) < 0.45
                       or not math.isfinite(pose[i].x)
                       or not math.isfinite(pose[i].y)
                       for i in REQUIRED):
                    continue
                raw, hip_y = posture(pose)
                if neutral is None:
                    neutral, neutral_hip = raw, hip_y
                angles = {bone: round(clamp(wrap_difference(raw[bone], neutral[bone]), -70, 70), 2)
                          for bone in raw}
                lift = round(clamp((neutral_hip - hip_y) * 0.4, -0.13, 0.13), 4)
                samples.append({"timeMs": ms, "angles": angles, "lift": lift})
        if len(samples) < 3:
            raise RuntimeError("실제 영상에서 유효한 사람 전신 자세가 3프레임 이상 검출되지 않았습니다.")
        print(json.dumps({
            "format": "MYVOCAL_MOTION_CAPTURE31", "version": 1,
            "source": "installed-local-mediapipe-pose-task",
            "durationMs": round(duration * 1000), "frames": samples,
            "measurement": "영상 2D 관절의 상대 회전 근사 (실제 3D 깊이·완전 모션캡처 아님)"
        }, separators=(",", ":"), ensure_ascii=False))
    finally:
        capture.release()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("자세 추출 중단: " + str(error), file=sys.stderr)
        sys.exit(1)
