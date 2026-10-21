import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
if(!process.argv.includes('--execute'))throw Error('Explicit --execute required; runs historical candidate inside Docker, never an AI agent');
const rootArg=process.argv.indexOf('--root');
if(rootArg<0||!process.argv[rootArg+1])throw Error('Explicit --root output directory required');
const output=path.resolve(process.argv[rootArg+1]);if(fs.existsSync(output))throw Error('Output directory already exists');
const fixture=path.dirname(fileURLToPath(import.meta.url));
const {Runtime}=await import('../../src/runtime/index.mjs');
const {differential,recordingOracle}=await import('../../src/validation/index.mjs');
const {digest}=await import('../../src/evidence/index.mjs');
const meta={referenceRoot:fixture,candidate:fixture};
const cases=JSON.parse(fs.readFileSync(path.join(meta.referenceRoot,'corpus.json')));
const frozen=JSON.parse(fs.readFileSync(path.join(meta.referenceRoot,'frozen-candidate.json')));
const file=path.join(meta.candidate,'candidate.mjs');
if(digest(fs.readFileSync(file))!==frozen.sha256)throw Error('Frozen candidate changed');
const identity=JSON.parse(fs.readFileSync(path.join(meta.referenceRoot,'identity.json')));
const target={id:'blind-record-normalizer-20261021',version:'1',hash:identity.referenceHash};
let measured;
const runtime=new Runtime({root:path.join(output,'runtime-state'),target,scope:['normalizer'],limits:{stageMs:30000,totalMs:90000,maxIterations:12,maxOperations:20,maxAttempts:3},handlers:{
 investigate:async()=>({target,evidenceIds:['preserved-heldout-corpus']}),
 specify:async()=>({requirements:[{id:'normalizer-parity',acceptance:['Reproduce all 64 independent hidden observations']}],tasks:[{id:'sealed-candidate',scope:['normalizer'],dependsOn:[]}]}),
 implement:async()=>({hash:frozen.sha256,authorizedAgentAlreadyExecuted:true}),
 validate:async()=>{
  const name='companion-blind-runtime-'+process.pid;
  try {
   const args=['run','-i','--rm','--init','--pull','never','--name',name,'--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','32','--memory','128m','--cpus','1','--user',`${process.getuid()}:${process.getgid()}`,'--tmpfs','/tmp:rw,noexec,nosuid,size=16m','--mount',`type=bind,src=${file},dst=/candidate.mjs,readonly`,'node@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0','node','/candidate.mjs'];
   const actual=spawnSync('docker',args,{input:cases.map(c=>JSON.stringify(c.input)).join('\n')+'\n',encoding:'utf8',timeout:25000,maxBuffer:1024*1024});
   if(actual.status!==0)throw Error('Isolated execution failed: '+actual.status);
   const observations=actual.stdout.trim().split('\n').map(JSON.parse);
   if(observations.length!==cases.length)throw Error('Observation count mismatch');
   let cursor=0;
   measured=await differential({oracle:recordingOracle({id:'private-preserved-corpus',identity:'independent-python-reference',cases}),candidate:async()=>({output:observations[cursor++]}),candidateIdentity:frozen.sha256,target,environment:{platform:'linux',architecture:process.arch,node:process.version,container:'node@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0',network:'none',readOnly:true},corpus:{id:'heldout64',hash:identity.corpusHash},cases});
   measured.fullSuite=true;return measured;
  }finally{spawnSync('docker',['rm','-f',name],{stdio:'ignore'});}
 },
 diagnose:async()=>({category:'implementation',route:'BLOCKED',hypothesis:'Frozen candidate misses SIZE boundary. Do not feed hidden cases back into the blinded reconstruction.'})
}});
const state=await runtime.run({execute:true});
const report={protocol:'historical-heldout-replay-v1',target,candidateHash:frozen.sha256,oracleQueries:frozen.oracleQueries,corpusHash:identity.corpusHash,total:measured.results.length,passed:measured.results.filter(r=>r.status==='PASS').length,status:measured.status,runtimeState:state.state,falseCompletionClaims:0,validation:measured,checkpoint:state,limitations:['Historical exposed corpus replay; NOT a new blind evaluation. Original N=1 target provides no generalization estimate.','Agent development used shared-host protocol separation, not adversarial OS isolation.','Candidate frozen before hidden evaluation. No repair after hidden feedback.','Candidate evaluation used an offline, non-root, read-only resource-limited Docker container.']};
fs.writeFileSync(path.join(output,'runtime-evaluation.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({status:report.status,passed:report.passed,total:report.total,runtimeState:report.runtimeState,oracleQueries:report.oracleQueries}));

process.exitCode=report.status==='FAIL'?1:report.status==='PASS'?0:2;
