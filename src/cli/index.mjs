#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWorkflow, readWorkflow } from '../adapters/workflow.mjs';
import { planTasks } from '../runtime/index.mjs';
import { probeRea, diagnose, integrationPlan, applyIntegration, uninstallIntegration, discover, installCompanion } from '../integration/index.mjs';
import { selectReferences } from '../optimization/index.mjs';

export async function main(argv=process.argv.slice(2)) {
  const [operation,...args]=argv,options={allowedExecutables:[]};
  const keys={'--rea-cli':'reaCli','--config':'config','--root':'root','--until':'until','--rea-path':'reaPath','--companion-path':'companionPath','--host':'host','--mode':'mode','--receipt-dir':'receiptDir','--receipt':'receipt','--action':'action','--topic':'topic','--skills-dir':'skillsDir'};
  for(let i=0;i<args.length;i++) {
    if(args[i]==='--execute'){options.execute=true;continue;}
    if(args[i]==='--replace'){options.replace=true;continue;}
    if(args[i]==='--recover-lock'){options.recoverLock=true;continue;}
    if(args[i]==='--allow-executable'){if(!args[i+1])throw new Error('Executable path required');options.allowedExecutables.push(path.resolve(args[++i]));continue;}
    if(!keys[args[i]]||!args[i+1]||args[i+1].startsWith('--'))throw new Error(`Unknown/missing argument: ${args[i]}`);
    options[keys[args[i]]]=args[++i];
  }
  if(!operation||operation==='help'||operation==='--help')return {exit:0,result:{usage:'node src/cli/index.mjs plan|run|status|resume|validate|report --config workflow.json --root RUN_DIR [--execute --allow-executable /absolute/tool] [--until STAGE] | integration --action discover|diagnose|plan|install|uninstall ... | context --topic function',safety:'Inspection writes nothing. Execution requires --execute and a separate executable allowlist. No sandbox is implied.'}};
  if(operation==='context')return {exit:0,result:selectReferences(options.topic??'function')};
  if(operation==='integration') {
    const action=options.action??'diagnose';let result;
    if(action==='discover')result=discover();
    else if(action==='skill-install')result=installCompanion(options);
    else if(action==='diagnose')result=diagnose(options);
    else if(action==='probe')result=await probeRea({...options,cwd:process.cwd(),command:{executable:options.reaCli,args:['--version']}});
    else if(action==='plan')result=integrationPlan(options);
    else if(action==='install')result=applyIntegration(integrationPlan(options),options);
    else if(action==='uninstall'){if(!options.receipt||fs.statSync(options.receipt).size>2*1024*1024)throw new Error('Bounded receipt required');result=uninstallIntegration(JSON.parse(fs.readFileSync(options.receipt)),options);}
    else throw new Error('Unknown integration action');
    return {exit:0,result};
  }
  if(!['plan','run','status','resume','validate','report'].includes(operation))throw new Error('Unknown operation');
  if(!options.config||!options.root)throw new Error('--config and --root required');
  const config=readWorkflow(options.config);
  if(operation==='plan')return {exit:0,result:{mode:'inspection',target:config.target,tasks:planTasks(config.tasks??[],config.scope),requirements:config.requirements,toolsRequired:[...new Set([...(config.tasks??[]).map(t=>t.command.executable),config.candidate.command.executable,...(config.repair?[config.repair.executable]:[])])],references:selectReferences(config.topic??'function')}};
  const workflow=createWorkflow(config,options);let result;
  if(operation==='status')result=workflow.runtime.status();
  else if(operation==='report')result=workflow.report();
  else {
    if(!options.execute)throw new Error('Explicit --execute required');
    const controller=new AbortController(),cancel=()=>controller.abort(new Error('Process cancellation requested'));
    process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
    try {
      if(options.recoverLock)workflow.runtime.recoverLock({execute:true});
      if(operation==='validate')result=await workflow.runtime.validate({execute:true,signal:controller.signal});
      else result=await workflow.runtime[operation]({...options,signal:controller.signal});
    }finally {process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);}
  }
  return {exit:result.state==='BLOCKED'||result.state==='CANCELLED'||['FAIL','INCONCLUSIVE'].includes(result.status)?1:0,result};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try{const {exit,result}=await main();console.log(JSON.stringify(result,null,2));process.exitCode=exit;}
  catch(error){console.log(JSON.stringify({status:'ERROR',message:error.message}));process.exitCode=2;}
}
