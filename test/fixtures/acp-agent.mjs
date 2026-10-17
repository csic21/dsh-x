import readline from 'node:readline'
const send = value => process.stdout.write(JSON.stringify({jsonrpc:'2.0',...value})+'\n')
for await (const line of readline.createInterface({input:process.stdin})) {
 const m=JSON.parse(line)
 if(m.method==='initialize') send({id:m.id,result:{protocolVersion:1,authMethods:[]}})
 else if(m.method==='session/new') send({id:m.id,result:{sessionId:'fixture'}})
 else if(m.method==='session/set_mode') send({id:m.id,result:{}})
 else if(m.method==='session/prompt') {
   send({method:'session/update',params:{sessionId:'fixture',update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'Fixture plan\n\n```dsh-x-acceptance\nnode --version\n```'}}}})
   send({id:m.id,result:{stopReason:'end_turn'}})
 }
}
