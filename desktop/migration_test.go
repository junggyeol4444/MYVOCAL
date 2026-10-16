package main

import (
 "encoding/json"
 "os"
 "path/filepath"
 "testing"
)
func TestMigrationRequiresExplicitArgument(t *testing.T){
 if requestedNativeMigration(nil)||requestedNativeMigration([]string{"--other"})||requestedNativeMigration([]string{"--migrate-native","extra"})||!requestedNativeMigration([]string{"--migrate-native"}){t.Fatal("migration flag misparsed")}
}
func TestExplicitNativeMigrationPreservesBrowserDataAndPreferenceBackup(t *testing.T){
 base:=t.TempDir()
 dir:=filepath.Join(base,"DesktopProfile","Default","IndexedDB")
 if e:=os.MkdirAll(dir,0700);e!=nil{t.Fatal(e)}
 original:=[]byte("original project bytes")
 saved:=filepath.Join(dir,"original");if e:=os.WriteFile(saved,original,0600);e!=nil{t.Fatal(e)}
 if e:=persistHostMode(base,hostBrowser);e!=nil{t.Fatal(e)}
 if e:=verifyMigrationSource(base);e!=nil{t.Fatal(e)}
 if e:=completeNativeMigration(base);e==nil{t.Fatal("migration should require new native profile")}
 if e:=os.MkdirAll(filepath.Join(base,"NativeWebView2Profile"),0700);e!=nil{t.Fatal(e)}
 if e:=os.WriteFile(filepath.Join(base,"NativeWebView2Profile","Local State"),[]byte("new"),0600);e!=nil{t.Fatal(e)}
 if e:=completeNativeMigration(base);e!=nil{t.Fatal(e)}
 data,e:=os.ReadFile(saved);if e!=nil||string(data)!=string(original){t.Fatal("legacy project changed")}
 p,exists,e:=readHostPreference(base);if e!=nil||!exists||p.Host!=hostWebView2{t.Fatal("new default host not pinned",p,e)}
 old,e:=os.ReadFile(filepath.Join(base,"launcher-host-before-native.json"));if e!=nil{t.Fatal(e)}
 if !containsBrowserPreference(old){t.Fatal("original preference not preserved")}
 if e:=completeNativeMigration(base);e==nil{t.Fatal("repeated migration must fail")}
}
func containsBrowserPreference(raw []byte)bool{return len(raw)>0&&string(raw)!=""&&string(raw)!="null"&&string(raw)!="{}"&&func()bool{
 var p hostPreference
 return jsonUnmarshalPreference(raw,&p)&&p.Host==hostBrowser&&p.Schema==1
}()}
func jsonUnmarshalPreference(raw []byte,p *hostPreference)bool {return json.Unmarshal(raw,p)==nil}
