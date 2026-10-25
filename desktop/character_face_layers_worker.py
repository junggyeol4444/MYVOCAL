"""원본 28항: 사용자 허가 2D 그림의 실제 FaceLandmarker 눈·입·얼굴 검출.
사용자 PC에 설치된 MediaPipe FaceLandmarker Task만 로컬 추론한다.
원본 이미지·모델을 수정하거나 모델을 내려받지 않는다.
"""
import argparse
import json
import math
import sys
from pathlib import Path

FACE_LEFT = [33, 133, 159, 145, 246]
FACE_RIGHT = [263, 362, 386, 374, 466]
FACE_MOUTH = [61, 291, 13, 14, 0, 17]
MAX_SIDE = 4096
MAX_PIXELS = 12_000_000


def bounds(points, indexes, width, height, padding_x, padding_y):
    all_x = [points[i].x * width for i in indexes]
    all_y = [points[i].y * height for i in indexes]
    if not all(math.isfinite(x) for x in all_x + all_y):
        raise ValueError("얼굴 특징점 숫자가 유효하지 않습니다.")
    x0 = max(0, int(math.floor(min(all_x) - padding_x)))
    y0 = max(0, int(math.floor(min(all_y) - padding_y)))
    x1 = min(width, int(math.ceil(max(all_x) + padding_x)))
    y1 = min(height, int(math.ceil(max(all_y) + padding_y)))
    if x1 <= x0 or y1 <= y0:
        raise ValueError("실제 얼굴 특징점 영역이 원본 그림 범위를 벗어났습니다.")
    return {"x": x0, "y": y0, "w": x1 - x0, "h": y1 - y0,
            "pivotX": round((x0 + x1) / (2 * width), 4),
            "pivotY": round((y0 + y1) / (2 * height), 4), "enabled": True}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", required=True)
    parser.add_argument("--model", required=True)
    args = parser.parse_args()
    if not Path(args.model).is_file() or Path(args.model).suffix.lower() != ".task":
        raise ValueError("설치된 로컬 MediaPipe FaceLandmarker .task 모델이 필요합니다.")

    try:
        import cv2
        import mediapipe as mp
        from mediapipe.tasks import python as mp_python
        from mediapipe.tasks.python import vision
    except ImportError as exc:
        raise RuntimeError("로컬 MediaPipe Tasks와 OpenCV가 설치된 Python이 필요합니다.") from exc

    image = cv2.imread(args.image, cv2.IMREAD_UNCHANGED)
    if image is None:
        raise RuntimeError("등록된 2D 원본 그림을 열지 못했습니다.")
    height, width = image.shape[:2]
    if not 1 <= width <= MAX_SIDE or not 1 <= height <= MAX_SIDE or width * height > MAX_PIXELS:
        raise RuntimeError("2D 캐릭터 원본 크기는 한 변 4096px·총 1,200만 픽셀 이하여야 합니다.")
    if image.ndim == 2:
        image = cv2.cvtColor(image, cv2.COLOR_GRAY2RGB)
    elif image.shape[2] == 4:
        image = cv2.cvtColor(image, cv2.COLOR_BGRA2RGB)
    else:
        image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

    if max(width, height) > 1024:
        scale = 1024.0 / max(width, height)
        image = cv2.resize(image, (max(1, round(width * scale)), max(1, round(height * scale))))
    import numpy as np
    rgb = np.ascontiguousarray(image)
    base = mp_python.BaseOptions(model_asset_path=args.model)
    options = vision.FaceLandmarkerOptions(
        base_options=base, running_mode=vision.RunningMode.IMAGE, num_faces=1,
        min_face_detection_confidence=.5, min_face_presence_confidence=.5,
    )
    with vision.FaceLandmarker.create_from_options(options) as detector:
        result = detector.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb))
    if len(result.face_landmarks) != 1:
        raise RuntimeError("얼굴이 검출되지 않았습니다. 애니메이션 그림은 모델이 인식하지 못할 수 있습니다. 수동 레이어 도구를 이용하세요.")
    landmarks = result.face_landmarks[0]
    if len(landmarks) < 468:
        raise RuntimeError("실제 FaceLandmarker의 필수 눈·입 특징점이 부족합니다.")
    # FaceMesh 468 기준 좌표의 2D 점 경계. 머리카락/몸은 의미론적 분할로 주장하지 않는다.
    eyes = FACE_LEFT + FACE_RIGHT
    mouth = FACE_MOUTH
    face_box = bounds(landmarks, list(range(468)), width, height, width * .008, height * .012)
    fsize = max(face_box["w"], face_box["h"])
    eye_a = bounds(landmarks, FACE_LEFT, width, height, fsize * .035, fsize * .038)
    eye_b = bounds(landmarks, FACE_RIGHT, width, height, fsize * .035, fsize * .038)
    mouth_box = bounds(landmarks, mouth, width, height, fsize * .06, fsize * .035)
    result_json = {
        "format": "MYVOCAL_FACE_LANDMARK_LAYERS28", "version": 1,
        "source": "installed-local-mediapipe-face-landmarker-task",
        "width": width, "height": height,
        "parts": {
            "face": face_box, "leftEye": eye_a, "rightEye": eye_b, "mouth": mouth_box
        },
        "notice": "실제 2D 눈·입·얼굴 특징점 위치이며 독립 투명 레이어/가려진 부분의 AI 복원이 아닙니다."
    }
    print(json.dumps(result_json, ensure_ascii=False, separators=(",", ":")))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("로컬 2D 얼굴 특징점 검출 실패: " + str(error), file=sys.stderr)
        sys.exit(1)
