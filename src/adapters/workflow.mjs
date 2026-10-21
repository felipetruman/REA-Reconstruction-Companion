import fs from 'node:fs';
import path from 'node:path';
import { EvidenceStore, digest, canonical, clone, noSymlinks, safePath, sealEvidence, VERSION } from '../evidence/index.mjs';
import { differential, recordingOracle, metrics } from '../validation/index.mjs';
import { Runtime, planTasks } from '../runtime/index.mjs';
import { EvidenceCache, selectReferences, summarize, Telemetry, selectTests } from '../optimization/index.mjs';
import { localCommand } from './local.mjs';

export function readWorkflow(file) {
  noSymlinks(file);if(fs.statSync(file).size>2*1024*1024)throw new Error('Workflow size limit exceeded');
  const config=JSON.parse(fs.readFileSync(file,'utf8'));
  if(config.schemaVersion!==VERSION||!config.target||!config.scope?.length||!config.requirements?.length||!config.candidate?.identity||!Array.isArray(config.oracle?.cases))throw new Error('Invalid workflow contract');
  planTasks(config.tasks??[],config.scope);
  for(const req of config.requirements)if(!req.id||!req.acceptance?.length)throw new Error('Requirement acceptance criteria required');
  if(!/^[a-f0-9]{64}$/.test(config.target.hash??''))throw new Error('Target SHA-256 required');
  return config;
}
function treeIdentity(root) {
  const files=[];let bytes=0;
  function walk(dir) {
    for(const name of fs.readdirSync(dir).sort()) {
      const file=safePath(root,path.relative(root,path.join(dir,name)));const stat=fs.statSync(file);
      if(stat.isDirectory())walk(file);
      else if(stat.isFile()){bytes+=stat.size;if(bytes>32*1024*1024||files.length>=10000)throw new Error('Candidate artifact budget exceeded');files.push({path:path.relative(root,file),hash:digest(fs.readFileSync(file))});}
      else throw new Error('Unsupported candidate artifact');
    }
  }
  walk(root);return {hash:digest(files),files};
}
export function createWorkflow(config,{root,allowedExecutables=[]}={}) {
  root=path.resolve(root);noSymlinks(root);
  const candidateDir=path.join(root,'candidate');
  if(config.targetDirectory) {
    const target=fs.realpathSync(config.targetDirectory),candidate=path.resolve(candidateDir);
    if(candidate===target||candidate.startsWith(target+path.sep)||target.startsWith(root+path.sep)||target===root||root.startsWith(target+path.sep))throw new Error('Target, candidate and state must be isolated');
  }
  const telemetry=new Telemetry({file:path.join(root,'telemetry.json')});let store,cache;
  function initialize() {
    if(config.targetArtifact) {
      if(!config.targetDirectory)throw new Error('Target artifact directory required');
      const file=safePath(config.targetDirectory,config.targetArtifact);
      if(fs.statSync(file).size>32*1024*1024||digest(fs.readFileSync(file))!==config.target.hash)throw new Error('Target artifact identity changed; invalidate evidence and start a new versioned run');
    }
    noSymlinks(candidateDir);fs.mkdirSync(candidateDir,{recursive:true,mode:0o700});
    store??=new EvidenceStore(path.join(root,'evidence'));cache??=new EvidenceCache(path.join(root,'cache'));
  }
  const targetRecord={type:'Target',schemaVersion:VERSION,id:config.target.id,name:config.target.name??config.target.id,version:config.target.version,hash:config.target.hash,platform:process.platform,environment:{node:process.version},scope:config.scope,origin:config.target.origin??'local:authorized-workflow'};
  const cases=clone(config.oracle.cases);
  const supportedRequirements=new Set(cases.filter(c=>Object.hasOwn(c,'expected')).map(c=>c.requirementId));
  const evidenceId=`ev-${digest({target:config.target,oracle:config.oracle}).slice(0,32)}`;
  const cacheId={target:config.target.id,version:config.target.version,hash:config.target.hash,environment:{node:process.version,platform:process.platform},scenario:'preserved-reference',tool:{name:'recording',version:VERSION,parameters:{corpus:digest(cases)}},schemaVersion:VERSION};
  const execute=async (command,{signal,input}={})=>{
    initialize();runtime.consumeOperation();telemetry.record('operations');const started=performance.now();
    try{const result=await localCommand(command,{cwd:candidateDir,allowedExecutables,input,signal,timeoutMs:config.limits?.stageMs??10000,maxBytes:1024*1024});telemetry.record('loadedBytes',result.outputBytes);return result;}
    catch(error){telemetry.record('errors');throw error;}
    finally{telemetry.record('durationMs',performance.now()-started);telemetry.flush();}
  };
  const validate=async(_,{signal}={})=>{
    initialize();const candidate=treeIdentity(candidateDir);
    const implementationId=`impl-snapshot-${candidate.hash.slice(0,32)}`;
    store.add({type:'Implementation',schemaVersion:VERSION,id:implementationId,requirementIds:config.requirements.map(r=>r.id),components:config.scope,version:config.candidate.version??'local',hash:candidate.hash});
    const selection=selectTests({records:store.records(),tests:cases.map(c=>({id:c.id,requirementIds:[c.requirementId]})),changes:config.changedComponents??[],completionGate:true});
    telemetry.record('testsExecuted',selection.tests.length);
    const result=await differential({oracle:recordingOracle({...config.oracle,cases}),candidate:async(input)=>{
      const response=await execute(config.candidate.command,{input,signal});return JSON.parse(response.stdout);
    },candidateIdentity:config.candidate.identity,target:config.target,environment:{node:process.version,platform:process.platform,architecture:process.arch},corpus:{id:config.oracle.id??'reference'},cases,signal});
    result.candidate={...result.candidate,version:config.candidate.version??'local',hash:candidate.hash};result.fullSuite=true;
    for(const requirement of config.requirements) {
      const rows=result.results.filter(r=>r.requirementId===requirement.id);
      const status=!rows.length?'INCONCLUSIVE':rows.some(r=>r.status==='FAIL')?'FAIL':rows.every(r=>r.status==='PASS')?'PASS':'INCONCLUSIVE';
      store.add({type:'Validation',schemaVersion:VERSION,id:`v-${digest({requirement:requirement.id,result}).slice(0,32)}`,requirementId:requirement.id,oracleId:config.oracle.id??'reference',implementationIds:[implementationId],target:config.target,candidate:result.candidate,environment:result.environment,corpus:result.corpus,expected:rows.map(r=>r.expected??null),observed:rows.map(r=>r.observed??null),status,logs:[],artifacts:[],critical:requirement.priority==='critical'});
      const old=store.get(requirement.id);if(old)store.replace({...old,validationStatus:status},{expected:digest(old)});
    }
    return result;
  };
  const handlers={
    investigate:async()=>{
      initialize();store.add(targetRecord);const hit=cache.get(cacheId);telemetry.record(hit?'cacheHit':'cacheMiss');telemetry.flush();
      if(!store.get(evidenceId))store.add(sealEvidence({type:'Evidence',schemaVersion:VERSION,id:evidenceId,targetId:config.target.id,targetVersion:config.target.version,targetHash:config.target.hash,kind:'recording',origin:'authorized local preserved corpus',location:'workflow-reference.json',timestamp:new Date().toISOString(),scenario:'preserved-reference',data:cases,limitations:['Public preserved corpus; not a blind agent benchmark.']}));
      if(!hit)cache.put(cacheId,{evidenceIds:[evidenceId]});
      store.add({type:'Oracle',schemaVersion:VERSION,id:config.oracle.id??'reference',kind:'recording',identity:config.oracle.identity,independent:true,limitations:['Preserved results supplied independently from candidate; provenance is caller responsibility.']});
      return {target:config.target,evidenceIds:[evidenceId],tools:allowedExecutables,reusedEvidence:!!hit,references:selectReferences(config.topic??'function')};
    },
    specify:async()=>{
      initialize();const findingId=`f-${digest(evidenceId).slice(0,32)}`;
      store.add({type:'Finding',schemaVersion:VERSION,id:findingId,evidenceIds:[evidenceId],claim:'Preserved corpus defines the selected observable contracts',classification:'observed',conflicts:[],verification:'verified'});
      for(const r of config.requirements)if(!store.get(r.id))store.add({type:'Requirement',schemaVersion:VERSION,id:r.id,description:r.description??r.id,acceptance:r.acceptance,evidenceIds:[evidenceId],findingIds:[findingId],dependencies:r.dependencies??[],priority:r.priority??'normal',implementationStatus:'pending',validationStatus:'NOT_RUN'});
      if(store.audit().length)throw new Error('Evidence graph has broken or inconsistent requirement dependencies');
      return {requirements:config.requirements,tasks:config.tasks??[]};
    },
    implement:async({task},{signal})=>{
      const response=await execute(task.command,{signal});const candidate=treeIdentity(candidateDir);
      store.add({type:'Implementation',schemaVersion:VERSION,id:`impl-${digest({task:task.id,hash:candidate.hash}).slice(0,32)}`,requirementIds:task.requirementIds??config.requirements.map(r=>r.id),components:task.scope,version:config.candidate.version??'local',hash:candidate.hash});
      for(const r of config.requirements){const old=store.get(r.id);if(old)store.replace({...old,implementationStatus:'implemented'},{expected:digest(old)});}
      return {exitCode:response.exitCode,hash:candidate.hash,artifacts:candidate.files};
    },validate,
    diagnose:async()=>config.repair?{category:'implementation',hypothesis:'Configured candidate differs from preserved reference',route:'REPAIR'}:{category:'implementation',hypothesis:'Independent validation failed; no repair tool authorized',route:'BLOCKED'},
    repair:async(_,{signal})=>{
      const result=await execute(config.repair,{signal}),candidate=treeIdentity(candidateDir);
      store.add({type:'Implementation',schemaVersion:VERSION,id:`impl-${candidate.hash.slice(0,32)}`,requirementIds:config.requirements.map(r=>r.id),components:config.scope,version:config.candidate.version??'local',hash:candidate.hash});
      return {exitCode:result.exitCode,hash:candidate.hash};
    }
  };
  const onCheckpoint=data=>{
    store??=new EvidenceStore(path.join(root,'evidence'));
    const checkpoint={type:'Checkpoint',schemaVersion:VERSION,target:data.target,workflowState:data.state,completed:data.completed,pending:data.pending,decisions:data.decisions,blockers:data.blockers,evidenceIds:data.evidenceIds,validationIds:store.records().filter(r=>r.type==='Validation').map(r=>r.id)};
    store.add({id:`cp-${digest(checkpoint).slice(0,32)}`,...checkpoint});
  };
  const runtime=new Runtime({root:path.join(root,'state'),target:config.target,scope:config.scope,handlers,limits:config.limits,planHash:digest(config),onCheckpoint});
  return {runtime,validate,telemetry,report(){
    const report=runtime.report(),candidate=fs.existsSync(candidateDir)?treeIdentity(candidateDir):null;
    const evidenceStore=fs.existsSync(path.join(root,'evidence/store.json'))?new EvidenceStore(path.join(root,'evidence')):null;
    const evidence=evidenceStore?.report({candidate})??null;
    const requirements=(evidenceStore?.records()??[]).filter(r=>r.type==='Requirement').map(r=>({...r,evidenceSupported:supportedRequirements.has(r.id)&&!evidence.unsupported.includes(r.id)&&r.evidenceIds.every(id=>!evidence.stale.includes(id))&&!r.findingIds.some(id=>evidence.contradictions.includes(id)),validated:!evidence.unvalidated.includes(r.id)}));
    const measured=metrics({results:runtime.status().validations.at(-1)?.results??[],requirements,interventions:runtime.status().necessaryInterventions,execution:report.metrics.executionEfficiency});
    return {...report,metrics:measured,evidence,completionCurrent:runtime.status().state==='COMPLETE'&&!!candidate&&runtime.status().validations.at(-1)?.candidate.hash===candidate.hash,context:summarize(runtime.status()),telemetry:telemetry.snapshot()};
  }};
}
