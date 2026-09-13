import {spawnSync} from 'node:child_process';
import {rm} from 'node:fs/promises';
const dir=new URL('../tests/.compiled/',import.meta.url);
const compile=spawnSync('node_modules/.bin/esbuild',[...['model','lyrics','history','animation','synchronization','store'].map(n=>`lib/lyricforge/${n}.ts`),'tests/project-entry.ts','--outdir='+dir.pathname,'--outbase=.','--entry-names=[name]','--bundle','--packages=external','--platform=node','--format=esm','--out-extension:.js=.mjs'],{stdio:'inherit'});
if(compile.error){console.error('Could not start esbuild for legacy tests:',compile.error);process.exit(1);}if(compile.status)process.exit(compile.status);
try {const result=spawnSync(process.execPath,['--test','tests/core.test.mjs','tests/project.test.mjs'],{stdio:'inherit'});process.exitCode=result.status??1;} finally {await rm(dir,{recursive:true,force:true});}
