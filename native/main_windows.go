//go:build windows

// MYVOCAL Studio native Windows host. Pure Win32 edit/button controls; no
// browser window, no WebView2, no loopback HTTP server and no external API.
package main

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"unsafe"
)

const (
	wsOverlappedWindow = 0x00cf0000
	wsChild            = 0x40000000
	wsVisible          = 0x10000000
	wsTabstop          = 0x00010000
	wsBorder           = 0x00800000
	wsVScroll          = 0x00200000
	esMultiline        = 0x0004
	esAutoVScroll      = 0x0040
	esWantReturn       = 0x1000
	esAutoHScroll      = 0x0080
	bsPushButton       = 0
	swShow             = 5
	swHide             = 0
	wmDestroy          = 0x0002
	wmClose            = 0x0010
	wmCommand          = 0x0111
	wmSetFont          = 0x0030
	msgWindowTitle     = "MYVOCAL Studio — Native Windows"
)
const (
	navSong = 100 + iota
	navVoice
	navCompose
	navVideo
	navPerson
	navPV
	navLearning
	navProjects
)
const (
	actSave = 201 + iota
	actOpen
	actCompose
	actMIDI
	actWAV
	actSRT
	actBackup
	actLyrics
	actBrowse
)

var (
	user32          = syscall.NewLazyDLL("user32.dll")
	kernel32        = syscall.NewLazyDLL("kernel32.dll")
	gdi32           = syscall.NewLazyDLL("gdi32.dll")
	createWindow    = user32.NewProc("CreateWindowExW")
	defWindowProc   = user32.NewProc("DefWindowProcW")
	registerClass   = user32.NewProc("RegisterClassExW")
	showWindow      = user32.NewProc("ShowWindow")
	updateWindow    = user32.NewProc("UpdateWindow")
	messageBox      = user32.NewProc("MessageBoxW")
	sendMessage     = user32.NewProc("SendMessageW")
	getText         = user32.NewProc("GetWindowTextW")
	getTextLength   = user32.NewProc("GetWindowTextLengthW")
	setText         = user32.NewProc("SetWindowTextW")
	destroyWindow   = user32.NewProc("DestroyWindow")
	postQuit        = user32.NewProc("PostQuitMessage")
	moveWindow      = user32.NewProc("MoveWindow")
	getMessage      = user32.NewProc("GetMessageW")
	transMessage    = user32.NewProc("TranslateMessage")
	dispatchMessage = user32.NewProc("DispatchMessageW")
	getModule       = kernel32.NewProc("GetModuleHandleW")
	createFont      = gdi32.NewProc("CreateFontW")
)

type winClass struct {
	Size     uint32
	Style    uint32
	WndProc  uintptr
	ClsExtra int32
	WndExtra int32
	Instance uintptr
	Icon     uintptr
	Cursor   uintptr
	Brush    uintptr
	Menu     *uint16
	Class    *uint16
	IconSm   uintptr
}
type point struct{ X, Y int32 }
type winMsg struct {
	Hwnd    uintptr
	Msg     uint32
	Pad     uint32
	Wparam  uintptr
	Lparam  uintptr
	Time    uint32
	Pt      point
	Private uint32
}
type uiState struct {
	hwnd                                                    uintptr
	doc                                                     *Document
	section                                                 int
	primary, secondary, meta, genre, title, path            uintptr
	primaryLabel, secondaryLabel, metaLabel, header, status uintptr
	font                                                    uintptr
}

var ui uiState

func wide(s string) *uint16 { p, _ := syscall.UTF16PtrFromString(s); return p }
func callStringProc(p *syscall.LazyProc, h uintptr, s string) {
	p.Call(h, uintptr(unsafe.Pointer(wide(s))))
}
func textOf(h uintptr) string {
	n, _, _ := getTextLength.Call(h)
	if n > 1024*1024 {
		return ""
	}
	chars := make([]uint16, n+1)
	getText.Call(h, uintptr(unsafe.Pointer(&chars[0])), uintptr(len(chars)))
	return syscall.UTF16ToString(chars)
}
func child(class, caption string, x, y, w, h, id int, style uint32) uintptr {
	hwnd, _, _ := createWindow.Call(0, uintptr(unsafe.Pointer(wide(class))), uintptr(unsafe.Pointer(wide(caption))), uintptr(style|wsChild|wsVisible), uintptr(x), uintptr(y), uintptr(w), uintptr(h), ui.hwnd, uintptr(id), 0, 0)
	if hwnd != 0 && ui.font != 0 {
		sendMessage.Call(hwnd, wmSetFont, ui.font, 1)
	}
	return hwnd
}
func label(s string, x, y, w, h int) uintptr { return child("STATIC", s, x, y, w, h, 0, 0) }
func button(id int, s string, x, y, w, h int) uintptr {
	return child("BUTTON", s, x, y, w, h, id, bsPushButton|wsTabstop)
}
func field(id int, s string, x, y, w, h int, multi bool) uintptr {
	style := uint32(wsBorder | wsTabstop | esAutoHScroll)
	if multi {
		style = wsBorder | wsTabstop | esMultiline | esAutoVScroll | esWantReturn | wsVScroll
	}
	return child("EDIT", s, x, y, w, h, id, style)
}
func showNotice(s string) { callStringProc(setText, ui.status, s) }
func alert(s string) {
	messageBox.Call(ui.hwnd, uintptr(unsafe.Pointer(wide(s))), uintptr(unsafe.Pointer(wide("MYVOCAL Studio"))), 0)
}
func defaultFolder() string {
	base := os.Getenv("LOCALAPPDATA")
	if base == "" {
		base = os.TempDir()
	}
	if p := os.Getenv("MYVOCAL_NATIVE_TEST_DIR"); p != "" {
		base = p
	}
	return filepath.Join(base, "MYVOCAL Studio", "NativeProjects")
}
func ensurePath() string {
	p := strings.TrimSpace(textOf(ui.path))
	if p != "" {
		return p
	}
	return filepath.Join(defaultFolder(), "MYVOCAL-Native.myvocal.json")
}
func selectedName(i int) string {
	names := []string{"AI로 노래 만들기", "내 AI 가수 만들기", "직접 작곡하기", "뮤직비디오 만들기", "사람 / 캐릭터 등록", "캐릭터 PV 만들기", "AI 학습실", "프로젝트 열기"}
	if i < 0 || i >= len(names) {
		return ""
	}
	return names[i]
}
func primaryValue(i int) string {
	switch i {
	case navSong, navCompose:
		return ui.doc.String("prompt")
	case navVoice:
		return ui.doc.String("voiceNotes")
	case navVideo:
		return ui.doc.String("nativeStoryboardDraft")
	case navPerson:
		return ui.doc.String("characterDescription")
	case navPV:
		return ui.doc.String("pvInstructions")
	case navLearning:
		return ui.doc.String("learningPermission")
	case navProjects:
		return ui.doc.Path
	}
	return ""
}
func secondaryValue(i int) string {
	switch i {
	case navSong, navCompose:
		return ui.doc.String("lyrics")
	case navVoice:
		return ui.doc.String("voiceId")
	case navVideo:
		return ui.doc.String("videoInstructions")
	case navPerson:
		return ui.doc.String("characterId")
	case navPV:
		return ui.doc.String("pvLyrics")
	case navLearning:
		return ui.doc.String("learningReferences")
	case navProjects:
		return fmt.Sprintf("기존 MYVOCAL 프로젝트 백업(JSON) 열기 및 재저장\r\n문서의 MIDI·영상·보컬 데이터는 JSON 보존 방식으로 유지됩니다.\r\nAI 모델 학습·가창·MP4 생성은 현재 이 네이티브 GUI에서 연결되지 않았습니다.")
	}
	return ""
}
func metaValue(i int) string {
	switch i {
	case navSong, navCompose:
		return strconv.Itoa(ui.doc.Int("bpm"))
	case navVoice:
		return ui.doc.String("voiceStyle")
	case navVideo:
		return ui.doc.String("videoMode")
	case navPerson:
		return ui.doc.String("characterType")
	case navPV:
		return ui.doc.String("pvStyle")
	case navLearning:
		return ui.doc.String("learningMode")
	case navProjects:
		return "MYVOCAL_PROJECT_BACKUP"
	}
	return ""
}
func applyPage() error {
	if ui.section < 100 || ui.section > 107 {
		return nil
	}
	p := textOf(ui.primary)
	s := textOf(ui.secondary)
	m := textOf(ui.meta)
	switch ui.section {
	case navSong, navCompose:
		ui.doc.Set("prompt", p)
		ui.doc.Set("lyrics", s)
		bpm, e := strconv.Atoi(strings.TrimSpace(m))
		if e != nil || bpm < 40 || bpm > 240 {
			return errors.New("BPM은 40~240 사이의 정수여야 합니다")
		}
		ui.doc.Set("bpm", bpm)
	case navVoice:
		ui.doc.Set("voiceNotes", p)
		ui.doc.Set("voiceId", s)
		ui.doc.Set("voiceStyle", m)
	case navVideo:
		ui.doc.Set("nativeStoryboardDraft", p)
		ui.doc.Set("videoInstructions", s)
		ui.doc.Set("videoMode", m)
	case navPerson:
		ui.doc.Set("characterDescription", p)
		ui.doc.Set("characterId", s)
		ui.doc.Set("characterType", m)
	case navPV:
		ui.doc.Set("pvInstructions", p)
		ui.doc.Set("pvLyrics", s)
		ui.doc.Set("pvStyle", m)
	case navLearning:
		ui.doc.Set("learningPermission", p)
		ui.doc.Set("learningReferences", s)
		ui.doc.Set("learningMode", m)
	case navProjects:
		// Project page has a read-only explanation; never overwrite unknown source fields.
	}
	ui.doc.Set("title", strings.TrimSpace(textOf(ui.title)))
	// Genre remains editable as an authored descriptor, while original genreMix
	// from imported projects is preserved for lossless save/restore.
	ui.doc.Set("nativeGenreSelection", textOf(ui.genre))
	return nil
}
func setPage(section int) {
	if section != ui.section {
		if err := applyPage(); err != nil {
			alert(err.Error())
			return
		}
	}
	ui.section = section
	callStringProc(setText, ui.header, selectedName(section))
	switch section {
	case navSong, navCompose:
		callStringProc(setText, ui.primaryLabel, "자연어 제작 지시 / 주제")
		callStringProc(setText, ui.secondaryLabel, "편집 가능한 가사")
		callStringProc(setText, ui.metaLabel, "BPM (40~240)")
	case navVoice:
		callStringProc(setText, ui.primaryLabel, "목소리 녹음 및 학습 계획 메모")
		callStringProc(setText, ui.secondaryLabel, "VOICE MODEL ID")
		callStringProc(setText, ui.metaLabel, "SINGING STYLE")
	case navVideo:
		callStringProc(setText, ui.primaryLabel, "Storyboard 장면 설명 (한 줄에 한 장면)")
		callStringProc(setText, ui.secondaryLabel, "MV 제작 지시")
		callStringProc(setText, ui.metaLabel, "영상 모드")
	case navPerson:
		callStringProc(setText, ui.primaryLabel, "인물 / 캐릭터 설명 및 사용 권한")
		callStringProc(setText, ui.secondaryLabel, "Character Library ID")
		callStringProc(setText, ui.metaLabel, "자료 종류 (본인·사용허가·참고)")
	case navPV:
		callStringProc(setText, ui.primaryLabel, "캐릭터 PV 제작 계획")
		callStringProc(setText, ui.secondaryLabel, "PV 가사")
		callStringProc(setText, ui.metaLabel, "PV 스타일")
	case navLearning:
		callStringProc(setText, ui.primaryLabel, "학습 자료 권한 (내가 만든 자료 / 내 목소리 / 허가받음 / Reference)")
		callStringProc(setText, ui.secondaryLabel, "학습 자료 파일/설명")
		callStringProc(setText, ui.metaLabel, "학습/분석 모드")
	case navProjects:
		callStringProc(setText, ui.primaryLabel, "프로젝트 파일 경로")
		callStringProc(setText, ui.secondaryLabel, "데이터 보존 및 호환성 안내")
		callStringProc(setText, ui.metaLabel, "백업 형식")
	}
	callStringProc(setText, ui.primary, primaryValue(section))
	callStringProc(setText, ui.secondary, secondaryValue(section))
	callStringProc(setText, ui.meta, metaValue(section))
	showNotice(selectedName(section) + " · 편집 내용을 저장하면 로컬 파일에 보존됩니다")
}
func loadDocument(doc *Document) {
	ui.doc = doc
	callStringProc(setText, ui.title, doc.String("title"))
	callStringProc(setText, ui.genre, doc.String("nativeGenreSelection"))
	if doc.Path != "" {
		callStringProc(setText, ui.path, doc.Path)
	}
	section := ui.section
	if section < navSong || section > navProjects {
		section = navSong
	}
	ui.section = 0
	setPage(section)
}
func saveProject() error {
	if err := applyPage(); err != nil {
		return err
	}
	path := ensurePath()
	if !strings.HasSuffix(strings.ToLower(path), ".json") {
		return errors.New("저장 파일은 .json 확장자를 사용해야 합니다")
	}
	if err := ui.doc.Save(path); err != nil {
		return err
	}
	showNotice("저장 완료: " + path)
	return nil
}
func outPath(ext string) string {
	p := ensurePath()
	if strings.HasSuffix(strings.ToLower(p), ".myvocal.json") {
		p = p[:len(p)-len(".myvocal.json")]
	} else {
		p = strings.TrimSuffix(p, filepath.Ext(p))
	}
	return p + ext
}
func handleAction(id int) {
	if err := applyPage(); err != nil {
		alert(err.Error())
		return
	}
	var err error
	var done string
	switch id {
	case actSave:
		err = saveProject()
		if err == nil {
			return
		}
	case actOpen:
		path := ensurePath()
		var doc *Document
		doc, err = ReadDocument(path)
		if err == nil {
			loadDocument(doc)
			done = "프로젝트 열기 완료 · 원본 필드 유지"
		}
	case actCompose:
		err = ui.doc.GenerateEditableScore()
		done = "Lead / Harmony / Bass / Drums 4개 MIDI 트랙 생성 (규칙 기반, AI 아님)"
	case actMIDI:
		err = WriteMIDI(outPath(".mid"), ui.doc.Tracks(), ui.doc.Int("bpm"))
		done = "MIDI 파일 출력: " + outPath(".mid")
	case actWAV:
		err = WritePreviewWAV(outPath("-preview.wav"), ui.doc.Tracks(), ui.doc.Int("bpm"))
		done = "규칙 기반 미리듣기 WAV 출력: " + outPath("-preview.wav")
	case actSRT:
		err = ExportSRT(outPath(".srt"), ui.doc.String("nativeStoryboardDraft"))
		done = "Storyboard 자막 출력: " + outPath(".srt")
	case actBackup:
		var b []byte
		b, err = ui.doc.Marshal()
		if err == nil {
			err = AtomicWrite(outPath("-backup.myvocal.json"), b)
		}
		done = "프로젝트 백업 저장: " + outPath("-backup.myvocal.json")
	case actLyrics:
		err = ExportLyrics(outPath("-lyrics.txt"), ui.doc.String("lyrics"))
		done = "가사 파일 출력: " + outPath("-lyrics.txt")
	case actBrowse:
		// File selection is deliberately a standard Windows user-editable path,
		// never an invisible browser URL or private web server.
		alert("상단 프로젝트 경로에 .myvocal.json 파일의 전체 경로를 입력한 뒤 [프로젝트 열기]를 누르세요.")
		return
	}
	if err != nil {
		showNotice("오류: " + err.Error())
		alert(err.Error())
		return
	}
	showNotice(done)
}
func initControls() {
	// Native Win32 application window: navigation matches original section 2.
	label("MYVOCAL Studio", 28, 20, 260, 36)
	label("Windows 전용 · 인터넷 서버/브라우저 사용 안 함", 28, 60, 252, 38)
	nav := []struct {
		id      int
		caption string
	}{{navSong, "AI로 노래 만들기"}, {navVoice, "내 AI 가수 만들기"}, {navCompose, "직접 작곡하기"}, {navVideo, "뮤직비디오 만들기"}, {navPerson, "사람 / 캐릭터 등록"}, {navPV, "캐릭터 PV 만들기"}, {navLearning, "AI 학습실"}, {navProjects, "프로젝트 열기"}}
	for i, x := range nav {
		button(x.id, x.caption, 24, 125+i*64, 255, 49)
	}
	label("프로젝트 제목", 315, 26, 145, 23)
	ui.title = field(301, "", 452, 20, 690, 33, false)
	label("프로젝트 저장 경로", 315, 70, 165, 25)
	ui.path = field(302, "", 481, 65, 661, 33, false)
	ui.header = label("", 316, 126, 780, 36)
	ui.primaryLabel = label("", 315, 170, 400, 26)
	ui.primary = field(303, "", 315, 198, 827, 132, true)
	ui.secondaryLabel = label("", 315, 345, 405, 25)
	ui.secondary = field(304, "", 315, 371, 827, 158, true)
	ui.metaLabel = label("", 315, 544, 240, 25)
	ui.meta = field(305, "", 315, 571, 233, 32, false)
	label("장르 · 사용자 설명", 580, 544, 282, 25)
	ui.genre = field(306, "", 580, 571, 562, 32, false)
	actions := []struct {
		id int
		s  string
		x  int
		y  int
		w  int
	}{{actSave, "프로젝트 저장", 315, 623, 165}, {actOpen, "프로젝트 열기", 493, 623, 165}, {actCompose, "편집 트랙 생성", 671, 623, 165}, {actMIDI, "MIDI 출력", 849, 623, 138}, {actWAV, "WAV 미리듣기", 1000, 623, 142}, {actSRT, "SRT 자막", 315, 678, 165}, {actBackup, "전체 백업", 493, 678, 165}, {actLyrics, "가사 TXT", 671, 678, 165}, {actBrowse, "경로 안내", 849, 678, 138}}
	for _, a := range actions {
		button(a.id, a.s, a.x, a.y, a.w, 43)
	}
	ui.status = label("", 24, 772, 1175, 40)
	dir := defaultFolder()
	_ = os.MkdirAll(dir, 0700)
	loadDocument(NewDocument())
	callStringProc(setText, ui.path, filepath.Join(dir, "MYVOCAL-Native.myvocal.json"))
}
func wndProc(hwnd uintptr, msg uint32, wparam, lparam uintptr) uintptr {
	switch msg {
	case wmCommand:
		id := int(uint16(wparam))
		if id >= navSong && id <= navProjects {
			setPage(id)
			return 0
		}
		if id >= actSave && id <= actBrowse {
			handleAction(id)
			return 0
		}
	case wmClose:
		destroyWindow.Call(hwnd)
		return 0
	case wmDestroy:
		postQuit.Call(0)
		return 0
	}
	r, _, _ := defWindowProc.Call(hwnd, uintptr(msg), wparam, lparam)
	return r
}
func main() {
	hmod, _, _ := getModule.Call(0)
	face := wide("Segoe UI")
	ui.font, _, _ = createFont.Call(19, 0, 0, 0, 400, 0, 0, 0, 1, 0, 0, 0, 0, uintptr(unsafe.Pointer(face)))
	className := wide("MYVOCAL_NativeStudio_Window")
	wc := winClass{Size: uint32(unsafe.Sizeof(winClass{})), WndProc: syscall.NewCallback(wndProc), Instance: hmod, Brush: 6, Class: className}
	registered, _, err := registerClass.Call(uintptr(unsafe.Pointer(&wc)))
	if registered == 0 {
		_ = err
		return
	}
	hwnd, _, _ := createWindow.Call(0, uintptr(unsafe.Pointer(className)), uintptr(unsafe.Pointer(wide(msgWindowTitle))), wsOverlappedWindow|wsVisible, 100, 70, 1200, 880, 0, 0, hmod, 0)
	if hwnd == 0 {
		return
	}
	ui.hwnd = hwnd
	initControls()
	showWindow.Call(hwnd, swShow)
	updateWindow.Call(hwnd)
	var m winMsg
	for {
		r, _, _ := getMessage.Call(uintptr(unsafe.Pointer(&m)), 0, 0, 0)
		if int32(r) <= 0 {
			break
		}
		transMessage.Call(uintptr(unsafe.Pointer(&m)))
		dispatchMessage.Call(uintptr(unsafe.Pointer(&m)))
	}
}
