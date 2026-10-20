#!/usr/bin/env python3
"""Apply MYVOCAL 29th-session cumulative RVC+Singing changes to an EXISTING checkout.

Targets the exact files in the current GitHub main (2026-10-20, 52f68e74).
No user media, model, IndexedDB, or backup file is touched. Checks every anchor
before modifying any file. Never replaces the repository with a standalone app.
"""
import argparse
import difflib
from pathlib import Path
import os
import subprocess
import tempfile

BASE = Path(__file__).resolve().parents[1]


def replace_once(text, old, new, filename):
    count = text.count(old)
    if count != 1:
        raise ValueError(f'{filename}: 변경 위치 {count}개(필요 1개), 기존 소스는 변경하지 않았습니다: {old[:110]!r}')
    return text.replace(old, new, 1)


def patch_go(s, p):
    s = replace_once(s, '\t"encoding/json"\n', '\t"encoding/json"\n\t"embed"\n', p)
    s = replace_once(s, '\t"path/filepath"\n', '\t"path/filepath"\n\t"runtime"\n\t"strconv"\n', p)
    s = replace_once(s, 'const maxRVCTrainingBundle = 151 << 20',
        '//go:embed rvc_official_worker.py\nvar embeddedRVCOfficialWorker embed.FS\n\nconst maxRVCTrainingBundle = 151 << 20', p)
    s = replace_once(s, '\tVoiceID string\n}',
        '\tVoiceID string\n\tMode string\n\tEpochs int\n\tBatchSize int\n\tGPU string\n}', p)
    anchor = '\tif len(o.Root) > 1024 || len(o.Python) > 1024 || len(o.Script) > 1024 || !filepath.IsAbs(o.Root) || !filepath.IsAbs(o.Python) || !filepath.IsAbs(o.Script) {'
    official = '''\tif o.Mode != "" && o.Mode != "custom" && o.Mode != "official" {
		return errors.New("알 수 없는 RVC 학습 방식입니다")
	}
	if o.Mode == "official" {
		if len(o.Root) > 1024 || len(o.Python) > 1024 || !filepath.IsAbs(o.Root) || !filepath.IsAbs(o.Python) || strings.ContainsAny(o.Root+o.Python, "\\x00\\r\\n") {
			return errors.New("공식 RVC 설치 폴더와 Python 절대 경로가 필요합니다")
		}
		if err := ensureRegular(o.Python); err != nil { return fmt.Errorf("Python 실행 파일: %w", err) }
		if o.Epochs < 1 || o.Epochs > 1000 || o.BatchSize < 1 || o.BatchSize > 64 || len(o.GPU) > 2 {
			return errors.New("RVC 에포크·배치·GPU 값이 올바르지 않습니다")
		}
		gpu, err := strconv.Atoi(o.GPU)
		if err != nil || gpu < 0 || gpu > 15 { return errors.New("GPU 번호는 0~15만 지원합니다") }
		for _, name := range []string{"train/preprocess.py", "train/dataset/extract_f0.py", "train/dataset/extract_hubert_feature.py", "train/train.py", "infer/cli.py", "configs/v2/48k.json", "assets/hubert_base/config.json", "assets/pretrained_v2/f0G48k.pth", "assets/pretrained_v2/f0D48k.pth"} {
			if err := ensureRegular(filepath.Join(o.Root, filepath.FromSlash(name))); err != nil { return fmt.Errorf("설치된 공식 RVC %s: %w", name, err) }
		}
		return nil
	}
'''
    s = replace_once(s, anchor, official + anchor, p)
    anchor = 'func runRVCTraining(ctx context.Context, o rvcTrainingOptions, dataset, output string, log io.Writer) error {\n\targs := []string{o.Script}'
    replacement = '''func runRVCTraining(ctx context.Context, o rvcTrainingOptions, dataset, output string, log io.Writer) error {
	if o.Mode == "official" {
		raw, err := embeddedRVCOfficialWorker.ReadFile("rvc_official_worker.py")
		if err != nil { return err }
		script := filepath.Join(filepath.Dir(dataset), "rvc_official_worker.py")
		if err = os.WriteFile(script, raw, 0600); err != nil { return err }
		defer os.Remove(script) // Created inside this job only, not the installed RVC.
		var id [16]byte
		if _, err = rand.Read(id[:]); err != nil { return err }
		expName := "myvocal_" + hex.EncodeToString(id[:])
		expDir := filepath.Join(o.Root, "logs", expName)
		// On Windows, forced cancellation kills the child process before its
		// Python finally handler. Clean ONLY scratch with our matching marker.
		defer func() {
			marker := filepath.Join(expDir, ".myvocal-experiment")
			info, statErr := os.Lstat(expDir)
			proofInfo, proofErr := os.Lstat(marker)
			if statErr != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 || proofErr != nil || !proofInfo.Mode().IsRegular() { return }
			proof, readErr := os.ReadFile(marker)
			if readErr == nil && string(proof) == expName { _ = os.RemoveAll(expDir) }
		}()
		cmd := exec.CommandContext(ctx, o.Python, script, "--root", o.Root, "--dataset", dataset, "--output", output,
			"--epochs", strconv.Itoa(o.Epochs), "--batch-size", strconv.Itoa(o.BatchSize), "--gpu", o.GPU,
			"--experiment-name", expName)
		cmd.Dir = o.Root
		cmd.Stdin = nil
		cmd.Stdout = log
		cmd.Stderr = log
		if runtime.GOOS == "windows" {
			cmd.Cancel = func() error {
				if cmd.Process == nil { return os.ErrProcessDone }
				kill := exec.Command("taskkill", "/PID", strconv.Itoa(cmd.Process.Pid), "/T", "/F")
				if err := kill.Run(); err != nil { return cmd.Process.Kill() }
				return nil
			}
		}
		if err = cmd.Run(); err != nil { return fmt.Errorf("RVC 공식 전처리/F0/HuBERT/학습 실패: %w", err) }
		return nil
	}
	args := []string{o.Script}'''
    s = replace_once(s, anchor, replacement, p)
    anchor = 'o := rvcTrainingOptions{Root: r.FormValue("root"), Python: r.FormValue("python"), Script: r.FormValue("script"), Args: args, VoiceID: r.FormValue("voiceId")}'
    replacement = '''epochs, _ := strconv.Atoi(r.FormValue("epochs"))
	batch, _ := strconv.Atoi(r.FormValue("batchSize"))
	o := rvcTrainingOptions{Root: r.FormValue("root"), Python: r.FormValue("python"), Script: r.FormValue("script"), Args: args, VoiceID: r.FormValue("voiceId"), Mode: r.FormValue("mode"), Epochs: epochs, BatchSize: batch, GPU: r.FormValue("gpu")}'''
    return replace_once(s, anchor, replacement, p)


def patch_client(s, p):
    s = replace_once(s, 'const {root,python,script,args,voiceId,rightsConfirmed}=settings||{};',
        'const {root,python,script,args,voiceId,rightsConfirmed,mode,epochs,batchSize,gpu}=settings||{};', p)
    anchor = "if([root,python,script].some(x=>typeof x!=='string'||!x.trim()||x.length>1024))throw Error('RVC 설치 폴더·Python.exe·학습 스크립트 경로를 입력하세요.');"
    official = '''if(mode==='official'){
  if([root,python].some(x=>typeof x!=='string'||!x.trim()||x.length>1024)||!/(?:^|[/\\\\])python\\.exe$/i.test(python))throw Error('공식 RVC 설치 폴더와 Python.exe 경로를 입력하세요.');
  if(!Number.isInteger(epochs)||epochs<1||epochs>1000||!Number.isInteger(batchSize)||batchSize<1||batchSize>64||!/^([0-9]|1[0-5])$/.test(String(gpu)))throw Error('공식 RVC 에포크(1~1000)·배치(1~64)·GPU(0~15) 값을 확인하세요.');
  return [];
 }
 if(mode&&mode!=='custom')throw Error('지원하지 않는 RVC 학습 방식입니다.');
 '''
    s = replace_once(s, anchor, official + anchor, p)
    anchor = "form.set('args',JSON.stringify(args));form.set('rights','confirmed');"
    return replace_once(s, anchor, anchor + "\n form.set('mode',settings.mode||'custom');\n if(settings.mode==='official'){form.set('epochs',String(settings.epochs));form.set('batchSize',String(settings.batchSize));form.set('gpu',String(settings.gpu));}", p)


def patch_panel(s, p):
    anchor = '''const [args,setArgs]=useState('["--dataset","{dataset}","--output","{output}"]');'''
    s = replace_once(s, anchor, anchor + "\n const [mode,setMode]=useState('official'),[epochs,setEpochs]=useState(20),[batchSize,setBatchSize]=useState(2),[gpu,setGpu]=useState('0');", p)
    s = replace_once(s, '{root,python,script,args,voiceId:originalVoice,rightsConfirmed:confirmed}',
        '{root,python,script,args,mode,epochs,batchSize,gpu,voiceId:originalVoice,rightsConfirmed:confirmed}', p)
    anchor = '''<Notice>사용자 PC에 Python·RVC 학습 환경을 설치해야 합니다. 이 버튼은 {dataset} 입력 폴더와 {output} 모델 파일 인수를 지원하는 **별도 호환 학습 스크립트**를 실행합니다. RVC 공식 WebUI의 train/train.py는 전처리·F0·HuBERT·config/filelist 생성 없이 이 두 인수만으로 학습되지 않습니다. 사용하는 RVC 버전에 맞춘 단계별 실행 스크립트를 지정해야 합니다. GPU 모델 설치·학습 성공을 자동 보증하지 않습니다.</Notice>'''
    custom_notice=anchor.replace('{dataset}', "{'{dataset}'}").replace('{output}', "{'{output}'}")
    replacement = '''{mode==='official'?<Notice>사용자가 설치한 공식 RVC v2 48k, CUDA, HuBERT와 사전학습 가중치를 사용해 전처리→F0→HuBERT→신경망 훈련을 실행합니다. 학습 원본과 기존 모델은 변경하지 않습니다. 실제 GPU·음질 검증은 별도로 필요합니다.</Notice>:'''+custom_notice+'''}
  <Field label="RVC 학습 방식"><select value={mode} disabled={busy} onChange={e=>setMode(e.target.value)}><option value="official">공식 RVC v2 48k 단계별 학습</option><option value="custom">기존 사용자 지정 학습 스크립트</option></select></Field>'''
    s = replace_once(s, anchor, replacement, p)
    start = s.find('  <Field label="설치된 학습 스크립트 (.py)">')
    end = s.find('  <label><input type="checkbox"', start)
    if start < 0 or end < 0:
        raise ValueError('RVC GUI 원본 스크립트·인수 입력 블록을 찾지 못했습니다')
    original = s[start:end]
    if original.count('학습 실행 인수') != 1 or original.count('학습 스크립트') != 1:
        raise ValueError('RVC GUI 변경 위치가 모호합니다')
    replacement = '''  {mode==='official'?<div className="mv7-actions">
   <Field label="에포크 (1~1000)"><input type="number" min="1" max="1000" value={epochs} disabled={busy} onChange={e=>setEpochs(Number(e.target.value))}/></Field>
   <Field label="배치 크기 (1~64)"><input type="number" min="1" max="64" value={batchSize} disabled={busy} onChange={e=>setBatchSize(Number(e.target.value))}/></Field>
   <Field label="CUDA GPU 번호 (0~15)"><input value={gpu} disabled={busy} onChange={e=>setGpu(e.target.value)}/></Field>
  </div>:<>''' + original + '''</>}
'''
    return s[:start] + replacement + s[end:]


def patch_singing(s, p):
    s = replace_once(s, "import {putFile,removeFile} from '../lib/assetDb';", "import {putFileNew,removeFile} from '../lib/assetDb';", p)
    s = replace_once(s, "import RvcVoiceConversion from './RvcVoiceConversion.jsx';", "import RvcVoiceConversion from './RvcVoiceConversion.jsx';\nimport {readRVCPreferences} from '../lib/rvcPreferences.js';\nimport {convertLongSingingWithRVC} from '../lib/rvcLongConversion.js';", p)
    anchor = " const [cueStart,setCueStart]=useState(1),[cueEnd,setCueEnd]=useState(4);"
    s = replace_once(s, anchor, anchor + "\n const [autoRvc,setAutoRvc]=useState(false),[autoRvcRights,setAutoRvcRights]=useState(false),[sourceVocal,setSourceVocal]=useState(null);", p)
    anchor = "setCapability(null);setCueStart(1);setCueEnd(4);},[p.id]);"
    s = replace_once(s, anchor, "setCapability(null);setCueStart(1);setCueEnd(4);setAutoRvc(false);setAutoRvcRights(false);setSourceVocal(null);},[p.id]);", p)
    s = replace_once(s, "  await putFile(assetId,file);", "  await putFileNew(assetId,file);", p)
    s = replace_once(s, "const changeResult=(blob,kind,count,fileKind=kind,placement=null)=>{if(latestUrl.current)", "const changeResult=(blob,kind,count,fileKind=kind,placement=null)=>{if(kind!=='rvc-neural')setSourceVocal(null);if(latestUrl.current)", p)
    s = replace_once(s, "track.name=result.kind==='engine'?'별도 로컬 엔진 보컬'", "track.name=result.kind==='rvc-neural'?'외부 Singing + RVC 신경망 보컬':result.kind==='engine'?'별도 로컬 엔진 보컬'", p)
    anchor = "  const number=safePort(port);\n  let checkpoint=externalModels.find(m=>m.id===externalModelId)||null;"
    replacement = '''  const number=safePort(port);
  let rvcConfig=null;
  if(autoRvc){
   if(!autoRvcRights)throw Error('자동 RVC 변환에 사용할 목소리·모델 권한을 확인하세요.');
   if(capability?.mode!=='neural'||capability.inferenceReady!==true)throw Error('자동 RVC 연결은 준비된 실제 신경망 Singing 엔진에서만 사용할 수 있습니다. 먼저 엔진·모델을 조회하세요.');
   rvcConfig=readRVCPreferences(window.localStorage);
   if(!rvcConfig)throw Error('RVC 변환 패널에서 로컬 모델·Python 경로를 저장하세요.');
  }
  let checkpoint=externalModels.find(m=>m.id===externalModelId)||null;'''
    s = replace_once(s, anchor, replacement, p)
    anchor = "  changeResult(blob,'engine',alignment.cues.length);"
    replacement = '''  if(autoRvc){
   setStatus('실제 Singing WAV 수신 · 로컬 RVC 신경망 음색 변환 실행 중');
   const original=new File([blob],outputName(p.title,'singing-source'),{type:'audio/wav'});
   const converted=await convertLongSingingWithRVC(original,{...rvcConfig,rightsConfirmed:true},{session:window.__MYVOCAL_SESSION_KEY,signal:controller.signal,onProgress:(done,total)=>setStatus(`실제 Singing 완료 · RVC 음색 변환 ${done}/${total} 구간`)});
   if(controller.signal.aborted)throw Error('가창·RVC 연속 생성을 취소했습니다.');
   setSourceVocal({file:original,projectId:p.id});
   changeResult(converted,'rvc-neural',alignment.cues.length,'singing-rvc');
  }else{
   setSourceVocal(null);
   changeResult(blob,'engine',alignment.cues.length);
  }'''
    s = replace_once(s, anchor, replacement, p)
    anchor = "mode:capability?.mode==='demo'?'외부 데모':'외부 엔진',result:longForm?'긴 곡 WAV 합성 수신':'WAV 수신'"
    s = replace_once(s, anchor, "mode:autoRvc?'외부 Singing + RVC':'외부 엔진',result:autoRvc?'Singing/RVC WAV 두 개 수신 (품질 미검증)':longForm?'긴 곡 WAV 합성 수신':'WAV 수신'", p)
    anchor = "  setStatus(capability?.mode==='demo'?'외부 데모 엔진에서 테스트 WAV를 받았습니다. 실제 AI 가창이 아닙니다.'"
    s = replace_once(s, anchor, "  setStatus(autoRvc?'실제 Singing WAV→RVC 음색 변환 WAV를 연속 생성했습니다. 원본 Singing WAV도 따로 내려받을 수 있습니다. 가창 품질·모델 동일성은 별도 확인하세요.':capability?.mode==='demo'?'외부 데모 엔진에서 테스트 WAV를 받았습니다. 실제 AI 가창이 아닙니다.'", p)
    s = replace_once(s, '긴 곡은 음소 힌트를 아직 전송하지 않습니다.', '유효한 발음 타임라인이 있으면 긴 곡의 각 구간에도 음소 힌트를 전달합니다.', p)
    s = replace_once(s, "<RvcVoiceConversion project={p} onChange={onChange} notify={notify} sourceSuggestion={result?.file||null}/>",
        "<RvcVoiceConversion project={p} onChange={onChange} notify={notify} sourceSuggestion={sourceVocal?.file||result?.file||null}/>", p)
    anchor = '''   <div className="mv7-actions"><Button disabled={busy} onClick={checkEngine}>엔진 · 모델 조회</Button>'''
    replacement = '''   <label className="check-item"><input type="checkbox" checked={autoRvc} disabled={busy} onChange={e=>{setAutoRvc(e.target.checked);setAutoRvcRights(false)}}/>외부 신경망 Singing WAV 생성 후 저장된 RVC 모델로 실제 음색 변환까지 연속 실행</label>
   {autoRvc&&<label className="check-item"><input type="checkbox" checked={autoRvcRights} disabled={busy} onChange={e=>setAutoRvcRights(e.target.checked)}/>목소리·모델·가창 원본에 대한 사용 권한이 있습니다.</label>}
'''+anchor
    s = replace_once(s, anchor, replacement, p)
    anchor = "{capability?.mode==='demo'?'데모 테스트 WAV 생성':'외부 엔진으로 보컬 WAV 생성'}"
    s = replace_once(s, anchor, "{autoRvc?'신경망 Singing → RVC 연속 생성':capability?.mode==='demo'?'데모 테스트 WAV 생성':'외부 엔진으로 보컬 WAV 생성'}", p)
    anchor = "<Button icon=\"plus\" variant=\"primary\" disabled={!result||busy} onClick={addTrack}>프로젝트 오디오 트랙에 추가</Button>"
    s = replace_once(s, anchor, anchor + "{sourceVocal?.projectId===p.id&&<Button icon=\"download\" disabled={busy} onClick={()=>download(sourceVocal.file,sourceVocal.file.name)}>변환 전 Singing 원본 WAV 저장</Button>}", p)
    anchor = "{result.kind==='engine'?'별도 로컬 엔진 결과'"
    s = replace_once(s, anchor, "{result.kind==='rvc-neural'?'외부 Singing + RVC 실제 WAV 결과':result.kind==='engine'?'별도 로컬 엔진 결과'", p)
    return s


def patch_rvc_conversion_panel(s,p):
    s = replace_once(s, "import {convertVoiceWithRVC} from '../lib/rvcVoiceConversion.js';", "import {convertLongSingingWithRVC} from '../lib/rvcLongConversion.js';", p)
    s = replace_once(s, "const result=await convertVoiceWithRVC(source,settings,{session:window.__MYVOCAL_SESSION_KEY,signal:controller.signal});", "const result=await convertLongSingingWithRVC(source,settings,{session:window.__MYVOCAL_SESSION_KEY,signal:controller.signal,onProgress:(done,total)=>setProgress(`RVC 음색 변환 ${done}/${total} 구간`)});", p)
    s = replace_once(s, "const [busy,setBusy]=useState(false),[error,setError]=useState(''),[converted,setConverted]=useState(null),[url,setUrl]=useState('');", "const [busy,setBusy]=useState(false),[error,setError]=useState(''),[converted,setConverted]=useState(null),[url,setUrl]=useState(''),[progress,setProgress]=useState('');", p)
    s = replace_once(s, "setBusy(true);setError('');clearOutput();", "setBusy(true);setError('');setProgress('');clearOutput();", p)
    s = replace_once(s, "  <Status>모델·Python·RVC 코드의 설치가 필요합니다.", "  <Status>{progress&&progress+' · '}모델·Python·RVC 코드의 설치가 필요합니다.", p)
    return s


def patch_final_export(s, p):
    s = replace_once(s, "import {createMidiFile} from './midiFile.js';", "import {createMidiFile} from './midiFile.js';\nimport {makeZip} from './zipStore.js';\nimport {inspectSingingWav} from './singingOutputValidation.js';", p)
    anchor = "export async function wav98(project){const {mixdownWav}=await import('./audioEngine.js');return mixdownWav(project,{sampleRate:44100,bitDepth:16,peakProtection:true});}"
    new = anchor + '''
// Real PCM track stems from the existing local offline mixer, not AI-separated stems.
// Each stem retains the full song length for aligned imports into a DAW.
export async function stemsZip98(project,{mix=null}={}){
 const tracks=project?.tracks;
 if(!Array.isArray(tracks))throw Error('프로젝트 트랙 정보가 없습니다.');
 const available=tracks.filter(t=>t&&((t.midiNotes||[]).length||(t.clips||[]).some(c=>c.assetId)));
 if(!available.length||available.length>16)throw Error('트랙별 WAV 출력은 소리가 있는 트랙 1~16개만 지원합니다.');
 if(new Set(available.map(t=>t.id)).size!==available.length||available.some(t=>!t.id))throw Error('트랙 ID가 중복되거나 누락됐습니다.');
 const render=mix||(await import('./audioEngine.js')).mixdownWav;
 const entries=[],manifest={format:'MYVOCAL_WAV_STEMS',version:2,projectId:String(project.id||''),
  title:String(project.title||''),sampleRate:44100,bitDepth:16,channels:2,tracks:[]};
 let total=0,expectedFrames=null;
 for(let i=0;i<available.length;i++){
  const track=available[i];
  const isolated={...project,tracks:tracks.map(t=>({...t,mute:t.id!==track.id,solo:false}))};
  const blob=await render(isolated,{sampleRate:44100,bitDepth:16,channels:2,normalizePeak:false,peakProtection:false,trimSilence:false});
  if(!(blob instanceof Blob)||blob.size<44)throw Error('트랙 '+(i+1)+'의 실제 WAV 생성에 실패했습니다.');
  if(blob.size>256*1024*1024-total)throw Error('트랙별 WAV ZIP이 256MiB를 초과합니다. 프로젝트를 구간별로 나눠 출력하세요.');
  const data=new Uint8Array(await blob.arrayBuffer());
  const report=inspectSingingWav(data);
  if(!report.valid||report.sampleRate!==44100||report.channels!==2||report.bits!==16||report.encoding!==1)
   throw Error('트랙 '+(i+1)+'의 PCM WAV 구조·형식이 잘못됐습니다: '+(report.reason||'44.1kHz 스테레오 16비트 필요'));
  if(expectedFrames!==null&&report.frames!==expectedFrames)
   throw Error('트랙별 WAV의 길이가 서로 달라 시간축이 어긋납니다.');
  expectedFrames=report.frames;
  total+=data.byteLength;
  if(total>256*1024*1024)throw Error('트랙별 WAV ZIP이 256MiB를 초과합니다. 프로젝트를 구간별로 나눠 출력하세요.');
  const safe=String(track.name||'Track').replace(/[\\\\/:*?"<>|\\x00-\\x1f]/g,'_').replace(/\\.\\.+/g,'_').slice(0,60);
  const name=`stems/${String(i+1).padStart(2,'0')}_${safe}.wav`;
  entries.push({name,data});
  manifest.tracks.push({id:track.id,name:track.name||'Track',file:name,frames:report.frames,durationSec:report.durationSec,peak:report.peak,volume:track.volume??75,originalMute:!!track.mute,originalSolo:!!track.solo});
 }
 entries.unshift({name:'stems/manifest.json',data:new TextEncoder().encode(JSON.stringify(manifest,null,2))});
 return new Blob([makeZip(entries)],{type:'application/zip'});
}
'''
    return replace_once(s, anchor, new, p)


def patch_final_delivery(s, p):
    s = replace_once(s, 'midi98,wav98,captureMp498', 'midi98,wav98,stemsZip98,captureMp498', p)
    anchor = '''<Button disabled={!caps.wav||!!busy} onClick={()=>task('WAV',async()=>downloadBlob(await wav98(project),`${stem}.wav`))}>WAV 믹스</Button>'''
    new = anchor + '''
   <Button disabled={!caps.wav||!!busy} onClick={()=>task('트랙별 WAV Stems',async()=>downloadBlob(await stemsZip98(project),`${stem}-tracks-stems.zip`))}>트랙별 WAV Stems ZIP</Button>'''
    s = replace_once(s, anchor, new, p)
    anchor = 'WAV·MIDI·자막은 해당 원본과 정렬 데이터가 있어야 활성화됩니다.'
    return replace_once(s, anchor, anchor+' 트랙별 WAV는 기존 오프라인 믹서로 트랙마다 렌더링하고 모든 파일 시작 시점을 맞춥니다. AI 악기 분리 모델 실행 기능은 아닙니다.', p)


PATCHERS = {
    'desktop/rvc_training.go': patch_go,
    'MYVOCAL-Studio-source/src/lib/rvcTrainingClient.js': patch_client,
    'MYVOCAL-Studio-source/src/components/RvcTrainingPanel.jsx': patch_panel,
    'MYVOCAL-Studio-source/src/components/SingingWorkbench.jsx': patch_singing,
    'MYVOCAL-Studio-source/src/components/RvcVoiceConversion.jsx': patch_rvc_conversion_panel,
    'MYVOCAL-Studio-source/src/lib/finalExport98.js': patch_final_export,
    'MYVOCAL-Studio-source/src/components/FinalDelivery98.jsx': patch_final_delivery,
}


def plan(checkout):
    root = Path(checkout)
    updates = {}
    for rel, patcher in PATCHERS.items():
        path = root / rel
        old = path.read_text(encoding='utf-8')
        updates[path] = (old, patcher(old, rel))
    worker = root / 'desktop/rvc_official_worker.py'
    if worker.exists():
        raise ValueError('기존 공식 RVC worker가 있어 덮어쓰지 않습니다')
    updates[worker] = ('', (BASE / 'desktop/rvc_official_worker.py').read_text(encoding='utf-8'))
    long_worker = root / 'MYVOCAL-Studio-source/src/lib/rvcLongConversion.js'
    if long_worker.exists(): raise ValueError('기존 RVC 긴 곡 변환 코드를 덮어쓰지 않습니다')
    updates[long_worker] = ('', (BASE / 'MYVOCAL-Studio-source/src/lib/rvcLongConversion.js').read_text(encoding='utf-8'))
    for source, rel in (
        ('tests/rvc-long-conversion.test.mjs', 'MYVOCAL-Studio-source/tests/rvc-long-conversion.test.mjs'),
        ('desktop/rvc_official_integration_test.go', 'desktop/rvc_official_integration_test.go'),
        ('tests/test_rvc_official_worker.py', 'tests/test_rvc_official_worker.py'),
        ('tests/stems-export-98.test.mjs', 'MYVOCAL-Studio-source/tests/stems-export-98.test.mjs'),
    ):
        target = root / rel
        if target.exists():
            raise ValueError(f'기존 테스트 파일을 덮어쓰지 않습니다: {rel}')
        updates[target] = ('', (BASE / source).read_text(encoding='utf-8'))
    return updates



def verify_main_checkout(root):
    if not (root / '.git').exists():
        raise ValueError('적용 대상은 실제 GitHub MYVOCAL main 체크아웃이어야 합니다. ZIP/임의 프로젝트에는 적용하지 않습니다.')
    def git(*args):
        return subprocess.run(['git', *args], cwd=root, check=True, text=True,
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout.strip()
    branch = git('branch', '--show-current')
    if branch != 'main':
        raise ValueError(f'main이 아닌 브랜치({branch})에는 적용하지 않습니다.')
    # A clean index/worktree protects all pre-existing local edits.
    for rel in PATCHERS:
        if git('status', '--porcelain', '--', rel):
            raise ValueError(f'기존 로컬 변경을 덮어쓰지 않습니다: {rel}')
    print('현재 GitHub main 체크아웃:', git('rev-parse', 'HEAD'))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('checkout', help='기존 MYVOCAL main 체크아웃 루트')
    parser.add_argument('--apply', action='store_true', help='앵커 전체 확인 후 기존 소스에 적용')
    parser.add_argument('--diff', default='', help='검토용 통합 diff 출력 경로')
    args = parser.parse_args()
    if args.apply: verify_main_checkout(Path(args.checkout))
    updates = plan(args.checkout)  # All anchors checked before any writes.
    if args.diff:
        root = Path(args.checkout)
        pieces = []
        for path, (old, new) in updates.items():
            rel = path.relative_to(root).as_posix()
            pieces.extend(difflib.unified_diff(old.splitlines(keepends=True), new.splitlines(keepends=True),
                                                fromfile='a/'+rel, tofile='b/'+rel))
        Path(args.diff).write_text(''.join(pieces), encoding='utf-8')
    if args.apply:
        # Stage all replacements in the SAME directories, then replace only
        # checked code files. No project/recording/model/asset files are touched.
        staged = {}
        try:
            for path, (_, new) in updates.items():
                fd, tmp = tempfile.mkstemp(prefix='.myvocal-code-', dir=path.parent)
                with os.fdopen(fd, 'w', encoding='utf-8') as file:
                    file.write(new)
                staged[path] = tmp
            replaced = []
            try:
                for path, tmp in staged.items():
                    original = updates[path][0]
                    if path.exists() and path.read_text(encoding='utf-8') != original:
                        raise ValueError(f'검증 이후 파일이 변경됐습니다: {path}')
                    os.replace(tmp, path)
                    replaced.append(path)
            except Exception:
                for path in reversed(replaced):
                    original = updates[path][0]
                    if original:
                        path.write_text(original, encoding='utf-8')
                    else:
                        path.unlink(missing_ok=True)
                raise
        finally:
            for tmp in staged.values():
                if os.path.exists(tmp):
                    os.unlink(tmp)
        print(f'기존 프로젝트 코드 {len(updates)}개 파일 적용 완료 (GitHub에는 자동 반영되지 않음)')
    else:
        print(f'기존 프로젝트 코드 {len(updates)}개 파일 패치 가능 (dry-run, 원본 변경 없음)')


if __name__ == '__main__':
    main()
