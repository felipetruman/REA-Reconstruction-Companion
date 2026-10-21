import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { atomicWrite, canonical, digest, noSymlinks } from '../evidence/index.mjs';
import { patchRea, BEGIN, END, planInstall, applyInstall } from '../../skills/rea-reconstruction-companion/scripts/installer.mjs';

const rule=fs.readFileSync(new URL('../../integration/rea-companion.md',import.meta.url),'utf8');
const legacy=fs.readFileSync(new URL('../../integration/legacy-rea-companion.md',import.meta.url),'utf8');
export const HOSTS=Object.freeze({codex:{invocation:'$rea-reconstruction-companion',directory:'.agents/skills',source:'https://developers.openai.com/codex/skills'},'claude-code':{invocation:'/rea-reconstruction-companion',directory:'.claude/skills',source:'https://code.claude.com/docs/en/skills'},generic:{invocation:'Read rea-reconstruction-companion/SKILL.md explicitly',directory:null}});
export function installCompanion({skillsDir,host='generic',execute=false,replace=false,packageRoot}={}) {
  if(!skillsDir)throw new Error('Explicit scoped skillsDir required; no implicit global installation');
  if(!HOSTS[host])throw new Error('Unsupported host');
  const plan=planInstall({client:host,skillsDir,integration:'off',replace},{...(packageRoot?{packageRoot}:{})});
  const changed=plan.skillChanged;
  const differences=[...new Set([...plan.desired.keys(),...plan.before.keys()])].filter(file=>!plan.desired.get(file)?.equals(plan.before.get(file)??Buffer.alloc(0)));
  if(execute)applyInstall(plan);
  const verified=execute?planInstall({client:host,skillsDir,integration:'off',replace},{...(packageRoot?{packageRoot}:{})}):plan;
  return {destination:plan.destination,version:plan.version,status:verified.skillChanged?(verified.destinationExisted?'DRIFT':'ABSENT'):'VERIFIED',changed:execute&&changed,differences,canonicalReaModified:false,runtimeVerified:false,invocation:HOSTS[host].invocation};
}
function skillFile(value) {
  if(!value||!fs.existsSync(value))return null;
  if(fs.statSync(value).isFile())return path.resolve(value);
  const matches=fs.readdirSync(value).filter(n=>n.toLowerCase()==='skill.md');
  if(matches.length>1)throw new Error('ambiguous SKILL.md capitalization');
  return matches.length?path.join(path.resolve(value),matches[0]):null;
}
function read(file){if(fs.statSync(file).size>2*1024*1024)throw new Error('Skill size limit exceeded');return fs.readFileSync(file,'utf8');}
function block(text) {
  const starts=text.split(BEGIN).length-1,ends=text.split(END).length-1;
  if(!starts&&!ends)return null;
  if(starts!==1||ends!==1||text.indexOf(END)<text.indexOf(BEGIN))throw new Error('Malformed integration markers');
  return text.slice(text.indexOf(BEGIN),text.indexOf(END)+END.length);
}
export function discover({roots,home=os.homedir()}={}) {
  const found=[];
  for(const root of roots??[path.join(home,'.agents/skills'),path.join(home,'.claude/skills'),path.join(home,'.codex/skills')]) {
    if(!fs.existsSync(root)||!fs.statSync(root).isDirectory())continue;
    const locations=[root,...fs.readdirSync(root).slice(0,1000).map(n=>path.join(root,n)).filter(p=>fs.statSync(p).isDirectory())];
    for(const location of locations) {
      const file=skillFile(location);if(!file)continue;
      if(/^name:\s*["']?reverse-engineer-anything["']?\s*$/m.test(read(file)))found.push({path:file,realPath:fs.realpathSync(file)});
    }
  }
  return [...new Map(found.map(r=>[r.realPath,r])).values()];
}
export function diagnose({reaPath,companionPath,tools=[],host='generic',expectedHash,acknowledgement}={}) {
  const rea=skillFile(reaPath),companion=skillFile(companionPath),text=rea?read(rea):'';
  const version=/^version:\s*["']?([0-9]+\.[0-9]+\.[0-9]+)/m.exec(text)?.[1]??null;
  const major=version?Number(version.split('.')[0]):null;
  const reaFound=!!rea&&/^name:\s*["']?reverse-engineer-anything["']?\s*$/m.test(text);
  let owned,conflicts=[];try{owned=block(text);}catch(error){conflicts.push(error.message);}
  if(expectedHash&&digest(text)!==expectedHash)conflicts.push('REA changed after installation/update; inspect owned block and customizations');
  if(!HOSTS[host])conflicts.push('Unsupported host: explicit invocation required');
  const compatible=reaFound&&major>=4&&major<=6&&!conflicts.length;
  // Caller-supplied live acknowledgement is reported separately from filesystem state.
  const runtimeVerified=acknowledgement?.companionLoaded===true&&acknowledgement?.reaLoaded===true&&acknowledgement?.host===host;
  return {reaFound,reaPath:rea,realPath:rea?fs.realpathSync(rea):null,version,companionFound:!!companion,companionPath:companion,active:!!owned,compatible,tools:tools.filter(t=>typeof t==='string'),runtimeVerified,host,conflicts,
    recommendedAction:!reaFound?'Supply an existing REA skill path':!compatible?'Review version/marker compatibility before legacy integration':!runtimeVerified?'Invoke both skills explicitly and provide a host acknowledgement':'No corrective action',
    limitations:['Files and caller-reported tool names do not prove live routing. No model or host process was invoked.']};
}
export function integrationPlan({reaPath,companionPath,mode='explicit',host='generic'}) {
  if(!['explicit','legacy'].includes(mode))throw new Error('Unknown integration mode');
  noSymlinks(reaPath);const file=skillFile(reaPath);if(!file)throw new Error('REA not found');noSymlinks(file);
  const diagnosis=diagnose({reaPath:file,companionPath,host}),before=read(file);
  if(mode==='legacy'&&!diagnosis.compatible)throw new Error('REA version/integration incompatible');
  const after=mode==='legacy'?patchRea(before,rule,legacy):before;
  return {reaPath:file,mode,host,invocation:(HOSTS[host]??HOSTS.generic).invocation,before,after,beforeHash:digest(before),afterHash:digest(after),ownedBefore:block(before),ownedAfter:block(after),diagnosis};
}
export function applyIntegration(plan,{execute=false,receiptDir}={}) {
  if(!execute)throw new Error('Explicit execute mode required');
  noSymlinks(plan.reaPath);const current=read(plan.reaPath);
  if(digest(current)!==plan.beforeHash)throw new Error('REA changed since preview');
  if(plan.before===plan.after)return {changed:false,mode:plan.mode,reaPath:plan.reaPath};
  if(!receiptDir)throw new Error('Explicit backup/receipt directory required');
  noSymlinks(receiptDir);const id=crypto.randomUUID();
  const backup=path.join(path.resolve(receiptDir),`${id}.before.md`),receiptFile=path.join(path.resolve(receiptDir),`${id}.json`);
  atomicWrite(backup,plan.before,{expectedHash:null});
  const receipt={changed:true,reaPath:plan.reaPath,backup,receiptFile,beforeHash:plan.beforeHash,afterHash:plan.afterHash,ownedBefore:plan.ownedBefore,ownedAfter:plan.ownedAfter};
  // Receipt precedes mutation, so an interrupted apply remains reversible/diagnosable.
  atomicWrite(receiptFile,canonical(receipt)+'\n',{expectedHash:null});
  atomicWrite(plan.reaPath,plan.after,{expectedHash:plan.beforeHash});
  if(digest(read(plan.reaPath))!==plan.afterHash)throw new Error('Integration verification failed');
  return receipt;
}
export function uninstallIntegration(receipt,{execute=false}={}) {
  if(!execute)throw new Error('Explicit execute mode required');
  if(!receipt.changed)return {changed:false};
  noSymlinks(receipt.reaPath);noSymlinks(receipt.backup);
  const before=read(receipt.backup),current=read(receipt.reaPath);
  if(digest(before)!==receipt.beforeHash)throw new Error('Backup integrity mismatch');
  const owned=block(current);
  if(owned===receipt.ownedBefore)return {changed:false};
  if(owned!==receipt.ownedAfter)throw new Error('Owned block modified externally; preserve and review');
  const after=digest(current)===receipt.afterHash?before:current.replace(owned,receipt.ownedBefore??'');
  atomicWrite(receipt.reaPath,after,{expectedHash:digest(current)});return {changed:true,hash:digest(after)};
}
