import {spawn} from 'node:child_process';
const [mode,...args]=process.argv.slice(2);
if(!['build','dev','start'].includes(mode))throw new Error('Expected build, dev, or start.');
const child=spawn(process.execPath,['node_modules/next/dist/bin/next',mode,...(mode==='start'?[]:['--webpack']),...args],{
 stdio:'inherit',
 env:{...process.env,NEXA_BUILD_TARGET:'vercel',NEXT_TELEMETRY_DISABLED:'1'}
});
child.on('error',()=>{console.error('Unable to start Next.js.');process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
