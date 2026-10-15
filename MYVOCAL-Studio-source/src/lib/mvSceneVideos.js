// Step78 — one locally rendered moving clip per storyboard scene.
// SVD clips are short (14/25 frames), not yet synchronized to scene duration or audio.
export const MAX_SCENE_VIDEO_BYTES=40*1024*1024;
export const MAX_SOURCE_FRAME_BYTES=12*1024*1024;
export function videoSourceKey(project,scene,sceneImageRequest){
 if(!project?.id||!scene?.id||!scene.imageAssetId||!sceneImageRequest?.key)throw Error('Step77 시작 이미지가 연결된 장면이 필요합니다.');
 return JSON.stringify([project.id,scene.id,scene.imageAssetId,sceneImageRequest.key,scene.start,scene.end]);
}
export function applySceneVideo(project,sceneId,assetId,sourceKey,details={}){
 if(!project||!Array.isArray(project.scenes)||!project.scenes.some(x=>x.id===sceneId))throw Error('생성하려던 장면이 삭제됐습니다.');
 if(!/^vid_[A-Za-z0-9_-]{1,80}$/.test(assetId))throw Error('영상 파일 ID 오류');
 if(typeof sourceKey!=='string'||!sourceKey||sourceKey.length>12000)throw Error('영상 출처를 확인할 수 없습니다.');
 if(!['image/webp','video/mp4'].includes(details.mime)||![14,25].includes(details.frames)||![6,8].includes(details.fps))throw Error('영상 메타데이터 오류');
 return {...project,scenes:project.scenes.map(s=>s.id===sceneId?{...s,videoClipAssetId:assetId,videoGeneration:{source:'ComfyUI SVD local',sourceKey,checkpoint:String(details.checkpoint||'').slice(0,220),frames:details.frames,fps:details.fps,seed:details.seed,mime:details.mime,createdAt:new Date().toISOString()}}:s)};
}
export function isSceneVideoStale(scene,sourceKey){return !!scene?.videoClipAssetId&&scene?.videoGeneration?.sourceKey!==sourceKey;}
export async function checkLocalVideoEngine(port,session,signal){
 const res=await fetch(`/api/video/health?port=${Number(port)}`,{headers:{'X-MYVOCAL-Session':session},signal,cache:'no-store'});
 const data=await res.json();if(!res.ok)throw Error(data.error||'로컬 영상 엔진 연결 실패');return data;
}
export async function generateLocalVideoClip(settings,session,signal){
 const res=await fetch('/api/video/generate',{method:'POST',headers:{'Content-Type':'application/json','X-MYVOCAL-Session':session},body:JSON.stringify(settings),signal,cache:'no-store'});
 if(!res.ok){let reason='로컬 영상 생성 실패';try{reason=(await res.json()).error||reason;}catch{}throw Error(reason);}
 const blob=await res.blob();if(blob.size<32||blob.size>MAX_SCENE_VIDEO_BYTES||!['image/webp','video/mp4'].includes(blob.type))throw Error('생성 영상 형식 또는 용량 오류');return blob;
}
export function readSourceFrame(file){
 if(!(file instanceof Blob)||file.size<32||file.size>MAX_SOURCE_FRAME_BYTES||!['image/png','image/jpeg'].includes(file.type))return Promise.reject(Error('입력 이미지는 12MB 이하 PNG/JPEG여야 합니다.'));
 return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('시작 이미지 읽기 실패'));reader.readAsDataURL(file);});
}
