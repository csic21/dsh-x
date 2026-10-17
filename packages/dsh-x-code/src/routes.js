export function createCodeRoute(endpoint,handler,allowed) {
 return {path:`/api/${endpoint}`,methods:['POST'],requestBody:'buffered',async fetch(request){
  if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return new Response(null,{status:415})
  if(Number(request.headers.get('content-length'))>8192)return new Response(null,{status:413})
  let message
  try {const raw=await request.text();if(Buffer.byteLength(raw,'utf8')>8192)return new Response(null,{status:413});message=JSON.parse(raw);if(!message||Object.keys(message).sort().join(',')!=='method,payload,rpcId,type'||message.type!=='client-request'||message.method!==endpoint||typeof message.rpcId!=='string'||message.rpcId.length>128||!message.payload||Object.getPrototypeOf(message.payload)!==Object.prototype||Object.keys(message.payload).some(key=>!allowed.includes(key)))throw Error()}catch{return new Response(null,{status:400})}
  let result;try{result={ok:true,value:await handler({...message.payload,signal:request.signal})}}catch(error){result={ok:false,error:{code:error.code??'CODE_UNAVAILABLE',message:String(error.message??'Code is unavailable.').slice(0,2000),details:{}}}}
  return Response.json({type:'server-response',rpcId:message.rpcId,result})
 }}
}
