#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicWrite, canonical, digest, noSymlinks } from '../evidence/index.mjs';

export function createExample(directory,{execute=false}={}) {
  if(!execute)throw new Error('Explicit --execute required to create the example');
  const root=path.resolve(directory);noSymlinks(root);
  const cases=[{id:'empty',requirementId:'length',input:'',expected:{output:0}},{id:'ascii',requirementId:'length',input:'abc',expected:{output:3}},{id:'unicode',requirementId:'length',input:'😀',expected:{output:2}}];
  const bytes=canonical(cases)+'\n',targetDirectory=path.join(root,'target');
  const candidate="let text='';for await(const data of process.stdin)text+=data;console.log(JSON.stringify({output:JSON.parse(text).length}));";
  const config={schemaVersion:'2.0.0',target:{id:'public-length',version:'1',hash:digest(bytes),origin:'local:preserved-public-corpus'},targetDirectory,targetArtifact:'reference.json',scope:['parser'],topic:'function',requirements:[{id:'length',description:'Return UTF-16 code unit count',priority:'critical',acceptance:['Empty string returns zero','ASCII and supplementary unicode match preserved reference']}],tasks:[{id:'build',scope:['parser'],dependsOn:[],requirementIds:['length'],command:{executable:process.execPath,args:['-e',`require('node:fs').writeFileSync('parser.mjs',${JSON.stringify(candidate)})`]}}],candidate:{identity:'local-length-candidate',version:'1',command:{executable:process.execPath,args:['parser.mjs']}},oracle:{id:'preserved-length',identity:'independent-preserved-length-v1',cases},limits:{maxIterations:30,stageMs:10000,totalMs:30000,maxOperations:30,maxAttempts:3}};
  if(fs.existsSync(path.join(root,'workflow.json'))||fs.existsSync(path.join(targetDirectory,'reference.json')))throw new Error('Example destination already exists; choose a new directory');
  atomicWrite(path.join(targetDirectory,'reference.json'),bytes,{expectedHash:null});
  atomicWrite(path.join(root,'workflow.json'),canonical(config)+'\n',{expectedHash:null});
  return {config:path.join(root,'workflow.json'),runRoot:path.join(root,'run'),allowedExecutable:process.execPath,classification:'Public known software fixture; not a blind model evaluation'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try{const args=process.argv.slice(2);if(args.length!==2||args[1]!=='--execute')throw new Error('Usage: node src/cli/example.mjs NEW_DIRECTORY --execute');console.log(JSON.stringify(createExample(args[0],{execute:true}),null,2));}
  catch(error){console.error(error.message);process.exitCode=2;}
}
