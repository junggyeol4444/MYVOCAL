//go:build windows

package main

// Experimental, opt-in native WebView2 host. Requires Microsoft's x64
// WebView2Loader.dll next to the EXE and the installed WebView2 Runtime.
// This is deliberately NOT enabled for existing Chromium profiles.
// The implementation is Windows-only and still requires real Windows GUI QA.
import (
	"crypto/rand"
	"encoding/binary"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
	"unsafe"
)

const (
	wmSize                  = 0x0005
	wmClose                 = 0x0010
	wmDestroy               = 0x0002
	wmNativeStartupTimeout  = 0x8051 // WM_APP + private STA thread-queue watchdog message
	wmNativeWrongThread     = 0x8052 // STA thread-queue COM violation message
	nativeStartupTimeout    = 45 * time.Second
	wsOverlappedWindow      = 0x00CF0000
	cwUseDefault            = 0x80000000
	swShow                  = 5
	coinitApartmentThreaded = 2
	eNoInterface            = 0x80004002
	rpcEWrongThread         = 0x8001010e
)

type nativeGUID struct {
	A uint32
	B uint16
	C uint16
	D [8]byte
}

var (
	iidIUnknown            = nativeGUID{0, 0, 0, [8]byte{0xc0, 0, 0, 0, 0, 0, 0, 0x46}}
	iidEnvHandler          = nativeGUID{0x4e8a3389, 0xc9d8, 0x4bd2, [8]byte{0xb6, 0xb5, 0x12, 0x4f, 0xee, 0x6c, 0xc1, 0x4d}}
	iidControllerHandler   = nativeGUID{0x6c4819f3, 0xc9b7, 0x4260, [8]byte{0x81, 0x27, 0xc9, 0xf5, 0xbd, 0xe7, 0xf6, 0x8c}}
	iidNavigationHandler   = nativeGUID{0x9adbe429, 0xf36d, 0x432b, [8]byte{0x9d, 0xdc, 0xf8, 0x88, 0x1f, 0xbd, 0x76, 0xe3}}
	iidPopupHandler        = nativeGUID{0xd4c185fe, 0xc81c, 0x4989, [8]byte{0x97, 0xaf, 0x2d, 0x3f, 0xa7, 0xab, 0x56, 0x51}}
	nativeUser32           = syscall.NewLazyDLL("user32.dll")
	nativeKernel32         = syscall.NewLazyDLL("kernel32.dll")
	nativeOle32            = syscall.NewLazyDLL("ole32.dll")
	nativeLoaderOnce       sync.Once
	nativeLoaderErr        error
	nativeLoadedDLL        *syscall.DLL
	procCreateEnvironment  *syscall.Proc
	procGetRuntimeVersion  *syscall.Proc
	procRegisterClass      = nativeUser32.NewProc("RegisterClassExW")
	procCreateWindow       = nativeUser32.NewProc("CreateWindowExW")
	procDefWindow          = nativeUser32.NewProc("DefWindowProcW")
	procShowWindow         = nativeUser32.NewProc("ShowWindow")
	procUpdateWindow       = nativeUser32.NewProc("UpdateWindow")
	procGetMessage         = nativeUser32.NewProc("GetMessageW")
	procTranslateMessage   = nativeUser32.NewProc("TranslateMessage")
	procDispatchMessage    = nativeUser32.NewProc("DispatchMessageW")
	procPostQuitMessage    = nativeUser32.NewProc("PostQuitMessage")
	procPostMessage        = nativeUser32.NewProc("PostMessageW")
	procPostThreadMessage  = nativeUser32.NewProc("PostThreadMessageW")
	procGetClientRect      = nativeUser32.NewProc("GetClientRect")
	procGetModuleHandle    = nativeKernel32.NewProc("GetModuleHandleW")
	procGetCurrentThreadID = nativeKernel32.NewProc("GetCurrentThreadId")
	procCoInitialize       = nativeOle32.NewProc("CoInitializeEx")
	procCoUninitialize     = nativeOle32.NewProc("CoUninitialize")
	procCoTaskMemFree      = nativeOle32.NewProc("CoTaskMemFree")
	nativeActive           *nativeWebViewState
	// The preview is a one-shot process. Keep callbacks pinned after the STA
	// closes: an async COM completion can still hold an external reference.
	// Reclaiming these objects before process exit risks use-after-free.
	nativeRetiredStates []*nativeWebViewState
	// COM handlers cannot embed Go pointers to their owning app state. Keep
	// ownership in a Go-only registry instead, so a late callback from an old
	// WebView2 instance can never act on a newer nativeActive window.
	nativeHandlerOwners = struct {
		sync.RWMutex
		byHandler map[*comHandler]*nativeWebViewState
	}{byHandler: make(map[*comHandler]*nativeWebViewState)}
)

type nativeRect struct{ Left, Top, Right, Bottom int32 }
type nativePoint struct{ X, Y int32 }
type nativeMsg struct {
	Hwnd           uintptr
	Message        uint32
	_              uint32
	WParam, LParam uintptr
	Time           uint32
	Point          nativePoint
	LPrivate       uint32
}
type nativeWindowClass struct {
	Size, Style                        uint32
	WndProc                            uintptr
	ClassExtra, WindowExtra            int32
	Instance, Icon, Cursor, Background uintptr
	MenuName, ClassName                *uint16
	IconSmall                          uintptr
}
type comHandlerVtable struct{ QueryInterface, AddRef, Release, Invoke uintptr }
type comHandler struct {
	// COM receives a pointer to this Go object asynchronously. Both this
	// object and its vtable are pinned for the entire STA message loop.
	// Do not put Go pointers to the app state in this COM-facing structure.
	Vtable *comHandlerVtable
	Ref    int32
	IID    nativeGUID
}
type nativeWebViewState struct {
	Window                           atomic.Uintptr
	STAThreadID                      uint32  // immutable once COM STA starts
	MessageToken                     uintptr // immutable per-session thread message identity
	Environment, Controller, WebView unsafe.Pointer
	EnvHandler, ControllerHandler    *comHandler
	NavHandler, PopupHandler         *comHandler
	NavToken, PopupToken             uint64
	NavSubscribed, PopupSubscribed   bool
	Shutdown                         bool
	URL                              string
	Failure                          error
	Ready                            bool
	Life                             nativeLifecycle
	// Keep the callback objects reachable and non-movable throughout the
	// session and (conservatively) until the one-shot process exits.
	handlers []*comHandler
	pins     runtime.Pinner
}

// Load ONLY from the executable directory: never from current working directory
// or the process-wide DLL search path. A user-installed DLL must not be picked up.
func nativeHostAvailable() error {
	nativeLoaderOnce.Do(func() {
		exe, err := os.Executable()
		if err != nil {
			nativeLoaderErr = err
			return
		}
		dllPath := filepath.Join(filepath.Dir(exe), "WebView2Loader.dll")
		if err = validateX64LoaderPE(dllPath); err != nil {
			nativeLoaderErr = fmt.Errorf("EXE 폴더의 WebView2Loader.dll 검증 실패 (%s): %w", dllPath, err)
			return
		}
		// PE format/architecture checks do not authenticate the publisher.
		// Use the official SHA-512-verified NuGet installer for provenance.
		dll, err := syscall.LoadDLL(dllPath)
		if err != nil {
			nativeLoaderErr = fmt.Errorf("공식 x64 WebView2Loader.dll 로드 실패: %w", err)
			return
		}
		create, err := dll.FindProc("CreateCoreWebView2EnvironmentWithOptions")
		if err != nil {
			nativeLoaderErr = err
			dll.Release()
			return
		}
		version, err := dll.FindProc("GetAvailableCoreWebView2BrowserVersionString")
		if err != nil {
			nativeLoaderErr = err
			dll.Release()
			return
		}
		nativeLoadedDLL = dll
		procCreateEnvironment = create
		procGetRuntimeVersion = version
	})
	if nativeLoaderErr != nil {
		return nativeLoaderErr
	}
	// A valid SDK loader does not mean that the Evergreen Runtime is installed.
	var versionPtr unsafe.Pointer
	hr, _, _ := procGetRuntimeVersion.Call(0, uintptr(unsafe.Pointer(&versionPtr)))
	if versionPtr != nil {
		procCoTaskMemFree.Call(uintptr(versionPtr))
	}
	if !comSucceeded(hr) || versionPtr == nil {
		return fmt.Errorf("Microsoft Edge WebView2 Runtime을 찾지 못했습니다 (HRESULT 0x%08x)", uint32(hr))
	}
	return nil
}

// Keep pointer arguments typed until the actual Windows syscall. Converting a
// pointer to uintptr at the call site and passing it through Go stack frames
// can leave a stale address if the Go stack grows before the native call.
// These typed arguments also keep temporary output buffers GC-reachable.
type nativeCOMArg struct {
	value     uintptr
	ptr       unsafe.Pointer
	isPointer bool
}

func nativeCOMValue(v uintptr) nativeCOMArg          { return nativeCOMArg{value: v} }
func nativeCOMPointer(p unsafe.Pointer) nativeCOMArg { return nativeCOMArg{ptr: p, isPointer: true} }

// COM interfaces are pointers to a native vtable. syscall.SyscallN is the
// Windows ABI boundary. Pointer arguments are pinned only for the duration of
// the synchronous call; async COM callback objects have their own lifetime pins.
func nativeCOMCall(object unsafe.Pointer, index uintptr, args ...nativeCOMArg) uintptr {
	if object == nil {
		return 0x80004003
	}
	vtbl := *(*unsafe.Pointer)(object)
	if vtbl == nil {
		return 0x80004003
	}
	fn := *(*uintptr)(unsafe.Add(vtbl, index*unsafe.Sizeof(uintptr(0))))
	callArgs := make([]uintptr, len(args)+1)
	callArgs[0] = uintptr(object)
	var pins runtime.Pinner
	for i, arg := range args {
		if arg.isPointer {
			if arg.ptr != nil {
				pins.Pin(arg.ptr)
			}
			callArgs[i+1] = uintptr(arg.ptr)
		} else {
			callArgs[i+1] = arg.value
		}
	}
	r, _, _ := syscall.SyscallN(fn, callArgs...)
	pins.Unpin()
	runtime.KeepAlive(args)
	runtime.KeepAlive(object)
	return r
}
func comSucceeded(hr uintptr) bool { return int32(hr) >= 0 }

// NewCallback accepts pointer-sized typed arguments on Windows/amd64.
// Receiving native addresses as typed pointers avoids the unsafe uintptr to
// pointer conversions that vet previously flagged in callback implementations.
func nativeComQuery(this *comHandler, riid *nativeGUID, out *unsafe.Pointer) uintptr {
	if out == nil || riid == nil || this == nil {
		return 0x80004003
	}
	if *riid != iidIUnknown && *riid != this.IID {
		*out = nil
		return eNoInterface
	}
	*out = unsafe.Pointer(this)
	atomic.AddInt32(&this.Ref, 1)
	return 0
}
func nativeComAddRef(this *comHandler) uintptr {
	if this == nil {
		return 0
	}
	return uintptr(atomic.AddInt32(&this.Ref, 1))
}
func nativeComRelease(this *comHandler) uintptr {
	if this == nil {
		return 0
	}
	n := atomic.AddInt32(&this.Ref, -1)
	// COM event subscriptions are removed before handler storage is unpinned.
	return uintptr(n)
}
func newCOMHandler(id nativeGUID, invoke uintptr, state *nativeWebViewState) *comHandler {
	vt := &comHandlerVtable{
		QueryInterface: syscall.NewCallback(nativeComQuery),
		AddRef:         syscall.NewCallback(nativeComAddRef),
		Release:        syscall.NewCallback(nativeComRelease),
		Invoke:         invoke,
	}
	h := &comHandler{Vtable: vt, Ref: 1, IID: id}
	state.pins.Pin(vt)
	state.pins.Pin(h)
	state.handlers = append(state.handlers, h)
	nativeHandlerOwners.Lock()
	nativeHandlerOwners.byHandler[h] = state
	nativeHandlerOwners.Unlock()
	return h
}

// Only the COM handler which initiated a request may complete it. A global
// "current window" lookup alone is unsafe: stale asynchronous completions
// could otherwise initialize the wrong window if native hosting is reused.
// Owners are intentionally retained until process exit with the pinned COM
// handlers; COM may still hold a callback after the window is closed.
func nativeCallbackOwner(handler *comHandler) *nativeWebViewState {
	if handler == nil {
		return nil
	}
	nativeHandlerOwners.RLock()
	owner := nativeHandlerOwners.byHandler[handler]
	nativeHandlerOwners.RUnlock()
	return owner
}

// Private shutdown/watchdog signals target the STA *thread queue*, not an
// HWND. Posting to a stale HWND could accidentally reach a different window
// after Windows recycles the handle. The per-session token prevents a late
// signal from an earlier preview from acting on a later STA session. Thread
// messages are consumed by our GetMessage loop, never by DefWindowProc.
func nativeNewMessageToken() (uintptr, error) {
	var buf [8]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return 0, fmt.Errorf("WebView2 session token generation failed: %w", err)
	}
	token := uintptr(binary.LittleEndian.Uint64(buf[:]))
	if token == 0 {
		return 0, errors.New("WebView2 session token must not be zero")
	}
	return token, nil
}

func nativePostSTAEvent(state *nativeWebViewState, message uintptr) bool {
	if state == nil || state.STAThreadID == 0 || state.MessageToken == 0 || state.Window.Load() == 0 {
		return false
	}
	r, _, err := procPostThreadMessage.Call(uintptr(state.STAThreadID), message, state.MessageToken, 0)
	if r == 0 {
		log.Printf("WebView2 STA thread message 0x%x could not be posted: %v", message, err)
		return false
	}
	return true
}

// WebView2 callbacks and COM interface methods must execute on the STA that
// created the controller. A wrong-thread callback cannot safely call COM to
// cancel an event; request shutdown on the owner thread without referencing
// an HWND or touching any COM interface from the foreign thread.
func nativeOnOwnerSTA(state *nativeWebViewState) bool {
	if state == nil {
		return false
	}
	current, _, _ := procGetCurrentThreadID.Call()
	if nativeSTAOwnerMatches(state.STAThreadID, uint32(current)) {
		return true
	}
	log.Printf("WebView2 COM callback on unexpected thread (expected=%d, actual=%d); requesting STA shutdown", state.STAThreadID, uint32(current))
	nativePostSTAEvent(state, wmNativeWrongThread)
	return false
}

func nativeEnvironmentReady(this *comHandler, result uintptr, environment unsafe.Pointer) uintptr {
	state := nativeCallbackOwner(this)
	if state == nil {
		return 0x80004003
	}
	if !nativeOnOwnerSTA(state) {
		return rpcEWrongThread
	}
	if state != nativeActive {
		return 0x80004003
	}
	// Closing a window during async creation must not start another COM
	// operation. COM owns the callback argument; we did not AddRef it.
	if !state.Life.acceptsInitCallback() || state.Failure != nil {
		return 0
	}
	if !comSucceeded(result) || environment == nil {
		state.Failure = fmt.Errorf("WebView2 환경 생성 실패 (HRESULT 0x%08x)", uint32(result))
		procPostMessage.Call(state.Window.Load(), wmClose, 0, 0)
		return 0
	}
	nativeCOMCall(environment, 1) // Retain beyond the asynchronous callback.
	state.Environment = environment
	state.ControllerHandler = newCOMHandler(iidControllerHandler, syscall.NewCallback(nativeControllerReady), state)
	hr := nativeCOMCall(environment, 3, nativeCOMValue(state.Window.Load()), nativeCOMPointer(unsafe.Pointer(state.ControllerHandler)))
	if !comSucceeded(hr) {
		state.Failure = fmt.Errorf("WebView2 컨트롤러 생성 요청 실패 (HRESULT 0x%08x)", uint32(hr))
		procPostMessage.Call(state.Window.Load(), wmClose, 0, 0)
	}
	return 0
}

// WebView2 strings returned from COM are allocated with CoTaskMemAlloc.
func nativeCOMUTF16(ptr unsafe.Pointer) string {
	if ptr == nil {
		return ""
	}
	defer procCoTaskMemFree.Call(uintptr(ptr))
	raw := (*[8192]uint16)(ptr)
	for i, c := range raw {
		if c == 0 {
			return syscall.UTF16ToString(raw[:i])
		}
	}
	return "" // refuse excessively long / invalid URLs
}
func nativeNavigationStarting(this *comHandler, sender, args unsafe.Pointer) uintptr {
	if args == nil {
		return 0
	}
	state := nativeCallbackOwner(this)
	if state == nil {
		return 0x80004003
	}
	if !nativeOnOwnerSTA(state) {
		return rpcEWrongThread
	}
	if state != nativeActive || state.Life.isClosing() {
		// Even if an obsolete event is delivered on its STA, deny navigation.
		nativeCOMCall(args, 8, nativeCOMValue(1))
		return 0
	}
	var uri unsafe.Pointer
	hr := nativeCOMCall(args, 3, nativeCOMPointer(unsafe.Pointer(&uri)))
	target := nativeCOMUTF16(uri)
	if !comSucceeded(hr) || !allowedNativeNavigation(target) {
		log.Printf("WebView2 blocked top-level navigation")
		nativeCOMCall(args, 8, nativeCOMValue(1))
		return 0
	}
	return 0
}
func nativePopupRequested(this *comHandler, sender, args unsafe.Pointer) uintptr {
	if args == nil {
		return 0
	}
	state := nativeCallbackOwner(this)
	if state == nil {
		return 0x80004003
	}
	if !nativeOnOwnerSTA(state) {
		return rpcEWrongThread
	}
	// Fail closed even for a late event from a retired owner. An unmanaged
	// popup would bypass the top-level navigation origin policy.
	return nativeCOMCall(args, 6, nativeCOMValue(1))
}
func nativeRegisterNavigationGuards(state *nativeWebViewState) error {
	state.NavHandler = newCOMHandler(iidNavigationHandler, syscall.NewCallback(nativeNavigationStarting), state)
	hr := nativeCOMCall(state.WebView, 7, nativeCOMPointer(unsafe.Pointer(state.NavHandler)), nativeCOMPointer(unsafe.Pointer(&state.NavToken)))
	if !comSucceeded(hr) {
		return fmt.Errorf("WebView2 이동 보호 등록 실패: 0x%08x", uint32(hr))
	}
	state.NavSubscribed = true
	state.PopupHandler = newCOMHandler(iidPopupHandler, syscall.NewCallback(nativePopupRequested), state)
	hr = nativeCOMCall(state.WebView, 44, nativeCOMPointer(unsafe.Pointer(state.PopupHandler)), nativeCOMPointer(unsafe.Pointer(&state.PopupToken)))
	if !comSucceeded(hr) {
		nativeCOMCall(state.WebView, 8, nativeCOMValue(uintptr(state.NavToken)))
		state.NavSubscribed = false
		state.NavHandler = nil
		return fmt.Errorf("WebView2 팝업 보호 등록 실패: 0x%08x", uint32(hr))
	}
	state.PopupSubscribed = true
	return nil
}
func nativeControllerReady(this *comHandler, result uintptr, controller unsafe.Pointer) uintptr {
	state := nativeCallbackOwner(this)
	if state == nil {
		return 0x80004003
	}
	if !nativeOnOwnerSTA(state) {
		return rpcEWrongThread
	}
	if state != nativeActive {
		return 0x80004003
	}
	if !state.Life.acceptsInitCallback() || state.Failure != nil {
		return 0
	}
	if !comSucceeded(result) || controller == nil {
		state.Failure = fmt.Errorf("WebView2 컨트롤러 생성 실패 (HRESULT 0x%08x)", uint32(result))
		procPostMessage.Call(state.Window.Load(), wmClose, 0, 0)
		return 0
	}
	nativeCOMCall(controller, 1) // Retain beyond the asynchronous callback.
	state.Controller = controller
	var webview unsafe.Pointer
	hr := nativeCOMCall(controller, 25, nativeCOMPointer(unsafe.Pointer(&webview)))
	if !comSucceeded(hr) || webview == nil {
		state.Failure = fmt.Errorf("WebView2 인터페이스 획득 실패 (HRESULT 0x%08x)", uint32(hr))
		procPostMessage.Call(state.Window.Load(), wmClose, 0, 0)
		return 0
	}
	state.WebView = webview
	if err := nativeRegisterNavigationGuards(state); err != nil {
		state.Failure = err
		procPostMessage.Call(state.Window.Load(), wmClose, 0, 0)
		return 0
	}
	nativeResize(state)
	url, _ := syscall.UTF16PtrFromString(state.URL)
	hr = nativeCOMCall(webview, 5, nativeCOMPointer(unsafe.Pointer(url)))
	if !comSucceeded(hr) {
		state.Failure = fmt.Errorf("WebView2 로컬 앱 이동 실패 (HRESULT 0x%08x)", uint32(hr))
		procPostMessage.Call(state.Window.Load(), wmClose, 0, 0)
	} else if state.Life.markReady() {
		state.Ready = true
	}
	return 0
}
func nativeResize(state *nativeWebViewState) {
	if state == nil || state.Controller == nil || state.Life.isClosing() {
		return
	}
	if !nativeOnOwnerSTA(state) {
		return
	}
	var rect nativeRect
	if r, _, _ := procGetClientRect.Call(state.Window.Load(), uintptr(unsafe.Pointer(&rect))); r == 0 {
		return
	}
	// RECT is a 16-byte by-value COM argument. Windows x64 passes a pointer
	// to the temporary struct for aggregates larger than 8 bytes.
	nativeCOMCall(state.Controller, 6, nativeCOMPointer(unsafe.Pointer(&rect)))
}

// nativeShutdownWebView runs only on the owning COM STA. Mark closing and
// detach all state pointers BEFORE invoking COM: Close/Release can re-enter
// callbacks, which must never observe a live controller being torn down.
// Release order is event unsubscription -> controller.Close -> WebView,
// controller and environment Release. Never call this on a watchdog goroutine.
func nativeShutdownWebView(state *nativeWebViewState) {
	if state == nil || state.Shutdown {
		return
	}
	if !nativeOnOwnerSTA(state) {
		return
	}
	state.Shutdown = true // set first: COM calls can re-enter the window proc
	state.Life.beginClose()
	webview, controller, environment := state.WebView, state.Controller, state.Environment
	state.WebView, state.Controller, state.Environment = nil, nil, nil
	nav, popup := state.NavSubscribed, state.PopupSubscribed
	navToken, popupToken := state.NavToken, state.PopupToken
	state.NavSubscribed, state.PopupSubscribed = false, false
	state.NavToken, state.PopupToken = 0, 0
	state.NavHandler, state.PopupHandler = nil, nil // storage stays pinned
	if webview != nil {
		if nav {
			nativeCOMCall(webview, 8, nativeCOMValue(uintptr(navToken)))
		}
		if popup {
			nativeCOMCall(webview, 45, nativeCOMValue(uintptr(popupToken)))
		}
	}
	if controller != nil {
		nativeCOMCall(controller, 24) // ICoreWebView2Controller.Close
	}
	if webview != nil {
		nativeCOMCall(webview, 2) // IUnknown.Release
	}
	if controller != nil {
		nativeCOMCall(controller, 2)
	}
	if environment != nil {
		nativeCOMCall(environment, 2)
	}
}

// Called only by the owning STA message loop. A private thread message has
// Hwnd=0; it is never sent to a potentially recycled window handle. Consume
// stale or invalid-token private messages without mutating the active state.
func nativeHandleSTAThreadMessage(state *nativeWebViewState, msg *nativeMsg) bool {
	if msg == nil || msg.Hwnd != 0 || (msg.Message != wmNativeWrongThread && msg.Message != wmNativeStartupTimeout) {
		return false
	}
	if state == nil || state != nativeActive || !nativeSessionMessageMatches(state.MessageToken, msg.WParam, state.Window.Load() != 0) {
		return true
	}
	hwnd := state.Window.Load() // read only on the owner STA
	switch msg.Message {
	case wmNativeWrongThread:
		if !state.Life.isClosing() {
			if state.Failure == nil {
				state.Failure = errors.New("WebView2 COM 콜백이 생성 STA가 아닌 스레드에서 호출되어 종료했습니다")
			}
			procPostMessage.Call(hwnd, wmClose, 0, 0)
		}
	case wmNativeStartupTimeout:
		if state.Failure == nil && state.Life.startupTimedOut() {
			state.Failure = errors.New("WebView2 환경/컨트롤러 생성이 45초 내 완료되지 않아 안전하게 종료했습니다")
			procPostMessage.Call(hwnd, wmClose, 0, 0)
		}
	}
	return true
}

func nativeWndProc(hwnd, message, wparam, lparam uintptr) uintptr {
	// A process can receive window messages for unrelated windows; only
	// mutate the currently owned WebView2 window on its STA thread.
	state := nativeActive
	owned := state != nil && state.Window.Load() == hwnd
	switch message {
	case wmSize:
		if owned {
			nativeResize(state)
			return 0
		}
	case wmClose:
		if owned {
			nativeShutdownWebView(state) // before DefWindowProc destroys HWND
		}
		// DefWindowProc destroys the window and sends WM_DESTROY.
	case wmDestroy:
		if owned {
			nativeShutdownWebView(state) // also handles external DestroyWindow
			state.Window.Store(0)        // late callbacks must not post to a recycled HWND
			procPostQuitMessage.Call(0)
			return 0
		}
	}
	result, _, _ := procDefWindow.Call(hwnd, message, wparam, lparam)
	return result
}
func runNativeWebView2(url, profile string) error {
	if url != fixedOrigin {
		return errors.New("WebView2 고정 origin 불일치")
	}
	if !filepath.IsAbs(profile) {
		return errors.New("WebView2 프로필 경로는 절대 경로여야 합니다")
	}
	if err := nativeHostAvailable(); err != nil {
		return err
	}
	if _, err := inspectDedicatedProfile(profile); err != nil {
		return err
	}
	if err := os.MkdirAll(profile, 0700); err != nil {
		return err
	}
	if _, err := inspectDedicatedProfile(profile); err != nil {
		return err
	}
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	hr, _, _ := procCoInitialize.Call(0, coinitApartmentThreaded)
	if !comSucceeded(hr) {
		return fmt.Errorf("WebView2 COM STA 초기화 실패: 0x%08x", uint32(hr))
	}
	defer procCoUninitialize.Call()
	tid, _, _ := procGetCurrentThreadID.Call()
	if tid == 0 {
		return errors.New("WebView2 COM STA thread ID unavailable")
	}
	token, err := nativeNewMessageToken()
	if err != nil {
		return err
	}
	state := &nativeWebViewState{URL: url, STAThreadID: uint32(tid), MessageToken: token}
	nativeActive = state
	defer func() {
		// WebView2 environment/controller creation is asynchronous. A window
		// may close before its completion callback arrives, so releasing Go
		// callback pins here could leave COM with dangling pointers. Keep
		// callback memory rooted/pinned for this one-shot process lifetime.
		// This deliberately retains a small amount of memory until exit.
		nativeActive = nil
		nativeRetiredStates = append(nativeRetiredStates, state)
		runtime.KeepAlive(state)
	}()
	instance, _, _ := procGetModuleHandle.Call(0)
	className, _ := syscall.UTF16PtrFromString("MYVOCALNativeWebView2Window")
	title, _ := syscall.UTF16PtrFromString("MYVOCAL Studio")
	wc := nativeWindowClass{Size: uint32(unsafe.Sizeof(nativeWindowClass{})), WndProc: syscall.NewCallback(nativeWndProc), Instance: instance, ClassName: className}
	if r, _, e := procRegisterClass.Call(uintptr(unsafe.Pointer(&wc))); r == 0 {
		return fmt.Errorf("WebView2 창 클래스 등록 실패: %v", e)
	}
	hwnd, _, e := procCreateWindow.Call(0, uintptr(unsafe.Pointer(className)), uintptr(unsafe.Pointer(title)), wsOverlappedWindow, cwUseDefault, cwUseDefault, 1480, 920, 0, 0, instance, 0)
	if hwnd == 0 {
		return fmt.Errorf("WebView2 창 생성 실패: %v", e)
	}
	state.Window.Store(hwnd)
	procShowWindow.Call(hwnd, swShow)
	procUpdateWindow.Call(hwnd)
	state.EnvHandler = newCOMHandler(iidEnvHandler, syscall.NewCallback(nativeEnvironmentReady), state)
	// Watchdog posts to the STA thread queue, never to a recycled HWND.
	// Timeout state transitions and COM cleanup happen only on the owner STA.
	watchdog := time.AfterFunc(nativeStartupTimeout, func() {
		nativePostSTAEvent(state, wmNativeStartupTimeout)
	})
	defer watchdog.Stop()
	profileUTF16, _ := syscall.UTF16PtrFromString(profile)
	hr, _, _ = procCreateEnvironment.Call(0, uintptr(unsafe.Pointer(profileUTF16)), 0, uintptr(unsafe.Pointer(state.EnvHandler)))
	if !comSucceeded(hr) {
		// Closing the window also flushes the normal message loop below.
		state.Failure = fmt.Errorf("WebView2 환경 요청 실패: 0x%08x", uint32(hr))
		procPostMessage.Call(hwnd, wmClose, 0, 0)
	}
	var msg nativeMsg
	for {
		result, _, _ := procGetMessage.Call(uintptr(unsafe.Pointer(&msg)), 0, 0, 0)
		if int32(result) <= 0 {
			if int32(result) < 0 && state.Failure == nil {
				state.Failure = errors.New("WebView2 메시지 루프 오류")
			}
			break
		}
		if nativeHandleSTAThreadMessage(state, &msg) {
			continue
		}
		procTranslateMessage.Call(uintptr(unsafe.Pointer(&msg)))
		procDispatchMessage.Call(uintptr(unsafe.Pointer(&msg)))
	}
	// Also clean up if GetMessage failed without delivering WM_CLOSE.
	nativeShutdownWebView(state)
	if state.Failure != nil {
		return state.Failure
	}
	if !state.Ready {
		return errors.New("WebView2 앱 초기화가 완료되지 않았습니다")
	}
	return nil
}
