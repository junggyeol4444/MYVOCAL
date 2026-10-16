package main

// Explicit, lossless host migration. Existing Chromium data is never modified.
// The native host only becomes the default AFTER a complete workspace ZIP has
// been imported in the new profile and the user explicitly confirms it.
import (
 "encoding/json"
 "errors"
 "fmt"
 "net/http"
 "os"
 "path/filepath"
)

func requestedNativeMigration(args []string) bool {
 return len(args)==1 && args[0]=="--migrate-native"
}
func verifyMigrationSource(base string) error {
 p, exists, err := readHostPreference(base)
 if err!=nil {return err}
 if !exists||p.Host!=hostBrowser {return errors.New("기존 브라우저 프로필로 실행하는 MYVOCAL에서만 네이티브 이전을 시작할 수 있습니다")}
 present,err:=profileHasData(filepath.Join(base,"DesktopProfile"))
 if err!=nil {return err}
 if !present {return errors.New("기존 프로젝트 브라우저 저장소를 찾지 못했습니다")}
 if _,err:=inspectDedicatedProfile(filepath.Join(base,"NativeWebView2Profile"));err!=nil{return err}
 return nil
}
func completeNativeMigration(base string) error {
 if err:=verifyMigrationSource(base);err!=nil{return err}
 present,err:=profileHasData(filepath.Join(base,"NativeWebView2Profile"))
 if err!=nil{return err}
 if !present{return errors.New("네이티브 프로필이 아직 생성되지 않았습니다")}
 path:=filepath.Join(base,"launcher-host.json")
 if err:=inspectLauncherPreferenceFile(path);err!=nil{return err}
 // Preserve the previous pinned host preference as a separate hard link.
 backup:=filepath.Join(base,"launcher-host-before-native.json")
 if err:=inspectLauncherPreferenceFile(backup);err!=nil{return err}
 if _,err:=os.Lstat(backup);err==nil {
  return errors.New("이전 실행 설정 백업이 이미 존재합니다. 중복 이전을 중단합니다")
 } else if !errors.Is(err,os.ErrNotExist){return err}
 if err:=os.Link(path,backup);err!=nil{return fmt.Errorf("기존 실행 설정 보존 실패: %w",err)}
 // Publish a fully flushed new preference atomically. Never delete the legacy
 // profile, its IndexedDB, or the saved backup/setting.
 pref:=hostPreference{Schema:1,Host:hostWebView2,Origin:fixedOrigin}
 raw,err:=json.MarshalIndent(pref,"","  ")
 if err!=nil{return err}
 temp,err:=os.CreateTemp(base,".native-host-*.tmp")
 if err!=nil{return err}
 defer os.Remove(temp.Name())
 if err=temp.Chmod(0600);err==nil {_,err=temp.Write(append(raw,'\n'))}
 if err==nil{err=temp.Sync()}
 if closeErr:=temp.Close();err==nil{err=closeErr}
 if err!=nil{return err}
 if err:=os.Rename(temp.Name(),path);err!=nil{return fmt.Errorf("네이티브 기본 창 설정 실패 (이전 설정 보존): %w",err)}
 p,exists,err:=readHostPreference(base)
 if err!=nil{return err}
 if !exists||p.Host!=hostWebView2{return errors.New("변경한 실행 설정을 다시 읽을 수 없습니다")}
 return nil
}
func (a *appServer) finishNativeMigration(w http.ResponseWriter,r *http.Request) {
 if r.Method!=http.MethodPost {jsonError(w,405,"POST만 지원합니다");return}
 if !a.authorizeSinging(w,r){return}
 a.mu.Lock()
 defer a.mu.Unlock()
 if !a.migrationMode {jsonError(w,409,"네이티브 이전 모드가 아닙니다");return}
 if err:=completeNativeMigration(dataDir());err!=nil {jsonError(w,409,err.Error());return}
 a.migrationMode=false
 jsonReply(w,map[string]any{"completed":true,"host":"webview2","legacyPreserved":true})
}
