/** One registered client RPC endpoint: one buffered JSON request and one JSON response. */
export interface CodeRoute {
  path: string
  methods: string[]
  requestBody: string
  fetch(request: Request): Promise<Response>
}
// A parsed request body is untrusted; this shape only names the fields the validation reads.
interface CodeRpcMessage { type?: unknown, method?: unknown, rpcId?: unknown, payload?: Record<string, unknown> | null }
// A thrown value is untrusted; read a code or message only through these guards.
const codeOf=(error: unknown): unknown=>(error as {code?: unknown}).code
const messageOf=(error: unknown): unknown=>(error as {message?: unknown}).message
export function createCodeRoute<Args extends Record<string, unknown>>(endpoint: string,handler: (args: Args & {signal: AbortSignal}) => unknown,allowed: string[]): CodeRoute {
 return {path:`/api/${endpoint}`,methods:['POST'],requestBody:'buffered',async fetch(request){
  if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return new Response(null,{status:415})
  if(Number(request.headers.get('content-length'))>8192)return new Response(null,{status:413})
  let message!: CodeRpcMessage
  try {const raw=await request.text();if(Buffer.byteLength(raw,'utf8')>8192)return new Response(null,{status:413});message=JSON.parse(raw) as CodeRpcMessage;if(!message||Object.keys(message).sort().join(',')!=='method,payload,rpcId,type'||message.type!=='client-request'||message.method!==endpoint||typeof message.rpcId!=='string'||message.rpcId.length>128||!message.payload||Object.getPrototypeOf(message.payload)!==Object.prototype||Object.keys(message.payload).some(key=>!allowed.includes(key)))throw Error()}catch{return new Response(null,{status:400})}
  let result: {ok: true, value: unknown} | {ok: false, error: {code: unknown, message: string, details: Record<string, never>}}
  // The body was validated against this endpoint's field list; the handler validates every value it uses.
  try{result={ok:true,value:await handler({...(message.payload as Args),signal:request.signal})}}catch(error){result={ok:false,error:{code:codeOf(error)??'CODE_UNAVAILABLE',message:String(messageOf(error)??'Code is unavailable.').slice(0,2000),details:{}}}}
  return Response.json({type:'server-response',rpcId:message.rpcId,result})
 }}
}
