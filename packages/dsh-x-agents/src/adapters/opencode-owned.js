import { randomBytes } from 'node:crypto'
import { mkdtempSync, mkdirSync, rmSync, existsSync, realpathSync } from 'node:fs'
import { dirname, join, isAbsolute } from 'node:path'
import { createOpenCodeAdapter } from './opencode.js'
import { createHttp, abortable, failure } from './opencode-http.js'
import { createBrowserMcp } from './browser-mcp.js'

const VERSION='1.19.3'
const CAPABILITIES=Object.freeze({nativeSessions:true,resume:false,streaming:true,tools:true,plans:true,permissions:true,input:false,usage:true,cancel:true,models:true,authDiscovery:false,ownedBrowser:true,deferredInitialization:true,permissionScopes:['once'],limitations:['Experimental browser-only owned OpenCode service. Fresh empty native home and directory for each operation; no continuation or user credentials. Only zero-price public OpenCode models. Host file-effect confinement applies; this is not network isolation.']})
const FLAGS=['DISABLE_PROJECT_CONFIG','DISABLE_CLAUDE_CODE','DISABLE_EXTERNAL_SKILLS','DISABLE_DEFAULT_PLUGINS','PURE','DISABLE_AUTOUPDATE','DISABLE_LSP_DOWNLOAD','DISABLE_AUTOCOMPACT','DISABLE_PRUNE','EXPERIMENTAL_DISABLE_FILEWATCHER','DISABLE_FFF','DISABLE_EMBEDDED_WEB_UI']
function ensureWorkspace(cwd,policy){
  if(typeof cwd!=='string'||!isAbsolute(cwd)||!policy||!['workspace-write','danger-full-access'].includes(policy.mode)) throw failure('OPENCODE_OWNED_POLICY','Owned OpenCode needs an already writable workspace and managed process confinement; host settings were not changed.')
  let at=realpathSync(cwd)
  while(true){if(existsSync(join(at,'.git'))) throw failure('OPENCODE_OWNED_WORKSPACE','Choose an isolated workspace outside a Git checkout for the browser-only public-model run. Repository context will not be sent.');const parent=dirname(at);if(parent===at)break;at=parent}
}
export function ownedEnvironment(root,content,password){
  const env=Object.fromEntries(Object.keys(process.env).map(key=>[key,undefined]))
  for(const key of ['PATH','SystemRoot','WINDIR','ComSpec'])if(typeof process.env[key]==='string')env[key]=process.env[key]
  Object.assign(env,{HOME:join(root,'home'),USERPROFILE:join(root,'home'),XDG_CONFIG_HOME:join(root,'config'),XDG_DATA_HOME:join(root,'data'),XDG_STATE_HOME:join(root,'state'),XDG_CACHE_HOME:join(root,'cache'),APPDATA:join(root,'config'),LOCALAPPDATA:join(root,'data'),TMPDIR:join(root,'tmp'),TMP:join(root,'tmp'),TEMP:join(root,'tmp'),OPENCODE_CONFIG_DIR:join(root,'config','owned'),OPENCODE_CONFIG_CONTENT:JSON.stringify(content),OPENCODE_SERVER_USERNAME:'dsh-owned',OPENCODE_SERVER_PASSWORD:password,OPENCODE_CLIENT:'dsh-owned-browser'})
  for(const flag of FLAGS)env[`OPENCODE_${flag}`]='true'
  return env
}
export function freeModels(providers){
  if(!Array.isArray(providers?.all)||!Array.isArray(providers.connected)||!providers.connected.includes('opencode'))return[]
  const zero=value=>typeof value==='number'?Number.isFinite(value)&&value===0:value&&typeof value==='object'&&!Array.isArray(value)&&Object.values(value).every(zero)
  const provider=providers.all.find(p=>p.id==='opencode')
  return Object.entries(provider?.models??{}).filter(([id,m])=>/^[A-Za-z0-9][A-Za-z0-9._-]{0,140}$/.test(id)&&m?.cost?.input===0&&m.cost.output===0&&zero(m.cost)&&(m.capabilities?.toolcall===true||m.capabilities?.tool_call===true)).map(([id,m])=>({id:`opencode/${id}`,free:true,label:`${m.name??id} (free: input/output 0)`,providerID:'opencode',modelID:id})).sort((a,b)=>a.id.localeCompare(b.id)).slice(0,2000)
}
export function runtimeConfig(model,mcp){
  const permissions={'*':'deny',...(mcp?{dsh_browser_tabs:'allow',dsh_browser_action:'allow'}:{}),task:'deny'}
  return {username:'dsh-owned',enabled_providers:['opencode'],...(model?{provider:{opencode:{whitelist:[model.slice('opencode/'.length)]}}}:{}),plugin:[],instructions:[],skills:{paths:[],urls:[]},share:'disabled',snapshot:false,autoupdate:false,lsp:false,formatter:false,model,small_model:model,default_agent:'dsh_browser',permission:permissions,agent:{build:{disable:true},plan:{disable:true},general:{disable:true},explore:{disable:true},dsh_browser:{mode:'primary',model,permission:permissions},title:{disable:true,model},summary:{disable:true,model},compaction:{model,permission:{'*':'deny'}}},compaction:{auto:false,prune:false},mcp:mcp?{dsh_browser:{...mcp,enabled:true}}:{}}
}
export function validateEffectiveConfig(actual,expected){
  const ordered=(a,b)=>JSON.stringify(a)===JSON.stringify(b)
  const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value
  const same=(a,b)=>ordered(canonical(a),canonical(b))
  // Pinned v1.19.3 GET /config uses Effect 4.0.0-beta.83's schema encoder:
  // known `task` is emitted before wildcard/custom keys. Runtime parsing keeps
  // original precedence. Admit only the original or that exact wire layout,
  // never sort permission keys or move `*` past either allowed browser tool.
  const permissionWire=value=>Object.hasOwn(value,'task')?{task:value.task,...Object.fromEntries(Object.entries(value).filter(([key])=>key!=='task'))}:value
  const samePermission=(actual,wanted)=>ordered(actual,wanted)||ordered(actual,permissionWire(wanted))
  // Only fixed, known policy paths are reported. Never include config values,
  // unknown property names, environment entries or MCP authorization headers.
  const differences=[]
  const changed=path=>{differences.push(path)}
  const reject=()=>{throw failure('OPENCODE_OWNED_CONFIG',`Native effective configuration differs from the isolated policy. No prompt was sent. Fields: ${[...new Set(differences)].slice(0,24).join(', ')}.`)}
  const allowed=new Set([...Object.keys(expected),'$schema','username','mode','command'])
  if(!actual||typeof actual!=='object'||Array.isArray(actual)){changed('root.shape');reject()}
  if(Object.keys(actual).some(key=>!allowed.has(key)))changed('root.extra-fields')
  for(const key of ['username','enabled_providers','default_agent','model','small_model','snapshot','share','lsp','formatter','autoupdate','skills','compaction'])if(!same(actual[key],expected[key]))changed(`${key}.value`)
  // Permission insertion order is semantic in OpenCode: the last match wins.
  if(!samePermission(actual.permission,expected.permission))changed(`permission.${same(actual.permission,expected.permission)?'order':'value'}`)
  for(const key of ['plugin','instructions'])if(!Array.isArray(actual[key]??[])||(actual[key]??[]).length)changed(`${key}.nonempty-or-shape`)
  for(const key of ['mode','command'])if(Object.keys(actual[key]??{}).length)changed(`${key}.nonempty`)
  if(!same(actual.mcp??{},expected.mcp))changed('mcp.value')
  if(!same(actual.provider??{},expected.provider??{}))changed('provider.value')
  if(!same(Object.keys(actual.agent??{}).sort(),Object.keys(expected.agent).sort()))changed('agent.names')
  for(const [name,wanted] of Object.entries(expected.agent)){
    const path=`agent.${['build','plan','general','explore','dsh_browser','title','summary','compaction'].includes(name)?name:'known-agent'}`
    const found=actual.agent?.[name]
    if(!found){changed(`${path}.missing`);continue}
    if(Object.keys(found).some(key=>!['disable','model','mode','permission','options'].includes(key)))changed(`${path}.extra-fields`)
    if(Object.keys(found.options??{}).length)changed(`${path}.options`)
    for(const key of ['disable','model','mode'])if(found[key]!==wanted[key])changed(`${path}.${key}`)
    if(!samePermission(found.permission??{},wanted.permission??{}))changed(`${path}.permission.${same(found.permission??{},wanted.permission??{})?'order':'value'}`)
  }
  if(differences.length)reject()
}

export async function closeOwnedProcess({child,mcp,browser,timeoutMs}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs)
  let failureDuringRevoke
  try{browser?.close?.()}catch(error){failureDuringRevoke=error}
  try{child?.terminate();try{child?.stdin?.end()}catch{}}catch(error){failureDuringRevoke??=error}
  try{
    await abortable(Promise.all([Promise.resolve().then(()=>mcp?.close()),...(child?[Promise.resolve().then(()=>child.waitForExit(controller.signal)).then(exited=>{if(exited!==true)throw Error('range')}),child.done]:[])]),controller.signal)
    if(failureDuringRevoke)throw failureDuringRevoke
  }catch{throw failure('AGENTS_CLEANUP_UNCONFIRMED','Owned OpenCode process cleanup could not be confirmed; its temporary state was retained.')}finally{clearTimeout(timer)}
}

export function createOwnedOpenCodeAdapter({spawn,fetch=globalThis.fetch,config={}}={}){
  if(typeof spawn!=='function')throw new TypeError('Owned OpenCode requires managed subprocess spawn.')
  if(Object.keys(config).some(k=>!['mode','executable','startupTimeoutMs','cleanupTimeoutMs','requestTimeoutMs','turnTimeoutMs'].includes(k)))throw new TypeError('Owned OpenCode accepts only executable and bounded timeout settings, not credentials or arbitrary config.')
  const executable=config.executable??'opencode'
  if(typeof executable!=='string'||!executable||/[\0\r\n]/.test(executable))throw new TypeError('Choose a trusted OpenCode executable.')
  const timeouts={startupTimeoutMs:30000,cleanupTimeoutMs:15000,requestTimeoutMs:15000,turnTimeoutMs:180000,...config}
  for(const key of ['startupTimeoutMs','cleanupTimeoutMs','requestTimeoutMs','turnTimeoutMs'])if(!Number.isSafeInteger(timeouts[key])||timeouts[key]<1||timeouts[key]>600000)throw new TypeError('Invalid owned OpenCode timeout.')
  const backendIdentity=JSON.stringify({runtime:'opencode',mode:'owned-browser',executable,version:VERSION,ephemeral:true,freeOnly:true})
  async function open({cwd,sandboxPolicy,signal,model,browser,versionOnly=false}){
    ensureWorkspace(cwd,sandboxPolicy);signal?.throwIfAborted()
    const root=mkdtempSync(join(cwd,'.dsh-owned-opencode-'))
    for(const dir of ['home','config','config/owned','data','state','cache','tmp','work'])mkdirSync(join(root,dir),{recursive:true,mode:0o700})
    const work=join(root,'work'),password=randomBytes(32).toString('base64url')
    let child,mcp,active=false,closed=false
    async function close(){
      if(closed)return;closed=true;active=false
      await closeOwnedProcess({child,mcp,browser,timeoutMs:timeouts.cleanupTimeoutMs})
      rmSync(root,{recursive:true,force:true})
    }
    try{
      if(browser)mcp=await createBrowserMcp({invoke:browser.invoke,signal,isActive:()=>active&&!closed})
      const expectedConfig=runtimeConfig(model,mcp?.config)
      const env=ownedEnvironment(root,expectedConfig,password)
      child=await spawn({argv:[executable,...(versionOnly?['--version']:['serve','--hostname','127.0.0.1','--port','0','--mdns=false'])],cwd:work,env,stdio:{stdin:'pipe',stdout:'pipe',stderr:'pipe'},signal,graceMs:3000})
      if(!child?.done||typeof child.waitForExit!=='function'||typeof child.terminate!=='function')throw failure('OPENCODE_OWNED_PROCESS','A managed process range is required.')
      let output='',settle,reject
      const ready=new Promise((yes,no)=>{settle=yes;reject=no})
      const onData=chunk=>{output+=String(chunk);if(output.length>65536){reject(failure('OPENCODE_OWNED_OUTPUT','OpenCode startup output exceeded its bound.'));return}if(!versionOnly){const match=/opencode server listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(output);if(match)settle(match[1])}}
      child.stdout?.on('data',onData);child.stdout?.on('error',reject);child.stderr?.on('data',()=>{});child.stderr?.on('error',reject)
      const timer=setTimeout(()=>reject(failure('OPENCODE_OWNED_STARTUP','Owned OpenCode did not become ready before its startup deadline.')),timeouts.startupTimeoutMs)
      child.done.then(async outcome=>{if(versionOnly){if(child.stdout&&!child.stdout.readableEnded)await new Promise((resolve,reject)=>{child.stdout.once('end',resolve);child.stdout.once('error',reject)});const version=output.trim();outcome.exitCode===0&&version===VERSION?settle(version):reject(failure('OPENCODE_OWNED_VERSION',`Use the inspected official OpenCode ${VERSION} binary.`))}else reject(failure('OPENCODE_OWNED_EXIT','Owned OpenCode exited before completing the operation.'))},reject).catch(reject)
      let endpoint
      try{endpoint=await abortable(ready,signal)}finally{clearTimeout(timer);child.stdout?.off('data',onData);child.stdout?.on('data',()=>{})}
      if(versionOnly)return {version:VERSION,close}
      const http=createHttp({fetch,config:{password,username:'dsh-owned',requestTimeoutMs:timeouts.requestTimeoutMs},endpoint})
      const health=await http('/global/health',{signal})
      if(health?.healthy!==true||health.version!==VERSION)throw failure('OPENCODE_OWNED_VERSION','Owned OpenCode reported an unexpected server version.')
      validateEffectiveConfig(await http('/config',{cwd:work,signal}),expectedConfig)
      const models=freeModels(await http('/provider',{cwd:work,signal}))
      if(!models.length)throw failure('OPENCODE_NO_FREE_MODEL','The fresh native catalog has no zero-price public OpenCode model. No login or paid request was attempted.')
      const adapter=createOpenCodeAdapter({fetch,managedScope:{cwd:work,signal},config:{endpoint,password,username:'dsh-owned',agent:'dsh_browser',requestTimeoutMs:timeouts.requestTimeoutMs,cleanupTimeoutMs:timeouts.cleanupTimeoutMs,turnTimeoutMs:timeouts.turnTimeoutMs}})
      return {close,models,adapter,work,setActive(value){active=value}}
    }catch(error){await close();throw error}
  }
  async function discover(options={}){let native;try{native=await open({...options,versionOnly:true});return {available:true,version:VERSION,authenticated:null,models:[],capabilities:CAPABILITIES,authentication:{state:'requires-native-initialization',source:'version-only'},reason:'Owned browser-only OpenCode is installed. Prepare its public free-model catalog explicitly; no user account is used.'}}catch(error){if(error.code==='AGENTS_CLEANUP_UNCONFIRMED')throw error;return {available:false,version:null,authenticated:null,models:[],capabilities:CAPABILITIES,reason:error.message}}finally{await native?.close()}}
  async function discoverModels(options={}){let native;try{native=await open(options);return {available:true,version:VERSION,authenticated:null,models:native.models,capabilities:CAPABILITIES,authentication:{state:'public-unverified',source:'owned-public-catalog'},providerAuthentication:'Public free route; provider access unverified until the requested run',modelCatalog:{source:'owned-free-catalog'}}}finally{await native?.close()}}
  async function run(options={}){
    let native
    if(options.nativeSessionId)return {nativeSessionId:options.nativeSessionId,status:'blocked',summary:'',reason:'Owned browser-only runs use fresh native state. Start a new task; continuation is unavailable.'}
    if(typeof options.model!=='string'||!options.model.startsWith('opencode/'))return {nativeSessionId:null,status:'blocked',summary:'',reason:'Prepare and explicitly select a public zero-price OpenCode model first.'}
    try{
      native=await open(options)
      if(!native.models.some(m=>m.id===options.model))throw failure('OPENCODE_FREE_MODEL_CHANGED','The selected model is no longer advertised at zero input/output price. No prompt was sent.')
      return await native.adapter.run({...options,cwd:native.work,sandboxPolicy:options.sandboxPolicy,trustedExternalRuntime:false,requestPermission:async()=>({optionId:null}),requestInput:undefined,onEvent:async event=>{if(event.type==='status'&&event.data?.status==='running'){native.setActive(true);event={...event,text:'Owned isolated OpenCode: public free model, native file/command tools disabled.',data:{...event.data,sandbox:options.sandboxPolicy.mode!=='danger-full-access',owned:true}}}await options.onEvent?.(event)}})
    }finally{await native?.close()}
  }
  return {id:'opencode',transport:'owned-http-sse',backendIdentity,capabilities:CAPABILITIES,discover,discoverModels,run}
}
