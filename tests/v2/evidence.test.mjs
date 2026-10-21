import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { syncDirectory, EvidenceStore, canonical, digest, stableId, sealEvidence, migrate, validateRecord, trace } from '../../src/evidence/index.mjs';

export function fixture() {
  const target = { type:'Target', schemaVersion:'2.0.0', id:'target-a', name:'parser', version:'1', hash:digest('original'), platform:'linux', environment:{node:20}, scope:['parse'], origin:'local:fixture' };
  const evidence = sealEvidence({ type:'Evidence', schemaVersion:'2.0.0', id:'ev-a', targetId:target.id, targetVersion:'1', targetHash:target.hash, kind:'recording', origin:'local', location:'fixtures/a.json', timestamp:'2026-01-01T00:00:00Z', scenario:'parse', data:{input:'a',output:1}, limitations:[] });
  const requirement = { type:'Requirement', schemaVersion:'2.0.0', id:'req-a', description:'parse', acceptance:['returns length'], evidenceIds:['ev-a'], findingIds:[], dependencies:[], priority:'critical', implementationStatus:'pending', validationStatus:'NOT_RUN' };
  return {target,evidence,requirement};
}
function temporary(t) { const dir=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'rea-evidence-')); t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir; }
test('canonical identity is deterministic and validates formal mandatory fields',()=>{
  assert.equal(canonical({b:1,a:2}),canonical({a:2,b:1}));
  assert.equal(stableId('e',{a:1}),stableId('e',{a:1}));
  assert.throws(()=>validateRecord({type:'Target',id:'../evil'}));
  assert.throws(()=>canonical({secret:Infinity}));
  assert.throws(()=>validateRecord({...fixture().target,platform:3}));
});
test('store recovers verified records; duplicate is idempotent, inconsistent duplicate rejected',t=>{
  const root=temporary(t),store=new EvidenceStore(root),{target,evidence,requirement}=fixture();
  for(const r of [target,evidence,requirement])store.add(r);
  store.add(evidence);assert.equal(store.records().length,3);
  assert.throws(()=>store.add({...evidence,data:{changed:true}}));
  assert.deepEqual(new EvidenceStore(root).get('ev-a'),evidence);
  assert.deepEqual(store.audit(),[]);
  assert.equal(trace(store.records()).unvalidated.length,1);
});
test('corruption, stale writers, broken refs and interrupted writes cannot silently replace data',t=>{
  const root=temporary(t),a=new EvidenceStore(root),b=new EvidenceStore(root);
  a.add(fixture().target);assert.throws(()=>b.add(fixture().target),/revision/);
  a.add({...fixture().requirement,evidenceIds:['missing']});assert.match(a.audit().join(),/missing/);
  fs.writeFileSync(path.join(root,'store.json.tmp-interrupted'),'partial');
  assert.equal(new EvidenceStore(root).records().length,2);
  const file=path.join(root,'store.json');const doc=JSON.parse(fs.readFileSync(file));doc.document.records[0].name='tampered';fs.writeFileSync(file,JSON.stringify(doc));
  assert.throws(()=>new EvidenceStore(root),/integrity/);
});
test('graph detects unsupported, contradictory, blocked, stale and missing acceptance',()=>{
  const {target,evidence,requirement}=fixture();
  const rows=[target,evidence,{...requirement,evidenceIds:[],acceptance:[],implementationStatus:'blocked'},
    {type:'Finding',schemaVersion:'2.0.0',id:'f',evidenceIds:['ev-a'],claim:'disputed',classification:'inferred',conflicts:['ev-a'],verification:'unverified'}];
  const report=trace(rows,{target:{...target,version:'2'}});
  for(const key of ['unsupported','contradictions','blocked','stale','withoutAcceptance'])assert.equal(report[key].length,1,key);
});
test('evidence hash, invalid schema, traversal, symlink and size boundaries',t=>{
  assert.throws(()=>validateRecord({...fixture().evidence,hash:digest('wrong')}),/integrity/);
  assert.throws(()=>validateRecord({...fixture().evidence,location:'../secret'}),/path/);
  assert.throws(()=>migrate({schemaVersion:'99',records:[]}));
  const root=temporary(t);fs.symlinkSync(root,path.join(root,'link'));assert.throws(()=>new EvidenceStore(path.join(root,'link')),/symlink/);
  assert.throws(()=>new EvidenceStore(path.join(root,'small'),{maxBytes:20}).add(fixture().target),/size/);
  assert.equal(migrate({schemaVersion:'1.0.0',records:[{...fixture().target,schemaVersion:undefined}]}).records[0].schemaVersion,'2.0.0');
});

test('directory durability is platform aware and POSIX failures remain visible',()=>{
  const calls=[];const io={openSync:(...args)=>{calls.push(['open',...args]);return 7;},fsyncSync:fd=>calls.push(['sync',fd]),closeSync:fd=>calls.push(['close',fd])};
  assert.equal(syncDirectory('/fixture',{platform:'win32',io}).synced,false);assert.deepEqual(calls,[]);
  assert.equal(syncDirectory('/fixture',{platform:'linux',io}).synced,true);assert.deepEqual(calls,[['open','/fixture','r'],['sync',7],['close',7]]);
  assert.throws(()=>syncDirectory('/fixture',{platform:'darwin',io:{...io,fsyncSync:()=>{throw Error('disk error');}}}),/disk error/);
  assert.deepEqual(calls.at(-1),['close',7]);
});
