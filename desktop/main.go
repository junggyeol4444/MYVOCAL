// MYVOCAL Studio native Windows desktop launcher.
// Fresh installations open the embedded application UI in a native WebView2 window.
// The loopback HTTP endpoint remains an internal transport for existing UI/API code.
// Existing Edge/Chrome profiles remain on their original host to preserve project data.
// This is not an AI generation engine.
package main

import (
	"context"
	"crypto/rand"
	"embed"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

//go:embed index.html
var resources embed.FS

const appPort = "58319"
const userAgent = "MYVOCAL-Studio-Windows-v1.8-step03o"

type appServer struct {
	mu          sync.Mutex
	sessionKey  string
	instanceKey string
	lastPing    time.Time
	pinged      bool
	root        []byte
	manager     managedEngine
	migrationMode bool
 nativeInprocess bool
 hostMode string
}

func (a *appServer) ping() {
	a.mu.Lock()
	a.pinged = true
	a.lastPing = time.Now()
	a.mu.Unlock()
}
func (a *appServer) seen() (bool, time.Time) {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.pinged, a.lastPing
}
func randomKey() (string, error) {
	return generateSessionKey(rand.Reader)
}
func generateSessionKey(reader io.Reader) (string, error) {
	b := make([]byte, 32)
	if _, err := io.ReadFull(reader, b); err != nil {
		return "", fmt.Errorf("보안 난수 생성 실패: %w", err)
	}
	return hex.EncodeToString(b), nil
}
func sessionScript(key string) string {
	// The browser app uses a fixed loopback origin. Existing localStorage and IndexedDB
	// data persist in a dedicated Edge user profile across application restarts.
	return `<script>(function(){
      window.__MYVOCAL_SESSION_KEY="` + key + `";
      var url='/__myvocal_ping?key=` + key + `';
      function ping(){fetch(url,{cache:'no-store'}).catch(function(){});}
      ping();setInterval(ping,5000);
    })();</script>`
}
func (a *appServer) routes() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" && r.URL.Path != "/index.html" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Content-Security-Policy", offlineContentSecurityPolicy)
		w.Write(a.root)
	})
	mux.HandleFunc("/__myvocal_identity", a.identity)
	mux.HandleFunc("/__myvocal_status", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		io.WriteString(w, userAgent)
	})
	mux.HandleFunc("/api/system/readiness", a.systemReadiness)
	mux.HandleFunc("/api/system/migration/complete", a.finishNativeMigration)
	mux.HandleFunc("/api/images/health", a.imageHealth)
	mux.HandleFunc("/api/images/generate", a.imageGenerate)
	mux.HandleFunc("/api/person-mv/generate", a.personMVGenerate)
	mux.HandleFunc("/api/character-mv/generate", a.characterMVGenerate)
	mux.HandleFunc("/api/video/health", a.videoHealth)
	mux.HandleFunc("/api/video/generate", a.videoGenerate)
	mux.HandleFunc("/api/openutau/inspect", a.openUtauInspect)
	mux.HandleFunc("/api/singing/health", a.singingHealth)
	mux.HandleFunc("/api/singing/capabilities", a.singingCapabilities)
	mux.HandleFunc("/api/singing/render", a.singingRender)
	mux.HandleFunc("/api/singing/engine/status", a.engineManagerStatus)
	mux.HandleFunc("/api/singing/engine/start", a.engineManagerStart)
	mux.HandleFunc("/api/singing/engine/stop", a.engineManagerStop)
	mux.HandleFunc("/__myvocal_ping", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("key") != a.sessionKey {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		a.ping()
		w.WriteHeader(http.StatusNoContent)
	})
	return mux
}
func dataDir() string {
	base := os.Getenv("LOCALAPPDATA")
	if base == "" {
		base = os.TempDir()
	}
	return filepath.Join(base, "MYVOCAL Studio")
}
func setupLog() {
	p := filepath.Join(dataDir(), "logs")
	if os.MkdirAll(p, 0700) == nil {
		f, err := os.OpenFile(filepath.Join(p, "launcher.log"), os.O_WRONLY|os.O_APPEND|os.O_CREATE, 0600)
		if err == nil {
			log.SetOutput(f)
		}
	}
}
func edgePaths() []string {
	names := []string{"msedge.exe", "chrome.exe"}
	result := []string{}
	for _, n := range names {
		if p, e := exec.LookPath(n); e == nil {
			result = append(result, p)
		}
	}
	for _, base := range []string{os.Getenv("PROGRAMFILES(X86)"), os.Getenv("PROGRAMFILES"), os.Getenv("LOCALAPPDATA")} {
		if base == "" {
			continue
		}
		result = append(result, filepath.Join(base, "Microsoft", "Edge", "Application", "msedge.exe"))
		result = append(result, filepath.Join(base, "Google", "Chrome", "Application", "chrome.exe"))
	}
	return result
}
func appBrowser(url string) error {
	browser, err := chooseBrowser(dataDir(), availableBrowsers())
	if err != nil {
		return err
	}
	profile := filepath.Join(dataDir(), "DesktopProfile")
	if _, err := inspectDedicatedProfile(profile); err != nil {
		return err
	}
	if err := os.MkdirAll(profile, 0700); err != nil {
		return err
	}
	// A competing process could have replaced an empty directory with a
	// junction between the initial check and creation. Recheck before launch.
	if _, err := inspectDedicatedProfile(profile); err != nil {
		return err
	}
	log.Printf("launching browser family %s with stable profile", browser.Family)
	args, err := browserLaunchArgs(url, profile)
	if err != nil {
		return err
	}
	cmd := exec.Command(browser.Path, args...)
	if err := cmd.Start(); err != nil {
		return err
	}
	// Browser child processes may outlive the first process; Wait cannot
	// determine whether the app window is still open.
	go func() {
		if err := cmd.Wait(); err != nil {
			log.Printf("browser exited: %v", err)
		}
	}()
	return nil
}

// Browser data is origin-scoped; keep the port stable on every restart.
func listenStable(address string) (net.Listener, error) {
	return net.Listen("tcp", address)
}

// Browser windows may spawn detached child processes. Use actual page heartbeat
// rather than the initial browser process lifetime to determine readiness.
func heartbeatAction(started, now time.Time, seen bool, last time.Time) string {
	if !seen {
		if now.Sub(started) > 75*time.Second {
			return "startup-timeout"
		}
		return "wait"
	}
	if now.Sub(last) > 90*time.Second {
		return "closed"
	}
	return "wait"
}

func run() error {
	if err := preflightDesktopStorage(); err != nil {
		return err
	}
	setupLog()
	// Never move an existing Chromium project into a fresh WebView2 profile.
	migration:=requestedNativeMigration(os.Args[1:])
 var mode string
 var pinHost bool
 var err error
 if migration {
  if err=verifyMigrationSource(dataDir());err!=nil{return err}
  if requestedHostMode()!=""{return errors.New("프로필 이전 실행 시 MYVOCAL_DESKTOP_HOST 환경 변수를 함께 사용하지 마세요")}
  mode=hostWebView2
 } else {
  mode,pinHost,err=resolveHostMode(dataDir(),requestedHostMode())
  if err!=nil{return err}
 }
	if mode == hostWebView2 {
		if err := nativeHostAvailable(); err != nil {
			return err
		}
	}
	if pinHost {
		if err := persistHostMode(dataDir(), mode); err != nil {
			return err
		}
	}
	raw, err := resources.ReadFile("index.html")
	if err != nil {
		return err
	}
	key, err := randomKey()
	if err != nil {
		return err
	}
	instanceKey, err := loadOrCreateInstanceKey(dataDir())
	if err != nil {
		return err
	}
	script := sessionScript(key)
 if migration {
  script=strings.Replace(script,"</script>","window.__MYVOCAL_MIGRATION_MODE=true;</script>",1)
 }
 html := strings.Replace(string(raw), "</body>", script+"</body>", 1)
	if html == string(raw) {
		return errors.New("standalone HTML is missing </body>")
	}
	app := &appServer{root: []byte(html), sessionKey: key, instanceKey: instanceKey,migrationMode:migration,hostMode:mode}
 defer app.stopManagedEngine()
 // Experimental direct WebView2 handler. Preserve the existing fixed origin
 // and legacy network mode unless explicitly opted in for Windows GUI testing.
 if mode==hostWebView2 && os.Getenv("MYVOCAL_NATIVE_INPROCESS")=="1" {
  app.nativeInprocess=true
  return runNativeWebView2("http://127.0.0.1:"+appPort,filepath.Join(dataDir(),"NativeWebView2Profile"),secureLoopbackHandler(app.routes()))
 }
	endpoint := "http://127.0.0.1:" + appPort
	listener, err := listenStable("127.0.0.1:" + appPort)
	if err != nil {
		if runningApp(endpoint, instanceKey) {
			if mode == hostWebView2 {
				return errors.New("기존 WebView2 창이 실행 중입니다. 데이터 보호를 위해 중복 창을 열지 않습니다")
			}
			log.Println("existing MYVOCAL session found; opening fixed origin")
			return appBrowser(endpoint)
		}
		// Never pick an arbitrary port: different port means a different localStorage/IndexedDB origin.
		return fmt.Errorf("고정 포트 %s을(를) 사용할 수 없습니다. 다른 프로그램이 포트를 사용 중입니다. 기존 창을 닫거나 포트 점유 프로그램을 종료한 뒤 다시 실행하세요: %w", appPort, err)
	}
	server := &http.Server{Handler: secureLoopbackHandler(app.routes()), ReadHeaderTimeout: 5 * time.Second}
	go func() {
		if e := server.Serve(listener); e != nil && !errors.Is(e, http.ErrServerClosed) {
			log.Printf("serve: %v", e)
		}
	}()
	log.Printf("starting %s on %s", userAgent, endpoint)
	// Smoke-testing server locally (not enabled in normal Windows executables).
	if os.Getenv("MYVOCAL_TEST_HTTP") == "1" {
		fmt.Println(endpoint)
		<-make(chan struct{})
		return nil
	}
	if mode == hostWebView2 {
		// The native message loop runs on its own locked OS thread; on exit
		// the loopback server and managed engines shut down cleanly.
		err := runNativeWebView2(endpoint, filepath.Join(dataDir(), "NativeWebView2Profile"), nil)
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		shutdownErr := server.Shutdown(ctx)
		if err != nil {
			return err
		}
		return shutdownErr
	}
	if err := appBrowser(endpoint); err != nil {
		server.Close()
		return err
	}
	started := time.Now()
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	var lifecycleErr error
	for range ticker.C {
		seen, last := app.seen()
		action := heartbeatAction(started, time.Now(), seen, last)
		switch action {
		case "startup-timeout":
			lifecycleErr = errors.New("브라우저 앱 창이 서버에 연결되지 않았습니다. Edge/Chrome 실행 상태와 보안 정책을 확인해 주세요. 기존 프로젝트 데이터는 삭제하지 않았습니다")
		case "closed":
			log.Println("app window heartbeat ended; shutting down local server")
		}
		if lifecycleErr != nil || action == "closed" {
			break
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		return err
	}
	return lifecycleErr
}
func main() {
	if err := run(); err != nil {
		log.Printf("MYVOCAL failed: %s", err)
		showError("MYVOCAL Studio를 시작할 수 없습니다.\n\n" + err.Error())
		os.Exit(1)
	}
}
