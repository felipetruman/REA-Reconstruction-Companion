import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EvidenceCache, selectTests, selectReferences, summarize, Telemetry } from '../../src/optimization/index.mjs';
import { digest } from '../../src/evidence/index.mjs';
const identity={target:'a',version:'1',hash:digest('a'),environment:{os:'linux'},scenario:'parse',tool:{name:'reader',version:'1',parameters:{strict:true}},schemaVersion:'2.0.0'};
test('cache persists exact identities, counts hits/misses, invalidates dependents and preserves history',t=>{
  const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'rea-cache-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const cache=new EvidenceCache(root);cache.put(identity,{evidenceIds:['e']});assert.equal(cache.get(identity).current,true);
  assert.equal(cache.get({...identity,version:'2'}),null);
  cache.invalidate({target:'a',version:'2',hash:digest('b')});assert.equal(cache.get(identity),null);
  assert.equal(cache.get(identity,{historical:true}).current,false);
  assert.equal(new EvidenceCache(root).get(identity),null);assert.ok(cache.stats.hits>=1);assert.ok(cache.stats.misses>=2);
  assert.throws(()=>cache.put({...identity,tool:undefined},{}));
});
test('shared dependencies expand regression scope and uncertainty/full completion select entire suite',()=>{
  const records=[{type:'Requirement',id:'shared',dependencies:[]},{type:'Requirement',id:'a',dependencies:['shared']},{type:'Requirement',id:'b',dependencies:['shared']},{type:'Implementation',id:'i',components:['lib/shared'],requirementIds:['shared']}];
  const tests=[{id:'ta',requirementIds:['a']},{id:'tb',requirementIds:['b']},{id:'tc',requirementIds:['other']}];
  assert.deepEqual(selectTests({records,tests,changes:['lib/shared']}).tests.map(t=>t.id),['ta','tb']);
  assert.equal(selectTests({records,tests,changes:['unknown']}).tests.length,3);
  assert.equal(selectTests({records,tests,changes:['a'],completionGate:true}).tests.length,3);
});
test('selective references always preserve authority; summaries deduplicate, bound and disclose omissions',()=>{
  const references=selectReferences('web');assert.ok(references.core.includes('SKILL.md'));assert.ok(references.references.length>0);assert.throws(()=>selectReferences('unknown'));
  const result=summarize({target:{id:'a'},state:'VALIDATE',evidenceIds:['e','e'],decisions:Array.from({length:100},(_,i)=>({id:i,note:'long'.repeat(50)})),blockers:[]},{maxBytes:1000});
  assert.ok(Buffer.byteLength(JSON.stringify(result))<=1000);assert.deepEqual(result.current.evidenceIds,['e']);assert.ok(result.omitted.decisions>0);assert.ok(result.core.includes('untrusted'));
});
test('telemetry records observed counts and labels token estimates',()=>{
  const telemetry=new Telemetry();telemetry.record('cacheHit');telemetry.record('loadedBytes',100);telemetry.record('estimatedTokens',25);
  const result=telemetry.snapshot();assert.equal(result.cacheHit,1);assert.equal(result.tokens.actual,null);assert.equal(result.tokens.estimated,25);assert.throws(()=>telemetry.record('actualTokens',10));
});
