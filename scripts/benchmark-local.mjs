import { benchmark, differential, recordingOracle, fuzz, mutations } from '../src/validation/index.mjs';
import { digest } from '../src/evidence/index.mjs';
const suites=[
  {id:'function',cases:[{id:'empty',input:'',expected:{output:0}},{id:'unicode',input:'😀',expected:{output:2}}],candidate:async input=>({output:input.length})},
  {id:'format',cases:[{id:'object',input:'{"a":1}',expected:{output:{a:1}}},{id:'invalid',input:'{',expected:{error:{name:'SyntaxError'}}}],candidate:async input=>{try{return {output:JSON.parse(input)};}catch(error){return {error:{name:error.name}};}}},
  {id:'stateful',cases:[{id:'flow',input:['open','write','close'],expected:{output:1,state:'closed',effects:['write'],transitions:['closed->open','open->closed']}}],candidate:async input=>{let state='closed';const effects=[],transitions=[];for(const event of input){if(event==='open'&&state==='closed'){state='open';transitions.push('closed->open');}else if(event==='write'&&state==='open')effects.push('write');else if(event==='close'&&state==='open'){state='closed';transitions.push('open->closed');}}return {output:effects.length,state,effects,transitions};}}
];
const environment={node:process.version,platform:process.platform,architecture:process.arch};
const result=await benchmark(suites.map(s=>({id:s.id,run:()=>differential({oracle:recordingOracle({id:s.id,identity:`preserved-${s.id}-v1`,cases:s.cases}),candidate:s.candidate,candidateIdentity:`local-${s.id}`,target:{id:s.id,version:'1',hash:digest(s.cases)},environment,corpus:{id:'public-local-v1'},cases:s.cases})})),{environment,corpus:{id:'public-known-v1',hash:digest(suites.map(s=>s.cases))}});
result.fuzz=await fuzz({seed:42,iterations:100,generate:random=>Math.floor(random()*100),check:value=>Number.isSafeInteger(value)&&JSON.parse(JSON.stringify(value))===value});
const fn=suites[0];
result.mutation=await mutations({mutants:[{id:'wrong-length',candidate:async()=>({output:9})},{id:'equivalent',candidate:fn.candidate},{id:'invalid',invalid:true}],test:candidate=>differential({oracle:recordingOracle({id:'o',identity:'preserved-function',cases:fn.cases}),candidate,candidateIdentity:'mutant',cases:fn.cases})});
result.limitations=['Public fixtures known to implementation author; no model, REA session or blind evaluation invoked.','Software harness smoke coverage only; no performance improvement or broad fidelity claim.'];
console.log(JSON.stringify(result,null,2));
