# Step59: Reference 에너지 기반 반주 밀도 안내

## 누적 변경
Step58에서 만든 Reference 32구간 에너지의 MIDI velocity 적용 옵션을 유지하고, 별도의 선택 옵션으로 **보조 반주 음표 생략**을 추가했습니다.

- 경로: `src/lib/referenceDensityGuide.js`, `tests/reference-density-guide.test.mjs`
- Learning Studio의 `StyleArrangementPanel.jsx`에서 Reference 보고서를 가져온 후 두 기능을 각각 켜고 끌 수 있습니다.
- 사용자가 지정한 0–100% 강도와 베이스·코드·드럼 중 선택된 악기만 영향을 받습니다. 화면에서는 전체 세 반주 파트를 선택합니다.
- 32개 구간의 에너지를 전체 곡 길이에 비례 대응시키며 평균보다 낮은 구간에서 **이미 생성된 보조 음표**만 생략합니다.
- 멜로디 트랙, 바 첫 베이스 음표, 바 첫 코드, 드럼 킥·스네어는 보존합니다.
- 새로운 음정, 리듬, 박자를 유추하거나 만들지 않습니다. 원곡 멜로디·코드를 추출하지 않습니다.
- 결과는 원본 편곡과 분리된 불변 객체이고 MIDI Format 1로 내보낼 수 있습니다.
- UI에는 실제 생략한 음표 수를 표시합니다.

## 제약과 주의
이 기능은 **실제 AI 학습·AI 편곡·유사도 분석·원곡 모방 기능이 아닙니다.** 에너지가 균일하거나 무음인 Reference 보고서는 음표를 생략하지 않습니다. 반주 밀도 감소는 보조 음표의 존재 여부에만 적용되고 음정·시간·벨로시티를 수정하지 않습니다. Step58 velocity 적용 옵션과 함께 사용하면 Step58 조정 후 선택적으로 보조 음표를 생략합니다.

Reference 보고서에는 Reference-only / trainingAllowed=false / trainingPerformed=false / audioIncluded=false가 필요하며 오디오나 모델 입력 데이터를 서버로 전송하지 않습니다. 실제 저작권이나 허가 소유 여부를 소프트웨어만으로 확인할 수는 없습니다.

실제 Windows 10/11 실기기 검증, 학습 모델, 템포·코드·장르 추정, 오디오 렌더링 및 프로젝트 트랙 자동 연결은 이 단계에 포함되지 않습니다.
