import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { auditRecords, trace, digest, validateRecord } from '../../src/evidence/index.mjs';
import { createWorkflow } from '../../src/adapters/workflow.mjs';
import { loadReferences } from '../../src/optimization/index.mjs';
function records(){
  const target={type:'Target',schemaVersion:'2.0.0',id:'t',name:'test',version:'2',hash:digest('v2'),platform:'linux',environment:{},scope:[],origin:'local'};
  return [target,{type:'Requirement',schemaVersion:'2.0.0',id:'r',description:'x',acceptance:['yes'],evidenceIds:[],findingIds:[],dependencies:[],priority:'critical',implementationStatus:'implemented',validationStatus:'PASS'},
    {type:'Oracle',schemaVersion:'2.0.0',id:'o',kind:'recording',identity:'oracle',independent:true,limitations:[]},
    {type:'Validation',schemaVersion:'2.0.0',id:'v',requirementId:'r',oracleId:'o',target:{id:'t',version:'2',hash:target.hash},candidate:{identity:'c'},environment:{},corpus:{},expected:1,observed:1,status:'PASS',logs:[],artifacts:[]}];
}
test('historical PASS does not conceal newest failure or obsolete target validation',()=>{
  const rows=records();rows.push({...rows.at(-1),id:'v2',status:'FAIL'});
  assert.deepEqual(trace(rows).implementedUnvalidated,['r']);
  const changed=records();changed[0].version='3';assert.deepEqual(trace(changed).unvalidated,['r']);
});
test('typed references and non-independent oracles are inconsistent',()=>{
  const rows=records();rows[3].oracleId='t';assert.ok(auditRecords(rows).some(e=>e.includes('Oracle')));
  const second=records();second[2].independent=false;assert.ok(auditRecords(second).some(e=>e.includes('independent')));
  assert.throws(()=>validateRecord({type:'__proto__',schemaVersion:'2.0.0'}));
});
test('reference loading is selective, bounded and discloses omitted data',()=>{
  const root=fileURLToPath(new URL('../../skills/rea-reconstruction-companion',import.meta.url));
  const result=loadReferences(root,'function',{maxBytes:4096});assert.ok(result.authority.includes('untrusted'));assert.ok(result.loadedBytes<=4096);assert.ok(result.omitted.length);
  assert.ok(result.references.every(r=>r.hash.length===64));
});
test('runtime plan identity prevents config substitution during resume',t=>{
  const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'rea-plan-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const config={schemaVersion:'2.0.0',target:{id:'t',version:'1',hash:digest('t')},scope:['p'],requirements:[{id:'r',acceptance:['a']}],tasks:[],candidate:{identity:'c'},oracle:{id:'o',identity:'ref',cases:[]}};
  const first=createWorkflow(config,{root});first.runtime.save();
  assert.throws(()=>createWorkflow({...config,scope:['different']},{root}),/mismatch|changed/);
});
