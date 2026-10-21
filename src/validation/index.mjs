import { performance } from 'node:perf_hooks';
import { canonical, clone, digest, atomicWrite } from '../evidence/index.mjs';

export const STATUSES=Object.freeze(['PASS','FAIL','INCONCLUSIVE','NOT_RUN']);
export function recordingOracle({id,identity,cases,limitations=[]}) {
  const recordings=clone(cases);
  return {id,identity,kind:'recording',independent:true,limitations,
    async evaluate(input,scenario) {
      const row=recordings.find(r=>r.id===scenario.id&&canonical(r.input)===canonical(input));
      if(!row||!Object.hasOwn(row,'expected'))throw new Error('Oracle has no preserved result for this input');
      return clone(row.expected);
    }};
}
export function contractOracle({id,identity,kind='contract',independent,check,limitations=[]}) {
  if(!['specification','invariant','contract','corpus'].includes(kind))throw new Error('Unsupported oracle');
  return {id,identity,kind,independent,limitations,check};
}
export function compare(expected,observed,{exception}={}) {
  if(canonical(expected)===canonical(observed))return {status:'PASS'};
  const difference={expected,observed};
  if(exception?.approved===true&&exception.reason&&Object.hasOwn(exception,'expectedObserved')&&canonical(exception.expectedObserved)===canonical(observed))return {status:'PASS',intentional:true,reason:exception.reason,difference};
  return {status:'FAIL',difference};
}
export async function bounded(operation,{timeoutMs=10000,signal}={}) {
  if(!Number.isFinite(timeoutMs)||timeoutMs<=0)throw new Error('Positive timeout required');
  if(signal?.aborted)throw signal.reason??new Error('Cancelled');
  const controller=new AbortController();let timer,listener;
  const limit=new Promise((_,reject)=>{
    timer=setTimeout(()=>{const error=Object.assign(new Error('Operation deadline exceeded'),{infrastructure:true});controller.abort(error);reject(error);},timeoutMs);
    listener=()=>{const error=signal.reason??new Error('Cancelled');controller.abort(error);reject(error);};
    signal?.addEventListener('abort',listener,{once:true});
  });
  try {return await Promise.race([Promise.resolve().then(()=>operation(controller.signal)),limit]);}
  finally {clearTimeout(timer);signal?.removeEventListener('abort',listener);}
}
export async function differential({oracle,candidate,candidateIdentity,target={},environment={},corpus={},cases=[],timeoutMs=10000,signal}) {
  const started=performance.now();
  const identity={target:clone(target),candidate:{identity:candidateIdentity??'unknown'},oracle:oracle?.identity??null,environment:clone(environment),corpus:{...clone(corpus),hash:digest(cases)}};
  const base={...identity,results:[],limitations:[...(oracle?.limitations??[])]};
  if(!oracle?.independent||!oracle.identity||!candidateIdentity||oracle.identity===candidateIdentity||oracle.evaluate===candidate||oracle.check===candidate||!cases.length||(!oracle.evaluate&&!oracle.check))return {...base,status:'INCONCLUSIVE',reason:'Missing or insufficient independent oracle/corpus',durationMs:performance.now()-started};
  for(const row of cases) {
    if(signal?.aborted)throw signal.reason??new Error('Validation cancelled');
    let expected,observed,result;
    try {
      if(oracle.evaluate)expected=await bounded(s=>oracle.evaluate(clone(row.input),clone(row),s),{timeoutMs,signal});
    }catch(error){if(signal?.aborted)throw error;base.results.push({id:row.id,status:'INCONCLUSIVE',reason:`Oracle unavailable: ${error.message}`});continue;}
    try {
      observed=await bounded(s=>candidate(clone(row.input),clone(row),s),{timeoutMs,signal});
      canonical(observed);
    }catch(error) {
      if(signal?.aborted)throw error;
      if(error.infrastructure){base.results.push({id:row.id,...(row.requirementId?{requirementId:row.requirementId}:{}),status:'INCONCLUSIVE',reason:`Execution unavailable: ${error.message}`});continue;}
      observed={error:{name:error.name,message:error.message}};
    }
    try {
      result=oracle.check ? {status:(await bounded(s=>oracle.check(clone(row.input),clone(observed),clone(row),s),{timeoutMs,signal}))===true?'PASS':'FAIL'} : compare(expected,observed,{exception:row.exception});
    }catch(error){if(signal?.aborted)throw error;result={status:'INCONCLUSIVE',reason:`Oracle error: ${error.message}`};}
    base.results.push({id:row.id,...(row.requirementId?{requirementId:row.requirementId}:{}),critical:row.critical!==false,...result,expected:expected??null,observed});
  }
  const status=base.results.some(r=>r.status==='FAIL')?'FAIL':base.results.every(r=>r.status==='PASS')?'PASS':'INCONCLUSIVE';
  return {...base,status,independent:true,durationMs:performance.now()-started};
}

export async function fuzz({seed=1,iterations=100,generate,check,shrink,shrinkLimit=100,corpusFile,timeoutMs=1000,signal}) {
  if(!Number.isSafeInteger(iterations)||iterations<1||iterations>1000000||!Number.isSafeInteger(shrinkLimit)||shrinkLimit<0||shrinkLimit>10000)throw new Error('Fuzz limits invalid');
  let state=seed>>>0;const random=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);
  const corpus=[],failures=[];
  for(let i=0;i<iterations;i++) {
    if(signal?.aborted)throw new Error('Fuzz cancelled');
    const input=generate(random,i);canonical(input);corpus.push(input);
    const passes=async value=>(await bounded(s=>check(clone(value),s),{timeoutMs,signal}))===true;
    if(!await passes(input)) {
      let minimal=clone(input),steps=0,changed=true;const seen=new Set([canonical(minimal)]);
      while(shrink&&changed&&steps<shrinkLimit) {
        changed=false;
        for(const smaller of shrink(minimal)) {
          if(steps++>=shrinkLimit)break;
          const key=canonical(smaller);if(seen.has(key))continue;seen.add(key);
          if(!await passes(smaller)){minimal=smaller;changed=true;break;}
        }
      }
      failures.push({iteration:i,input,minimal,shrinkSteps:steps});
    }
  }
  const report={seed,iterations,corpus,corpusHash:digest(corpus),failures,status:failures.length?'FAIL':'PASS',limitations:['Contract-specific generator determines valid/invalid input coverage; no external execution.']};
  if(corpusFile)atomicWrite(corpusFile,canonical(report)+'\n',{expectedHash:null});
  return report;
}
export async function mutations({mutants,test,limit=100,timeoutMs=10000}) {
  if(!Number.isInteger(limit)||limit<1||mutants.length>limit)throw new Error('Mutation limit exceeded');
  const results=[];
  for(const mutant of mutants) {
    if(mutant.invalid){results.push({id:mutant.id,status:'INVALID'});continue;}
    try {
      const result=await bounded(()=>test(mutant.candidate),{timeoutMs});
      results.push({id:mutant.id,status:result.status==='FAIL'?'DETECTED':result.status==='PASS'?'SURVIVED':'INVALID'});
    }catch(error){results.push({id:mutant.id,status:'INVALID',reason:error.message});}
  }
  const detected=results.filter(r=>r.status==='DETECTED').length,survived=results.filter(r=>r.status==='SURVIVED').length,invalid=results.length-detected-survived;
  return {results,detected,survived,invalid,score:ratio(detected,detected+survived,'valid mutants only'),limitations:['Directed local sample; small mutation score is not a general reliability estimate.']};
}
export function ratio(numerator,denominator,inclusion,limitations=[]) {return {numerator,denominator,value:denominator?numerator/denominator:null,inclusion,limitations};}
export function metrics({results=[],requirements=[],completions=[],interventions=null,execution={},previous=[]}={}) {
  const verified=results.filter(r=>r.status==='PASS'||r.status==='FAIL');
  const claims=completions.filter(c=>c.claimed&&['PASS','FAIL'].includes(c.independentStatus));
  const rechecked=previous.filter(p=>p.status==='PASS'&&results.some(r=>r.id===p.id&&['PASS','FAIL'].includes(r.status)));
  return {
    functionalParity:ratio(verified.filter(r=>r.status==='PASS').length,verified.length,'applicable scenarios independently verified PASS or FAIL',[`${results.length-verified.length} unverified scenarios excluded`]),
    evidenceCoverage:ratio(requirements.filter(r=>r.evidenceSupported===true).length,requirements.length,'requirements with audited current evidence; mere reference presence is insufficient'),
    validationCoverage:ratio(requirements.filter(r=>r.validated===true).length,requirements.length,'requirements with relevant current independent validation'),
    falseCompletionRate:ratio(claims.filter(c=>c.independentStatus==='FAIL').length,claims.length,'completion claims subsequently independently tested'),
    humanInterventionCount:{count:interventions,inclusion:'recorded necessary interventions only',limitations:interventions===null?['not observed']:[]},
    executionEfficiency:{...clone(execution),inclusion:'observed local duration, operations and resource measurements only'},
    regressionRate:ratio(rechecked.filter(p=>results.some(r=>r.id===p.id&&r.status==='FAIL')).length,rechecked.length,'previous PASS scenarios independently rechecked')
  };
}
export async function benchmark(scenarios,{environment,corpus,timeoutMs=10000}={}) {
  if(!environment||!corpus)throw new Error('Explicit environment and corpus identities required');
  const results=[];
  for(const scenario of scenarios) {
    const start=performance.now();
    try{const result=await bounded(s=>scenario.run(s),{timeoutMs});if(!STATUSES.includes(result.status))throw new Error('Invalid benchmark status');results.push({id:scenario.id,...result,durationMs:performance.now()-start});}
    catch(error){results.push({id:scenario.id,status:'FAIL',reason:error.message,durationMs:performance.now()-start});}
  }
  return {environment,corpus,results,metrics:metrics({results}),agentEvaluation:{status:'NOT_RUN',blind:false,reason:'No agent/model invoked. Public fixtures do not measure generalization.'}};
}

// Evaluation infrastructure may supply an isolated held-out runner. The core
// records a protocol only and never exposes held-out inputs to a candidate host.
export function blindProtocol({targetDigest,corpusDigest,environment,runnerAvailable=false}) {
  return {targetDigest,corpusDigest,environment,status:runnerAvailable?'INCONCLUSIVE':'NOT_RUN',requirements:['independent corpus custodian','unexposed target attestation','isolated authorized runner','signed result provenance'],results:null};
}
