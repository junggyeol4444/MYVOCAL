package main

// The original ComfyUI workflow stays unchanged unless the user explicitly
// selects a locally installed trained identity LoRA from their character library.
import (
 "context"
 "encoding/json"
 "errors"
 "fmt"
 "strings"
)

func validIdentityLoRAName(name string) bool {
 if len(name)<1||len(name)>220||!strings.HasSuffix(strings.ToLower(name),".safetensors")||
  strings.Contains(name,"..")||strings.ContainsAny(name,"/\\\x00\r\n"){return false}
 return true
}

func availableComfyIdentityLoRAs(raw []byte)([]string,error){
 var root map[string]struct {
  Input struct{
   Required map[string]json.RawMessage `json:"required"`
  } `json:"input"`
 }
 if err:=json.Unmarshal(raw,&root);err!=nil{return nil,err}
 node,ok:=root["LoraLoader"]
 if !ok{return nil,errors.New("설치된 ComfyUI에서 LoraLoader 노드를 찾지 못했습니다")}
 var tuple []json.RawMessage
 if err:=json.Unmarshal(node.Input.Required["lora_name"],&tuple);err!=nil||len(tuple)<1{
  return nil,errors.New("로컬 LoRA 목록을 불러올 수 없습니다")
 }
 var names []string
 if err:=json.Unmarshal(tuple[0],&names);err!=nil{
  return nil,errors.New("ComfyUI LoRA 목록 응답 형식이 올바르지 않습니다")
 }
 selected:=make([]string,0,len(names))
 for _,name:=range names{if validIdentityLoRAName(name){selected=append(selected,name)}}
 return selected,nil
}
func ensureComfyIdentityLoRA(ctx context.Context,port int,name string)error{
 if !validIdentityLoRAName(name){return errors.New("허용되지 않는 LoRA 가중치 파일명입니다")}
 raw,status,err:=comfyCall(ctx,port,"GET","/object_info/LoraLoader",nil)
 if err!=nil||status!=200{return errors.New("로컬 ComfyUI LoRA 모델 목록을 조회하지 못했습니다")}
 names,err:=availableComfyIdentityLoRAs(raw)
 if err!=nil{return err}
 for _,actual:=range names{if actual==name{return nil}}
 return fmt.Errorf("현재 ComfyUI에 설치된 LoRA 파일을 찾지 못했습니다: %s",name)
}
