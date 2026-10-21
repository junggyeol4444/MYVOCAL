// Standalone build: use local TypeScript (after npm install) and bundled MIT React UMD assets.
// The application source itself targets React19 + Vite. The single-file version
// is a preview wrapper with a small React hooks compatibility runtime.
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
let ts;
try{ts=require('typescript')}catch{try{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}catch{throw new Error('TypeScript dependency missing: run npm install first')}}
const src=path.join(root,'src');
function collect(d){let files=[];for(const item of fs.readdirSync(d)){const p=path.join(d,item);if(fs.statSync(p).isDirectory())files.push(...collect(p));else if(/\.(js|jsx)$/.test(p))files.push(p);}return files;}
const modules={};let failed=false;
for(const file of collect(src)){
 const id=path.relative(root,file).replace(/\\/g,'/');
 const code=fs.readFileSync(file,'utf8');
 const result=ts.transpileModule(code,{fileName:file,reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,esModuleInterop:false}});
 if(result.diagnostics?.length){failed=true;console.error(id,result.diagnostics.map(x=>ts.flattenDiagnosticMessageText(x.messageText,'\n')))}
 modules[id]=result.outputText;
}
if(failed)process.exit(1);
const react=fs.readFileSync(path.join(root,'third_party/react.umd.min.js'),'utf8');
const reactDom=fs.readFileSync(path.join(root,'third_party/react-dom.umd.min.js'),'utf8');
const jsxRuntime=`
(function(){
 const r=React,realCreate=r.createElement.bind(r);let rendering=null;const functionKeys=new WeakMap();let functionSeq=0;
 class HookHost extends r.Component {
   constructor(props){super(props);this.hooks=[];this.i=0;this.pending=[];}
   render(){let old=rendering;rendering=this;this.i=0;this.pending=[];let result;try{result=this.props.fn(this.props.p)}finally{rendering=old;}return result;}
   componentDidMount(){this.run();}
   componentDidUpdate(){this.run();}
   componentWillUnmount(){for(const h of this.hooks)if(typeof h?.cleanup==='function'){try{h.cleanup()}catch(e){console.error(e)}}}
   run(){for(const e of this.pending){try{e()}catch(err){console.error('MYVOCAL effect',err)}}}
 }
 r.createElement=function(type,props,...children){
  if(typeof type==='function'&&type!==HookHost&&!(type.prototype&&type.prototype.isReactComponent)){
   const p={...props};if(children.length===1)p.children=children[0];else if(children.length>1)p.children=children;
   if(!functionKeys.has(type))functionKeys.set(type,++functionSeq);const instanceKey='fn'+functionKeys.get(type)+':'+(props?.key??'');return realCreate(HookHost,{fn:type,p,key:instanceKey});
  }
  return realCreate(type,props,...children);
 };
 r.useState=function(initial){if(!rendering)throw Error('useState must be called in component');const host=rendering,i=host.i++;if(!(i in host.hooks))host.hooks[i]={value:typeof initial==='function'?initial():initial};const h=host.hooks[i];return [h.value,function(value){const updated=typeof value==='function'?value(h.value):value;if(!Object.is(updated,h.value)){h.value=updated;host.forceUpdate()}}];};
 r.useRef=function(initial){if(!rendering)throw Error('useRef must be called in component');const host=rendering,i=host.i++;if(!(i in host.hooks))host.hooks[i]={value:{current:initial}};return host.hooks[i].value;};
 r.useEffect=function(fn,deps){if(!rendering)throw Error('useEffect must be called in component');const host=rendering,i=host.i++;let h=host.hooks[i],changed=!h||!deps||!h.deps||deps.length!==h.deps.length||deps.some((v,j)=>!Object.is(v,h.deps[j]));if(!h){h={};host.hooks[i]=h;}if(changed){h.deps=deps;host.pending.push(()=>{if(typeof h.cleanup==='function')h.cleanup();h.cleanup=fn()})}};
 r.Fragment=({children})=>children;r.default=r;
 const modules=__MODULES__,cache={};
 function resolve(from,spec){if(spec==='react'||spec==='react-dom/client')return spec;if(spec.endsWith('.css'))return 'style';if(!spec.startsWith('.'))return spec;let base=from.slice(0,from.lastIndexOf('/')+1);const arr=(base+spec).split('/'),parts=[];for(const seg of arr){if(seg==='.'||!seg)continue;if(seg==='..')parts.pop();else parts.push(seg)}const p=parts.join('/');for(const k of [p,p+'.jsx',p+'.js'])if(modules[k])return k;throw Error('Missing module '+spec+' from '+from);}
 function requireModule(id){if(id==='react')return r;if(id==='react-dom/client')return {createRoot:(el)=>({render:(node)=>ReactDOM.render(node,el)})};if(id==='style')return {};if(cache[id])return cache[id].exports;const code=modules[id];if(!code)throw Error('Unknown module '+id);const module={exports:{}};cache[id]=module;const req=spec=>requireModule(resolve(id,spec));new Function('module','exports','require',code)(module,module.exports,req);return module.exports;}
 // A real desktop bootstrap error must be visible, never just a blank black window.
 function bootFailure(error){
  const root=document.getElementById('root');
  const message=String(error&&error.message||error||'원인 미상').slice(0,700);
  console.error('MYVOCAL desktop bootstrap error:',error);
  window.__MYVOCAL_BOOT_ERROR__=message;
  if(root&&!root.hasChildNodes()){
   root.setAttribute('role','alert');
   root.style.cssText='display:block;min-height:100vh;box-sizing:border-box;background:#131722;color:#fff;padding:32px;font-family:sans-serif';
   const heading=document.createElement('h1');heading.textContent='MYVOCAL Studio 화면 시작 오류';
   const detail=document.createElement('pre');detail.style.cssText='white-space:pre-wrap;color:#ffb8b8';
   detail.textContent=message;
   root.append(heading,detail);
  }
 }
 window.addEventListener('error',event=>bootFailure(event.error||event.message));
 window.addEventListener('unhandledrejection',event=>bootFailure(event.reason));
 try{requireModule('src/main.jsx')}catch(error){bootFailure(error)}
})();
`.replace('__MODULES__',JSON.stringify(modules));
const sourceHtml=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(src,'style.css'),'utf8');
let html=sourceHtml.replace(/<link[^>]+href="https:\/\/(?:fonts\.googleapis\.com|fonts\.gstatic\.com)[^>]*>\s*/g,'').replace(/<script type="module" src="\/src\/main.jsx"><\/script>/,`<style>${css}</style><script>${react}\n${reactDom}\n${jsxRuntime}</script>`);
// CSP applies even when the single-file HTML is opened directly from disk.
// The desktop HTTP host additionally sets the same network-restrictive policy.
const offlineCsp="default-src 'none'; connect-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; form-action 'self'; base-uri 'none'; frame-src 'none'; object-src 'none'";
html=html.replace('</head>',`<meta http-equiv="Content-Security-Policy" content="${offlineCsp}" />\n</head>`);
fs.writeFileSync(path.join(root,'MYVOCAL-Studio-v1.8.html'),html);

console.log('Wrote standalone HTML:',html.length,'chars; modules:',Object.keys(modules).length);
