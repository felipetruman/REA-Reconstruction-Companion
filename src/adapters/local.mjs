import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { noSymlinks } from '../evidence/index.mjs';

// This is an authorization boundary, not an OS sandbox. Only explicitly trusted
// local argv may be granted. Unknown binaries need a caller-supplied sandbox.
export function localCommand(command,options) {
  return Promise.resolve().then(()=>commandProcess(command,options)).catch(error=>{error.infrastructure=true;throw error;});
}
async function commandProcess(command,{cwd,allowedExecutables=[],input,signal,timeoutMs=10000,maxBytes=1024*1024}={}) {
  if(!command||typeof command.executable!=='string'||!path.isAbsolute(command.executable)||!allowedExecutables.includes(command.executable))throw new Error('Executable is not explicitly authorized');
  if(!Array.isArray(command.args)||command.args.some(a=>typeof a!=='string'||a.includes('\0'))||command.args.length>1024)throw new Error('Invalid argv');
  if(!Number.isFinite(timeoutMs)||timeoutMs<=0||!Number.isSafeInteger(maxBytes)||maxBytes<1)throw new Error('Invalid process limits');
  noSymlinks(cwd);if(!fs.statSync(cwd).isDirectory())throw new Error('Invalid candidate directory');
  if(signal?.aborted)throw new Error('Operation cancelled');
  const payload=input===undefined?'':JSON.stringify(input)+'\n';if(Buffer.byteLength(payload)>maxBytes)throw new Error('Input size limit exceeded');
  return new Promise((resolve,reject)=>{
    const child=spawn(command.executable,command.args,{cwd,shell:false,detached:process.platform!=='win32',env:{PATH:process.env.PATH??'',LANG:'C.UTF-8',TZ:'UTC'},stdio:['pipe','pipe','pipe']});
    let stdout='',stderr='',bytes=0,failure,killTimer;
    const kill=()=>{try{if(process.platform!=='win32')process.kill(-child.pid,'SIGKILL');else child.kill('SIGKILL');}catch(error){if(error.code!=='ESRCH')failure??=error;}};
    const stop=reason=>{failure??=new Error(reason);try{if(process.platform!=='win32')process.kill(-child.pid,'SIGTERM');else child.kill('SIGTERM');}catch{}killTimer??=setTimeout(kill,100);};
    const timer=setTimeout(()=>stop('Process deadline exceeded'),timeoutMs);
    const cancel=()=>stop('Operation cancelled');signal?.addEventListener('abort',cancel,{once:true});
    child.on('error',error=>{failure=error;});
    child.stdin.on('error',()=>{});
    child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>maxBytes)stop('Process output limit exceeded');else stdout+=chunk;});
    child.stderr.on('data',chunk=>{bytes+=chunk.length;if(bytes>maxBytes)stop('Process output limit exceeded');else stderr+=chunk;});
    child.on('close',(code,termination)=>{
      clearTimeout(timer);clearTimeout(killTimer);signal?.removeEventListener('abort',cancel);kill();
      if(failure)return reject(failure);
      if(code!==0)return reject(new Error(`Authorized command failed: exit=${code} signal=${termination??'none'}; stderr omitted (${Buffer.byteLength(stderr)} bytes)`));
      resolve({stdout,stderr,exitCode:code,outputBytes:bytes});
    });
    child.stdin.end(payload);
  });
}
