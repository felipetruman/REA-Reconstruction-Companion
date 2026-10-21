import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const VERSION = '2.0.0';
export function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && Object.getPrototypeOf(value) === Object.prototype) return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  throw new Error('Only finite JSON data is supported');
}
export const digest = value => crypto.createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : canonical(value)).digest('hex');
export const stableId = (kind,identity) => `${kind}-${digest(identity).slice(0,32)}`;
export const clone = value => JSON.parse(canonical(value));

export function safePath(root,relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\0') || relative.includes('\\') || path.isAbsolute(relative) || relative.split('/').some(x=>x==='..')) throw new Error('Unsafe path');
  const base=path.resolve(root),result=path.resolve(base,relative);
  if(!result.startsWith(base+path.sep))throw new Error('Unsafe path');
  noSymlinks(result);return result;
}
export function noSymlinks(value) {
  let cursor=path.resolve(value);
  for(;;) {
    try { if(fs.lstatSync(cursor).isSymbolicLink())throw new Error(`Refusing symlink: ${cursor}`); } catch(error) {if(error.code!=='ENOENT')throw error;}
    const parent=path.dirname(cursor);if(parent===cursor)break;cursor=parent;
  }
}
export function atomicWrite(file,data,{expectedHash,maxBytes=16*1024*1024}={}) {
  noSymlinks(file);if(Buffer.byteLength(data)>maxBytes)throw new Error('Store size limit exceeded');
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const lock=`${file}.lock`;let fd;
  try {fd=fs.openSync(lock,'wx',0o600);}catch(error){throw new Error(`Store locked; inspect interrupted writer before recovery: ${error.code}`);}
  const temp=`${file}.tmp-${crypto.randomUUID()}`;
  try {
    fs.writeSync(fd,JSON.stringify({pid:process.pid,started:new Date().toISOString()}));fs.fsyncSync(fd);
    const actual=fs.existsSync(file)?digest(fs.readFileSync(file)):null;
    if(expectedHash!==undefined && expectedHash!==actual)throw new Error('Stale revision; reload before writing');
    const out=fs.openSync(temp,'wx',0o600);
    try {fs.writeFileSync(out,data);fs.fsyncSync(out);}finally{fs.closeSync(out);}
    fs.renameSync(temp,file);
    const dir=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}
  }finally {fs.closeSync(fd);fs.unlinkSync(lock);if(fs.existsSync(temp))fs.unlinkSync(temp);}
}

const schemas=JSON.parse(fs.readFileSync(new URL('../../schemas/records.json',import.meta.url),'utf8'));
function structural(value,schema,label) {
  if(schema.enum&&!schema.enum.includes(value))throw new Error(`${label}: invalid enum`);
  if(schema.type) {
    const actual=Array.isArray(value)?'array':value===null?'null':typeof value;
    if(schema.type!==actual)throw new Error(`${label}: expected ${schema.type}`);
  }
  if(typeof value==='string') {
    if(schema.minLength && value.length<schema.minLength)throw new Error(`${label}: empty`);
    if(schema.pattern&&!new RegExp(schema.pattern).test(value))throw new Error(`${label}: invalid format`);
  }
  if(Array.isArray(value) && schema.items)value.forEach((v,i)=>structural(v,schema.items,`${label}[${i}]`));
  if(value&&typeof value==='object'&&!Array.isArray(value)) {
    for(const k of schema.required??[])if(!(k in value))throw new Error(`${label}.${k}: required`);
    for(const [k,v] of Object.entries(value)) {
      if(schema.properties?.[k])structural(v,schema.properties[k],`${label}.${k}`);
      else if(schema.additionalProperties===false)throw new Error(`${label}.${k}: unknown field`);
    }
  }
}
export function sealEvidence(value) {return {...value,hash:digest({data:value.data??null,artifact:value.artifact??null,...(value.artifactHash?{artifactHash:value.artifactHash}:{})})};}
export function verifyArtifact(record,root,{maxBytes=32*1024*1024}={}) {
  validateRecord(record);
  if(!record.artifact||!record.artifactHash)return {status:'INCONCLUSIVE',reason:'No independently recorded artifact digest'};
  const file=safePath(root,record.artifact);
  const fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW??0));
  try{
    const stat=fs.fstatSync(fd);if(!stat.isFile()||stat.size>maxBytes)throw new Error('Artifact type/size limit exceeded');
    const observed=digest(fs.readFileSync(fd));return {status:observed===record.artifactHash?'PASS':'FAIL',expected:record.artifactHash,observed};
  }finally{fs.closeSync(fd);}
}
export function validateRecord(value) {
  canonical(value);
  const schema=Object.hasOwn(schemas.$defs,value.type)?schemas.$defs[value.type]:null;if(!schema)throw new Error('Unknown record type');
  structural(value,schema,value.type);
  if(value.schemaVersion!==VERSION)throw new Error('Unsupported schema version');
  if(value.type==='Evidence') {
    if(!('data'in value)&&!value.artifact)throw new Error('Evidence data or artifact required');
    if(value.hash!==sealEvidence(value).hash)throw new Error('Evidence integrity mismatch');
    if(!Number.isFinite(Date.parse(value.timestamp)))throw new Error('Invalid evidence timestamp');
    safePath('/evidence',value.location);
    if(value.artifact)safePath('/evidence',value.artifact);
  }
  return value;
}
export function migrate(document) {
  if(document.schemaVersion===VERSION)return clone(document);
  if(document.schemaVersion!=='1.0.0')throw new Error('Unsupported schema migration');
  // v1 structured records have identical semantics but no record schemaVersion.
  return {schemaVersion:VERSION,records:document.records.map(r=>({...r,schemaVersion:VERSION}))};
}
const references={Evidence:['targetId'],Finding:['evidenceIds','conflicts'],Requirement:['evidenceIds','findingIds','dependencies'],Implementation:['requirementIds'],Validation:['requirementId','oracleId','implementationIds'],Checkpoint:['evidenceIds','validationIds']};
export function auditRecords(records) {
  const index=new Map(records.map(r=>[r.id,r])),errors=[];
  if(index.size!==records.length)errors.push('Duplicate IDs');
  for(const r of records) {
    validateRecord(r);
    for(const field of references[r.type]??[])for(const id of Array.isArray(r[field])?r[field]:r[field]?[r[field]]:[])if(!index.has(id))errors.push(`${r.id}.${field}: missing ${id}`);
    if(r.type==='Evidence') {
      const target=index.get(r.targetId);
      if(target && (target.type!=='Target'||target.version!==r.targetVersion||target.hash!==r.targetHash))errors.push(`${r.id}: stale target identity`);
    }
    const typed={Evidence:{targetId:'Target'},Finding:{evidenceIds:'Evidence'},Requirement:{evidenceIds:'Evidence',findingIds:'Finding',dependencies:'Requirement'},Implementation:{requirementIds:'Requirement'},Validation:{requirementId:'Requirement',oracleId:'Oracle',implementationIds:'Implementation'},Checkpoint:{evidenceIds:'Evidence',validationIds:'Validation'}};
    for(const [field,type] of Object.entries(typed[r.type]??{}))for(const id of Array.isArray(r[field])?r[field]:r[field]?[r[field]]:[])if(index.has(id)&&index.get(id).type!==type)errors.push(`${r.id}.${field}: expected ${type}`);
    if(r.type==='Validation'&&r.status==='PASS') {
      const oracle=index.get(r.oracleId);if(oracle?.type==='Oracle'&&(!oracle.independent||oracle.identity===r.candidate.identity))errors.push(`${r.id}: independent oracle required`);
    }
  }
  // Requirements form a DAG; detect cycles without trusting input order.
  const visiting=new Set(),done=new Set();
  function visit(id){if(visiting.has(id)){errors.push(`dependency cycle: ${id}`);return;}if(done.has(id))return;visiting.add(id);for(const dep of index.get(id)?.dependencies??[])visit(dep);visiting.delete(id);done.add(id);}
  for(const r of records)if(r.type==='Requirement')visit(r.id);
  return errors;
}
export class EvidenceStore {
  constructor(root,{maxBytes=16*1024*1024}={}) {
    noSymlinks(root);this.file=path.join(path.resolve(root),'store.json');this.maxBytes=maxBytes;this.reload();
  }
  reload() {
    noSymlinks(this.file);this.revision=null;this.document={schemaVersion:VERSION,records:[]};
    if(fs.existsSync(this.file)) {
      if(fs.statSync(this.file).size>this.maxBytes)throw new Error('Store size limit exceeded');
      const bytes=fs.readFileSync(this.file),envelope=JSON.parse(bytes);
      if(digest(envelope.document)!==envelope.integrity)throw new Error('Store integrity mismatch');
      this.document=migrate(envelope.document);this.document.records.forEach(validateRecord);
      if(new Set(this.document.records.map(r=>r.id)).size!==this.document.records.length)throw new Error('Duplicate IDs');
      this.revision=digest(bytes);
    }
    return this;
  }
  records(){return clone(this.document.records);}
  get(id){const row=this.document.records.find(r=>r.id===id);return row?clone(row):undefined;}
  add(record) {
    validateRecord(record);const old=this.get(record.id);
    if(old){if(canonical(old)!==canonical(record))throw new Error('Inconsistent duplicate ID');return old;}
    return this.commit([...this.document.records,clone(record)],record);
  }
  replace(record,{expected}={}) {
    validateRecord(record);const old=this.get(record.id);
    if(!old||!expected||digest(old)!==expected)throw new Error('Replacement requires matching revision');
    return this.commit(this.document.records.map(r=>r.id===record.id?clone(record):r),record);
  }
  commit(records,result) {
    const document={schemaVersion:VERSION,records},bytes=canonical({document,integrity:digest(document)})+'\n';
    atomicWrite(this.file,bytes,{expectedHash:this.revision,maxBytes:this.maxBytes});this.document=document;this.revision=digest(bytes);return clone(result);
  }
  audit(){return auditRecords(this.records());}
  report(options){return trace(this.records(),options);}
}
export function trace(records,{target,candidate}={}) {
  const reqs=records.filter(r=>r.type==='Requirement'),evidence=records.filter(r=>r.type==='Evidence');
  const index=new Map(records.map(r=>[r.id,r]));
  const validations=records.filter(r=>r.type==='Validation');
  const currentValidation=r=>{
    const latest=validations.findLast(v=>v.requirementId===r.id);
    if(!latest||latest.status!=='PASS')return false;
    if(candidate&&latest.candidate.hash!==candidate.hash)return false;
    const identity=target?.id===latest.target.id?target:index.get(latest.target.id);
    const oracle=index.get(latest.oracleId);
    return identity?.version===latest.target.version&&identity.hash===latest.target.hash&&oracle?.type==='Oracle'&&oracle.independent&&oracle.identity!==latest.candidate.identity;
  };
  return {
    unsupported:reqs.filter(r=>!r.evidenceIds.length||r.evidenceIds.some(id=>index.get(id)?.type!=='Evidence')).map(r=>r.id),
    unvalidated:reqs.filter(r=>!currentValidation(r)).map(r=>r.id),
    implementedUnvalidated:reqs.filter(r=>r.implementationStatus==='implemented'&&!currentValidation(r)).map(r=>r.id),
    contradictions:records.filter(r=>r.type==='Finding'&&r.conflicts.length).map(r=>r.id),
    blocked:reqs.filter(r=>r.implementationStatus==='blocked').map(r=>r.id),
    withoutAcceptance:reqs.filter(r=>!r.acceptance.length).map(r=>r.id),
    componentsWithoutAcceptance:records.filter(r=>r.type==='Implementation'&&(!r.requirementIds.length||r.requirementIds.some(id=>!index.get(id)?.acceptance?.length))).flatMap(r=>r.components),
    stale:evidence.filter(e=>{const t=target?.id===e.targetId?target:index.get(e.targetId);return !t||t.version!==e.targetVersion||t.hash!==e.targetHash;}).map(r=>r.id),
    edges:records.flatMap(r=>(references[r.type]??[]).flatMap(k=>(Array.isArray(r[k])?r[k]:r[k]?[r[k]]:[]).map(id=>({from:id,to:r.id,relation:k})))),
    errors:auditRecords(records)
  };
}
