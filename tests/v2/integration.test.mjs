import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { probeRea, discover, diagnose, integrationPlan, applyIntegration, uninstallIntegration, installCompanion } from '../../src/integration/index.mjs';
function fixture(t,version='4.1.0') {
  const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'REA space '));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const rea=path.join(root,'Custom REA');fs.mkdirSync(rea);const file=path.join(rea,'skill.md');
  fs.writeFileSync(file,`---\nname: reverse-engineer-anything\nversion: ${version}\n---\n# Custom\nKeep my rules.\n`);
  return {root,rea,file};
}
test('absent, unknown and outdated REA are diagnosed without invented tools',t=>{
  const {root,file}=fixture(t,'0.1.0');
  assert.equal(discover({roots:[root]}).length,1);
  const result=diagnose({reaPath:file,companionPath:root,tools:[]});assert.equal(result.compatible,false);assert.deepEqual(result.tools,[]);assert.equal(result.runtimeVerified,false);
  assert.equal(diagnose({reaPath:path.join(root,'missing')}).reaFound,false);
});
test('native activation leaves canonical REA intact and needs actual host acknowledgement',t=>{
  const {root,file}=fixture(t);const before=fs.readFileSync(file,'utf8');
  const plan=integrationPlan({reaPath:file,companionPath:root,mode:'explicit',host:'codex'});
  assert.equal(plan.after,before);assert.equal(plan.invocation,'$rea-reconstruction-companion');
  assert.equal(diagnose({reaPath:file,companionPath:root}).runtimeVerified,false);
});
test('legacy install is previewable, idempotent, backed up and reversible preserving customizations',t=>{
  const {root,file}=fixture(t),before=fs.readFileSync(file,'utf8');
  const plan=integrationPlan({reaPath:file,companionPath:root,mode:'legacy'});
  assert.notEqual(plan.after,plan.before);assert.throws(()=>applyIntegration(plan),/execute/);
  const receipt=applyIntegration(plan,{execute:true,receiptDir:path.join(root,'receipts')});
  assert.equal(fs.readFileSync(receipt.backup,'utf8'),before);
  const second=applyIntegration(integrationPlan({reaPath:file,companionPath:root,mode:'legacy'}),{execute:true,receiptDir:path.join(root,'receipts')});assert.equal(second.changed,false);
  fs.appendFileSync(file,'\nAdditional custom rule.\n');
  uninstallIntegration(receipt,{execute:true});const after=fs.readFileSync(file,'utf8');assert.ok(after.includes('Additional custom rule.'));assert.ok(after.includes('Keep my rules.'));assert.ok(!after.includes('rea-reconstruction-companion:begin'));
});
test('external block modification, stale plan, ambiguous case and symlink fail safely',t=>{
  const {root,rea,file}=fixture(t);const plan=integrationPlan({reaPath:file,companionPath:root,mode:'legacy'});fs.appendFileSync(file,'external');
  assert.throws(()=>applyIntegration(plan,{execute:true,receiptDir:root}),/changed/);
  const receipt=applyIntegration(integrationPlan({reaPath:file,companionPath:root,mode:'legacy'}),{execute:true,receiptDir:path.join(root,'receipts')});
  fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('## REA Reconstruction Companion integration','## User modified block'));
  assert.throws(()=>uninstallIntegration(receipt,{execute:true}),/modified/);
  fs.writeFileSync(path.join(rea,'SKILL.md'),fs.readFileSync(file));
  if(fs.readdirSync(rea).filter(n=>n.toLowerCase()==='skill.md').length>1)assert.throws(()=>discover({roots:[root]}),/ambiguous/);
  else assert.equal(discover({roots:[root]}).length,1,'One case-insensitive file is a valid alias, not two conflicting skills');
  fs.symlinkSync(rea,path.join(root,'link'),process.platform==='win32'?'junction':'dir');assert.throws(()=>integrationPlan({reaPath:path.join(root,'link'),mode:'legacy'}),/symlink/);
});
test('native scoped installation verifies files, detects drift and preserves customizations until explicit replacement',t=>{
  assert.equal(createRequire(import.meta.url).resolve('rea-reconstruction-companion/install.mjs'),fileURLToPath(new URL('../../install.mjs',import.meta.url)));
  const {root,file}=fixture(t),skillsDir=path.join(root,'isolated skills'),before=fs.readFileSync(file,'utf8');
  const preview=installCompanion({skillsDir,host:'codex'});assert.equal(preview.status,'ABSENT');assert.equal(fs.existsSync(skillsDir),false);
  const installed=installCompanion({skillsDir,host:'codex',execute:true});assert.equal(installed.status,'VERIFIED');assert.equal(fs.readFileSync(file,'utf8'),before);
  assert.equal(installCompanion({skillsDir,host:'codex',execute:true}).changed,false);
  fs.appendFileSync(path.join(installed.destination,'SKILL.md'),'\ncustomization\n');assert.equal(installCompanion({skillsDir,host:'codex'}).status,'DRIFT');
  assert.throws(()=>installCompanion({skillsDir,host:'codex',execute:true}),/replace|differ|existing|Replace|replacement/i);
  assert.equal(installCompanion({skillsDir,host:'codex',execute:true,replace:true}).status,'VERIFIED');
});

test('live version probe requires explicit authorization and never mistakes skill revision for CLI version',async t=>{
  const {root,file}=fixture(t);fs.writeFileSync(file,'---\nname: reverse-engineer-anything\nmetadata:\n  version: "26"\n---\n');
  assert.equal(diagnose({reaPath:file}).version,null);
  const command={executable:process.execPath,args:['-e','console.log("rea 4.1.0")']};
  const options={reaPath:file,cwd:root,command,allowedExecutables:[process.execPath]};
  await assert.rejects(probeRea(options),/execute/);
  await assert.rejects(probeRea({...options,execute:true,allowedExecutables:[]}),/authorized/);
  const result=await probeRea({...options,execute:true});
  assert.equal(result.version,'4.1.0');assert.equal(result.compatible,true);
  assert.equal(result.runtimeVerified,false);assert.equal(result.versionSource,'authorized-cli-probe');
  await assert.rejects(probeRea({...options,execute:true,command:{...command,args:['-e','console.log("revision 26")']}}),/version/);
});
