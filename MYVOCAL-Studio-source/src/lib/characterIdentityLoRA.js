// Original #48/#49/#52: bind a user-owned trained local SD LoRA to the SAME
// person's or character's MV img2img request. Never reuse another person's
// trained weights. Omitted/disabled profile means the legacy graph is unchanged.
const jobPattern=/^[a-f0-9]{24}$/;
const allowed=new Set(['self','owned','licensed']);
export function activeIdentityLoRA(character){
 const t=character?.identityTraining;
 if(!character?.id||!['character','person'].includes(character.kind)||
  character.identityLock===false||!allowed.has(character.rights)||
  (character.kind==='person'&&character.rights==='owned')||
  (character.rights==='licensed'&&!String(character.rightsNote||'').trim())||
  t?.engine!=='sd-scripts-local-lora'||
  t.kind!==character.kind||!jobPattern.test(t.jobId||'')||
  t.status!=='trained-checkpoint-produced-in-unverified-environment'||
  t.comfyLoraName!=='MYVOCAL_Identity_'+t.jobId+'.safetensors')
  return null;
 return {loraName:t.comfyLoraName,loraStrength:0.8,trigger:'mv'+t.jobId,
  jobId:t.jobId,characterId:character.id};
}
export function attachIdentityLoRA(settings,character){
 const linked=activeIdentityLoRA(character);
 if(!linked)return {...settings};
 if(typeof settings?.prompt!=='string'||settings.prompt.length<5)
  throw Error('캐릭터 LoRA 이미지 생성에는 실제 장면 프롬프트가 필요합니다.');
 const prefix=linked.trigger+', same registered subject, ';
 return {...settings,loraName:linked.loraName,
  loraStrength:linked.loraStrength,
  prompt:(prefix+settings.prompt).slice(0,3000)};
}
