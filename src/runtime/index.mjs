import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { atomicWrite, canonical, clone, digest, noSymlinks, VERSION } from '../evidence/index.mjs';
import { bounded, metrics } from '../validation/index.mjs';

export const STATES=Object.freeze(['INVESTIGATE','SPECIFY','IMPLEMENT','VALIDATE','DIAGNOSE','REPAIR','REVALIDATE','COMPLETE','BLOCKED','CANCELLED']);
const defaults={maxIterations:50,stageMs:30000,totalMs:300000,maxOperations:100,maxAttempts:3};
const transitions={INVESTIGATE:['SPECIFY'],SPECIFY:['IMPLEMENT'],IMPLEMENT:['VALIDATE'],VALIDATE:['COMPLETE','DIAGNOSE','REVALIDATE'],DIAGNOSE:['INVESTIGATE','SPECIFY','REPAIR'],REPAIR:['REVALIDATE'],REVALIDATE:['COMPLETE','DIAGNOSE'],COMPLETE:['REVALIDATE'],BLOCKED:['REVALIDATE']};
export function planTasks(tasks,scope) {
  for(const task of tasks)if(typeof task?.id!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(task.id)||!Array.isArray(task.dependsOn)||!Array.isArray(task.scope)||task.dependsOn.some(x=>typeof x!=='string')||task.scope.some(x=>typeof x!=='string'))throw new Error('Invalid task contract');
  const index=new Map(tasks.map(t=>[t.id,t]));if(index.size!==tasks.length)throw new Error('Duplicate task ID');
  const ordered=[],active=new Set(),done=new Set();
  function visit(id) {
    if(active.has(id))throw new Error('Task dependency cycle');if(done.has(id))return;
    const t=index.get(id);if(!t)throw new Error(`Missing dependency ${id}`);
    if(!Array.isArray(t.scope)||t.scope.some(s=>!scope.includes(s)))throw new Error(`Unauthorized task scope ${id}`);
    active.add(id);for(const dependency of t.dependsOn??[])visit(dependency);active.delete(id);done.add(id);ordered.push(clone(t));
  }
  for(const task of tasks)visit(task.id);return ordered;
}
const scrub=value=>String(value).replace(/((?:token|secret|password|authorization|api[_-]?key)\s*[=:]\s*)\S+/gi,'$1[REDACTED]').slice(0,2000);
export class Runtime {
  constructor(options) {
    this.options=options;this.root=path.resolve(options.root);noSymlinks(this.root);
    this.file=path.join(this.root,'workflow.json');this.handlers=options.handlers??{};
    this.limits={...defaults,...options.limits};
    for(const [key,value] of Object.entries(this.limits))if(!(key in defaults)||!Number.isSafeInteger(value)||value<=0)throw new Error('Invalid runtime limit');
    this.limits.maxAttempts=Math.min(this.limits.maxAttempts,3);
    if(typeof options.target?.id!=='string'||!options.target.id||typeof options.target.version!=='string'||!options.target.version||!/^[a-f0-9]{64}$/.test(options.target.hash??''))throw new Error('Target identity required');
    if(!Array.isArray(options.scope??[])||(options.scope??[]).some(x=>typeof x!=='string'))throw new Error('Scope must contain resource names');
    this.revision=null;
    this.data={schemaVersion:VERSION,planHash:options.planHash??null,target:clone(options.target),scope:clone(options.scope??[]),state:'INVESTIGATE',completed:[],pending:[],decisions:[],blockers:[],evidenceIds:[],validations:[],transitions:[],tasks:[],requirements:[],taskResults:{},operations:0,iterations:0,attempts:0,spentMs:0,stageDurations:[],necessaryInterventions:0};
    if(fs.existsSync(this.file))this.load();
  }
  load() {
    noSymlinks(this.file);if(fs.statSync(this.file).size>16*1024*1024)throw new Error('Checkpoint size exceeded');
    const bytes=fs.readFileSync(this.file),{document,integrity}=JSON.parse(bytes);
    if(digest(document)!==integrity||document.schemaVersion!==VERSION||!STATES.includes(document.state))throw new Error('Checkpoint integrity/schema mismatch');
    if(canonical(document.target)!==canonical(this.options.target)||canonical(document.scope)!==canonical(this.options.scope??[]))throw new Error('Checkpoint target/scope mismatch');
    if(document.planHash!==(this.options.planHash??null))throw new Error('Workflow configuration changed; use a new run directory');
    for(const key of ['completed','pending','decisions','blockers','evidenceIds','validations','transitions','tasks','requirements','stageDurations'])if(!Array.isArray(document[key]))throw new Error(`Invalid checkpoint ${key}`);
    for(const key of ['operations','iterations','attempts','spentMs'])if(!Number.isFinite(document[key])||document[key]<0)throw new Error(`Invalid checkpoint ${key}`);
    if(!document.taskResults||typeof document.taskResults!=='object'||Array.isArray(document.taskResults))throw new Error('Invalid checkpoint task results');
    this.data=document;
    if(document.state==='COMPLETE'&&!this.validationPassed(document.validations.at(-1)))throw new Error('Checkpoint completion gate invalid');
    this.revision=digest(bytes);
  }
  status(){return clone(this.data);}
  save(){const bytes=canonical({document:this.data,integrity:digest(this.data)})+'\n';atomicWrite(this.file,bytes,{expectedHash:this.revision});this.revision=digest(bytes);this.options.onCheckpoint?.(this.status());}
  transition(next,reason) {
    if(!STATES.includes(next))throw new Error('Unknown workflow state');
    const current=this.data.state;
    if(current==='CANCELLED' ? next!==this.data.resumeState : !['BLOCKED','CANCELLED'].includes(next)&&!transitions[current]?.includes(next))throw new Error(`Illegal workflow transition ${current} -> ${next}`);
    if(next==='COMPLETE'&&!this.validationPassed(this.data.validations.at(-1)))throw new Error('Independent completion gate not satisfied');
    this.data.transitions.push({from:this.data.state,to:next,reason:scrub(reason),operation:this.data.operations,timestamp:new Date().toISOString()});this.data.state=next;this.save();
  }
  validationPassed(result) {
    if(!result||result.independent!==true||!result.oracle||!result.candidate?.identity||result.oracle===result.candidate.identity||!result.results?.length||result.status!=='PASS'||result.results.some(r=>r.status!=='PASS')||this.data.pending.length)return false;
    if(canonical(result.target??{})!==canonical(this.data.target)||!result.corpus?.hash)return false;
    return this.data.requirements.length>0&&this.data.requirements.every(r=>result.results.some(v=>v.requirementId===r.id&&v.status==='PASS'));
  }
  report(){return {checkpoint:this.status(),metrics:metrics({results:this.data.validations.at(-1)?.results??[],requirements:this.data.requirements.map(r=>({...r,validated:this.data.validations.at(-1)?.results?.some(v=>v.requirementId===r.id&&v.status==='PASS')??false})),interventions:this.data.necessaryInterventions,execution:{durationMs:this.data.spentMs,operations:this.data.operations,retries:this.data.attempts,stageDurations:this.data.stageDurations}})};}
  consumeOperation() {
    if(this.data.operations>=this.limits.maxOperations)throw Object.assign(new Error('Operation budget exceeded'),{infrastructure:true});
    this.data.operations++;this.save();
  }
  async invoke(name,context,signal) {
    if(typeof this.handlers[name]!=='function')throw new Error(`Tool unavailable: ${name}`);
    if(this.data.spentMs>=this.limits.totalMs)throw new Error('Total execution budget exceeded');
    this.consumeOperation();const start=performance.now(),remaining=this.deadline?this.deadline-start:this.limits.totalMs-this.data.spentMs;
    if(remaining<=0)throw new Error('Total execution budget exceeded');
    try{
      const result=await bounded(s=>this.handlers[name](clone(context),{signal:s,scope:clone(this.data.scope),consumeOperation:()=>this.consumeOperation()}),{timeoutMs:Math.min(this.limits.stageMs,remaining),signal});
      if(!result||typeof result!=='object'||Array.isArray(result))throw new Error(`Invalid ${name} tool result: JSON object required`);
      if(name==='investigate')for(const key of ['evidenceIds','tools'])if(result[key]!==undefined&&(!Array.isArray(result[key])||result[key].some(x=>typeof x!=='string')))throw new Error(`Invalid investigate ${key}`);
      if(name==='specify'&&(!Array.isArray(result.requirements)||result.requirements.some(r=>!r||typeof r.id!=='string'||!Array.isArray(r.acceptance)||!r.acceptance.length||r.acceptance.some(x=>typeof x!=='string'))))throw new Error('Invalid verifiable requirement contract');
      if(name==='specify')planTasks(result.requirements.map(r=>({id:r.id,dependsOn:r.dependencies??[],scope:[]})),[]);
      if(name==='validate'&&(!['PASS','FAIL','INCONCLUSIVE','NOT_RUN'].includes(result.status)||!Array.isArray(result.results)||result.results.some(r=>!r||typeof r.id!=='string'||!['PASS','FAIL','INCONCLUSIVE','NOT_RUN'].includes(r.status))))throw new Error('Invalid independent validation report');
      return clone(result);
    }
    finally{const durationMs=performance.now()-start;this.data.spentMs+=durationMs;this.data.stageDurations.push({stage:name,durationMs});this.save();}
  }
  async resume(options={}) {
    if(!options.execute)throw new Error('Explicit execute mode required');
    if(this.data.state==='COMPLETE')return this.status();
    if(this.data.state==='BLOCKED')throw new Error('Blocked strategy requires a revised plan in a new run; preserve this evidence');
    return this.run({...options,...(this.data.state==='CANCELLED'?{startState:this.data.resumeState??'INVESTIGATE'}:{})});
  }
  async validate({execute=false,signal}={}) {
    if(!execute)throw new Error('Explicit execute mode required');
    if(!this.data.requirements.length||this.data.pending.length)throw new Error('Complete implementation before independent validation');
    const previous=this.data.validations.length;
    await this.run({execute,signal,until:'REVALIDATE',startState:'REVALIDATE'});
    return {...(this.data.validations.length>previous?this.data.validations.at(-1):{status:'INCONCLUSIVE',reason:'Independent validation did not finish',results:[]}),state:this.data.state};
  }
  async run({execute=false,signal,until,startState}={}) {
    if(!execute)throw new Error('Explicit execute mode required');
    if(['BLOCKED','COMPLETE'].includes(this.data.state)&&!startState)return this.status();
    if(this.data.state==='CANCELLED'&&!startState)throw new Error('Use resume after cancellation');
    noSymlinks(this.root);fs.mkdirSync(this.root,{recursive:true,mode:0o700});
    const lock=path.join(this.root,'run.lock');let fd;
    try{fd=fs.openSync(lock,'wx',0o600);}catch{throw new Error('Workflow execution locked; another run or interrupted process must be diagnosed');}
    fs.writeSync(fd,canonical({pid:process.pid,target:this.data.target}));
    const runStarted=performance.now(),previousSpent=this.data.spentMs;this.deadline=runStarted+this.limits.totalMs-previousSpent;
    try {
      if(startState)this.transition(startState,'Explicit resume or independent revalidation');
      this.save();
      while(!['COMPLETE','BLOCKED','CANCELLED'].includes(this.data.state)) {
        if(signal?.aborted){this.data.resumeState=this.data.state;this.transition('CANCELLED','Cancellation requested');break;}
        if(performance.now()>=this.deadline)throw new Error('Total execution budget exceeded');
        if(this.data.iterations++>=this.limits.maxIterations)throw new Error('Iteration budget exceeded');
        const state=this.data.state;let result;
        if(state==='INVESTIGATE') {
          result=await this.invoke('investigate',{target:this.data.target,evidenceIds:this.data.evidenceIds},signal);
          if(canonical(result.target)!==canonical(this.data.target))throw new Error('Investigation changed target identity');
          this.data.evidenceIds=result.evidenceIds??[];this.data.investigation=result;this.data.completed.push('INVESTIGATE');this.transition('SPECIFY','Evidence investigation checkpointed');
        }else if(state==='SPECIFY') {
          result=await this.invoke('specify',this.status(),signal);
          this.data.tasks=planTasks(result.tasks??[],this.data.scope);this.data.requirements=result.requirements??[];
          if(!this.data.requirements.length)throw new Error('No verifiable requirements');
          this.data.pending=this.data.tasks.map(t=>t.id);this.transition('IMPLEMENT','Requirement contracts and task DAG accepted');
        }else if(state==='IMPLEMENT') {
          for(const task of this.data.tasks) {
            if(this.data.taskResults[task.id])continue;
            if(signal?.aborted)break;
            result=await this.invoke('implement',{task,target:this.data.target},signal);
            this.data.taskResults[task.id]=result;this.data.pending=this.data.pending.filter(id=>id!==task.id);this.data.completed.push(task.id);this.save();
          }
          if(!signal?.aborted)this.transition('VALIDATE','Authorized task DAG executed');
        }else if(state==='VALIDATE'||state==='REVALIDATE') {
          result=await this.invoke('validate',{...this.status(),full:true},signal);
          this.data.validations.push(result);
          const verified=result.independent===true&&result.oracle&&result.candidate?.identity&&result.oracle!==result.candidate.identity&&result.results?.length;
          const allPass=verified&&result.status==='PASS'&&result.results.every(r=>r.status==='PASS');
          const covered=this.data.requirements.every(r=>result.results?.some(v=>v.requirementId===r.id&&v.status==='PASS'));
          if(allPass&&covered&&this.validationPassed(result))this.transition('COMPLETE','Full independent validation passed all required contracts');
          else {
            this.data.failure={status:result.status??'INCONCLUSIVE',results:(result.results??[]).filter(r=>r.status!=='PASS').map(r=>({id:r.id,status:r.status,observed:r.observed??null})),covered:!!covered,verified:!!verified};
            const fingerprint=digest(this.data.failure);
            this.data.attempts=this.data.failureFingerprint===fingerprint?this.data.attempts+1:1;this.data.failureFingerprint=fingerprint;
            if(this.data.attempts>=this.limits.maxAttempts){this.data.blockers.push(`No progress after ${this.data.attempts} equivalent failures. Problematic hypothesis: ${this.data.diagnosis?.hypothesis??'validation sufficiency'}`);this.transition('BLOCKED','Equivalent strategy exhausted');}
            else this.transition('DIAGNOSE','Independent validation failed or remained inconclusive');
          }
        }else if(state==='DIAGNOSE') {
          result=await this.invoke('diagnose',{failure:this.data.failure,previous:this.data.diagnosis??null},signal);
          if(!['investigation','specification','implementation','environment','test'].includes(result.category))throw new Error('Invalid divergence classification');
          if(!['INVESTIGATE','SPECIFY','REPAIR','BLOCKED'].includes(result.route))throw new Error('Unsafe recovery route');
          this.data.diagnosis=result;this.data.decisions.push(result);
          if(result.route==='BLOCKED')this.data.blockers.push(result.hypothesis??result.category);
          if(result.route==='INVESTIGATE'||result.route==='SPECIFY') {this.data.taskResults={};this.data.pending=this.data.tasks.map(t=>t.id);}
          this.transition(result.route,'Divergence classified; valid evidence/history retained');
        }else if(state==='REPAIR') {
          result=await this.invoke('repair',{failure:this.data.failure,diagnosis:this.data.diagnosis,scope:this.data.scope},signal);
          this.data.decisions.push({repair:result});this.transition('REVALIDATE','Repair checkpointed; full independent gate required');
        }
        if(until&&state===until)break;
      }
    }catch(error) {
      if(signal?.aborted){this.data.resumeState=this.data.state;this.transition('CANCELLED','Active operation cancelled');}
      else {this.data.blockers.push(scrub(error.message));this.transition('BLOCKED',error.message);}
    }finally{
      this.data.spentMs=previousSpent+performance.now()-runStarted;
      try{this.save();}finally{this.deadline=null;fs.closeSync(fd);fs.unlinkSync(lock);}
    }
    return this.status();
  }
  recoverLock({execute=false}={}) {
    if(!execute)throw new Error('Explicit execute mode required');
    const lock=path.join(this.root,'run.lock');noSymlinks(lock);
    const stat=fs.statSync(lock),record=JSON.parse(fs.readFileSync(lock));
    if(!Number.isSafeInteger(record.pid)||record.pid<=0)throw new Error('Invalid owner; manual inspection required');
    try{process.kill(record.pid,0);throw new Error('Workflow owner still alive');}catch(error){if(error.code!=='ESRCH')throw error;}
    const now=fs.statSync(lock);if(now.ino!==stat.ino||now.mtimeMs!==stat.mtimeMs)throw new Error('Lock changed during recovery');
    fs.unlinkSync(lock);return {recovered:true,owner:record.pid};
  }
}
