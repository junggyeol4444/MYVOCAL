//go:build windows

package main

import (
	"reflect"
	"runtime"
	"syscall"
	"testing"
	"unsafe"
)

// These tests are compiled on Linux and MUST be run on a real Windows host
// before WebView2 is considered verified. They do not require the WebView2 SDK.
func TestNativeCOMQueryRefCounts(t *testing.T) {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	state := &nativeWebViewState{STAThreadID: testNativeCurrentThreadID()}
	h := newCOMHandler(iidEnvHandler, 0, state)
	defer state.pins.Unpin()
	var out unsafe.Pointer
	if hr := nativeComQuery(h, &iidEnvHandler, &out); hr != 0 || out != unsafe.Pointer(h) || h.Ref != 2 {
		t.Fatalf("QueryInterface returned hr=%x out=%p ref=%d", hr, out, h.Ref)
	}
	if got := nativeComAddRef(h); got != 3 {
		t.Fatalf("AddRef = %d", got)
	}
	if got := nativeComRelease(h); got != 2 {
		t.Fatalf("Release = %d", got)
	}
	if got := nativeComRelease(h); got != 1 {
		t.Fatalf("Release = %d", got)
	}
	unknown := nativeGUID{A: 0x12345678}
	if hr := nativeComQuery(h, &unknown, &out); hr != eNoInterface || out != nil || h.Ref != 1 {
		t.Fatalf("unknown IID returned hr=%x out=%p ref=%d", hr, out, h.Ref)
	}
}

// Exercise the typed pointer argument and callback ABI without loading WebView2.
// This must be EXECUTED on Windows to validate the callback implementation.
func TestNativeCOMCallPointerArgAndGC(t *testing.T) {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	type mockObject struct{ vtable *[4]uintptr }
	vt := &[4]uintptr{}
	vt[3] = syscall.NewCallback(func(this unsafe.Pointer, value uintptr, out *uintptr) uintptr {
		runtime.GC()
		if this == nil || out == nil {
			return 0x80004003
		}
		*out = value + 1
		return 0
	})
	obj := &mockObject{vtable: vt}
	var pins runtime.Pinner
	pins.Pin(vt)
	pins.Pin(obj)
	defer pins.Unpin()
	var result uintptr
	hr := nativeCOMCall(unsafe.Pointer(obj), 3, nativeCOMValue(41), nativeCOMPointer(unsafe.Pointer(&result)))
	if hr != 0 || result != 42 {
		t.Fatalf("COM ABI: hr=%x result=%d", hr, result)
	}
	runtime.KeepAlive(obj)
}

// A window may be closed before WebView2 completes environment/controller
// creation. Both callbacks must ignore the result without creating controls.
// This is a Windows-only mock test and must be EXECUTED on Windows.
func TestNativeCOMLateCallbacksAfterClose(t *testing.T) {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	previous := nativeActive
	state := &nativeWebViewState{STAThreadID: testNativeCurrentThreadID()}
	defer state.pins.Unpin()
	env := newCOMHandler(iidEnvHandler, 0, state)
	ctl := newCOMHandler(iidControllerHandler, 0, state)
	state.Life.beginClose()
	nativeActive = state
	defer func() { nativeActive = previous }()
	if got := nativeEnvironmentReady(env, 0, nil); got != 0 {
		t.Fatalf("late environment callback HRESULT = %#x", got)
	}
	if got := nativeControllerReady(ctl, 0, nil); got != 0 {
		t.Fatalf("late controller callback HRESULT = %#x", got)
	}
	if state.Environment != nil || state.Controller != nil || state.Failure != nil {
		t.Fatal("late callback modified a closed window")
	}
}

// Verify the real COM teardown sequence against fake vtables. This test is
// compiled on Linux but MUST be executed on Windows to validate the ABI.
func TestNativeCOMShutdownOrderAndIdempotence(t *testing.T) {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	type mockObject struct{ vtable *[46]uintptr }
	var calls []string
	makeObject := func(name string, nav, popup bool) (*mockObject, *[46]uintptr) {
		vt := &[46]uintptr{}
		vt[2] = syscall.NewCallback(func(this unsafe.Pointer) uintptr {
			calls = append(calls, name+":Release")
			return 1
		})
		if nav {
			vt[8] = syscall.NewCallback(func(this unsafe.Pointer, token uintptr) uintptr {
				if token != 0 {
					t.Errorf("navigation token = %d", token)
				}
				calls = append(calls, "nav:remove")
				return 0
			})
		}
		if popup {
			vt[45] = syscall.NewCallback(func(this unsafe.Pointer, token uintptr) uintptr {
				if token != 37 {
					t.Errorf("popup token = %d", token)
				}
				calls = append(calls, "popup:remove")
				return 0
			})
		}
		if name == "controller" {
			vt[24] = syscall.NewCallback(func(this unsafe.Pointer) uintptr {
				calls = append(calls, "controller:Close")
				return 0
			})
		}
		return &mockObject{vtable: vt}, vt
	}
	wv, wvTable := makeObject("webview", true, true)
	ctl, ctlTable := makeObject("controller", false, false)
	env, envTable := makeObject("environment", false, false)
	var pins runtime.Pinner
	for _, p := range []unsafe.Pointer{unsafe.Pointer(wv), unsafe.Pointer(ctl), unsafe.Pointer(env), unsafe.Pointer(wvTable), unsafe.Pointer(ctlTable), unsafe.Pointer(envTable)} {
		pins.Pin(p)
	}
	defer pins.Unpin()
	state := &nativeWebViewState{
		STAThreadID: testNativeCurrentThreadID(),
		WebView:     unsafe.Pointer(wv), Controller: unsafe.Pointer(ctl), Environment: unsafe.Pointer(env),
		NavSubscribed: true, PopupSubscribed: true, NavToken: 0, PopupToken: 37,
	}
	nativeShutdownWebView(state)
	nativeShutdownWebView(state)
	want := []string{"nav:remove", "popup:remove", "controller:Close", "webview:Release", "controller:Release", "environment:Release"}
	if !reflect.DeepEqual(calls, want) {
		t.Fatalf("shutdown order: got %v want %v", calls, want)
	}
	if state.WebView != nil || state.Controller != nil || state.Environment != nil || state.NavSubscribed || state.PopupSubscribed || !state.Shutdown || !state.Life.isClosing() {
		t.Fatal("shutdown retained a live COM interface or subscription")
	}
	runtime.KeepAlive([]*mockObject{wv, ctl, env})
}

// A stale callback from another session must not alter the active WebView2
// session. Only the owner registry is consulted; no actual WebView2 DLL needed.
func TestNativeCOMCallbackOwnerIsolation(t *testing.T) {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	oldActive := nativeActive
	oldState := &nativeWebViewState{STAThreadID: testNativeCurrentThreadID()}
	current := &nativeWebViewState{STAThreadID: testNativeCurrentThreadID()}
	defer oldState.pins.Unpin()
	defer current.pins.Unpin()
	oldEnv := newCOMHandler(iidEnvHandler, 0, oldState)
	oldCtl := newCOMHandler(iidControllerHandler, 0, oldState)
	currentEnv := newCOMHandler(iidEnvHandler, 0, current)
	if got := nativeCallbackOwner(oldEnv); got != oldState {
		t.Fatalf("old handler owner = %p, want %p", got, oldState)
	}
	if got := nativeCallbackOwner(currentEnv); got != current {
		t.Fatalf("current handler owner = %p, want %p", got, current)
	}
	if got := nativeCallbackOwner(nil); got != nil {
		t.Fatalf("nil handler resolved to %p", got)
	}
	nativeActive = current
	defer func() { nativeActive = oldActive }()
	if got := nativeEnvironmentReady(oldEnv, 0, nil); got != 0x80004003 {
		t.Fatalf("stale environment callback HRESULT = %#x", got)
	}
	if got := nativeControllerReady(oldCtl, 0, nil); got != 0x80004003 {
		t.Fatalf("stale controller callback HRESULT = %#x", got)
	}
	if current.Failure != nil || current.Environment != nil || current.Controller != nil {
		t.Fatal("stale callback changed current session")
	}
}

// A navigation event delivered after its owning window is replaced must be
// cancelled before the URI is read, even if the URI would otherwise be allowed.
func TestNativeCOMStaleNavigationFailsClosed(t *testing.T) {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	type mockArgs struct{ vtable *[9]uintptr }
	oldActive := nativeActive
	owner := &nativeWebViewState{STAThreadID: testNativeCurrentThreadID()}
	other := &nativeWebViewState{STAThreadID: testNativeCurrentThreadID()}
	defer owner.pins.Unpin()
	handler := newCOMHandler(iidNavigationHandler, 0, owner)
	var cancelled uintptr
	vt := &[9]uintptr{}
	vt[8] = syscall.NewCallback(func(this unsafe.Pointer, value uintptr) uintptr {
		cancelled = value
		return 0
	})
	args := &mockArgs{vtable: vt}
	var pins runtime.Pinner
	pins.Pin(vt)
	pins.Pin(args)
	defer pins.Unpin()
	nativeActive = other
	defer func() { nativeActive = oldActive }()
	if hr := nativeNavigationStarting(handler, nil, unsafe.Pointer(args)); hr != 0 {
		t.Fatalf("navigation handler HRESULT = %#x", hr)
	}
	if cancelled != 1 {
		t.Fatalf("stale navigation was not cancelled: %d", cancelled)
	}
	runtime.KeepAlive(args)
}

func testNativeCurrentThreadID() uint32 {
	tid, _, _ := procGetCurrentThreadID.Call()
	return uint32(tid)
}

// Wrong-thread callbacks must fail before reading/mutating COM event args.
// This mock is compiled cross-platform but must execute on Windows to prove
// the Win32 thread ID and callback ABI behavior.
func TestNativeCOMRejectsWrongSTAThread(t *testing.T) {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	state := &nativeWebViewState{STAThreadID: testNativeCurrentThreadID() + 1}
	defer state.pins.Unpin()
	handler := newCOMHandler(iidEnvHandler, 0, state)
	old := nativeActive
	nativeActive = state
	defer func() { nativeActive = old }()
	if got := nativeEnvironmentReady(handler, 0, nil); got != rpcEWrongThread {
		t.Fatalf("wrong-thread callback HRESULT = %#x, want %#x", got, rpcEWrongThread)
	}
	if state.Failure != nil || state.Environment != nil || state.Controller != nil {
		t.Fatal("wrong-thread callback mutated COM state")
	}
	type mockArgs struct{ vtable *[9]uintptr }
	called := 0
	vt := &[9]uintptr{}
	vt[6] = syscall.NewCallback(func(this unsafe.Pointer, handled uintptr) uintptr { called++; return 0 })
	vt[8] = syscall.NewCallback(func(this unsafe.Pointer, cancel uintptr) uintptr { called++; return 0 })
	args := &mockArgs{vtable: vt}
	var pins runtime.Pinner
	pins.Pin(vt)
	pins.Pin(args)
	defer pins.Unpin()
	nav := newCOMHandler(iidNavigationHandler, 0, state)
	popup := newCOMHandler(iidPopupHandler, 0, state)
	if got := nativeNavigationStarting(nav, nil, unsafe.Pointer(args)); got != rpcEWrongThread {
		t.Fatalf("wrong-thread navigation HRESULT = %#x", got)
	}
	if got := nativePopupRequested(popup, nil, unsafe.Pointer(args)); got != rpcEWrongThread {
		t.Fatalf("wrong-thread popup HRESULT = %#x", got)
	}
	if called != 0 {
		t.Fatalf("COM args touched on wrong thread: %d calls", called)
	}
	runtime.KeepAlive(args)
}

// PostThreadMessage targets the STA queue without an HWND. The test verifies
// the real Win32 API and private-message session filtering. Cross-built on
// Linux; MUST be executed on Windows before accepting the native host.
func TestNativeSTAThreadQueueAndStaleToken(t *testing.T) {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	peek := nativeUser32.NewProc("PeekMessageW")
	var msg nativeMsg
	// Force creation of the current thread's message queue (PM_NOREMOVE).
	peek.Call(uintptr(unsafe.Pointer(&msg)), 0, 0, 0, 0)
	tid := testNativeCurrentThreadID()
	const token = uintptr(0x1234abcd)
	if r, _, err := procPostThreadMessage.Call(uintptr(tid), wmNativeWrongThread, token, 0); r == 0 {
		t.Fatalf("PostThreadMessage failed: %v", err)
	}
	if r, _, err := procGetMessage.Call(uintptr(unsafe.Pointer(&msg)), 0, 0, 0); int32(r) <= 0 {
		t.Fatalf("GetMessage failed: %v", err)
	}
	if msg.Hwnd != 0 || msg.Message != wmNativeWrongThread || msg.WParam != token {
		t.Fatalf("unexpected STA thread message: %+v", msg)
	}
	previous := nativeActive
	state := &nativeWebViewState{STAThreadID: tid, MessageToken: token + 1}
	state.Window.Store(0x1234) // synthetic: stale token must be ignored
	nativeActive = state
	defer func() { nativeActive = previous }()
	if !nativeHandleSTAThreadMessage(state, &msg) || state.Failure != nil || state.Life.isClosing() {
		t.Fatal("stale STA thread message changed the new session")
	}
}
