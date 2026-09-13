import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync,copyFileSync,readdirSync,realpathSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {spawnSync} from 'node:child_process';
const require=createRequire(import.meta.url),root=join(dirname(new URL(import.meta.url).pathname),'..'),out=join(root,'public/workers');
mkdirSync(out,{recursive:true});
const core=dirname(require.resolve('@ffmpeg/core'));
const esm=core.replace('/umd','/esm');copyFileSync(join(esm,'ffmpeg-core.js'),join(out,'ffmpeg-core.js'));
const wasm=readFileSync(join(esm,'ffmpeg-core.wasm')),parts=[];
for(let i=0;i<wasm.length;i+=8*1024*1024){const name=`ffmpeg-core-${parts.length}.part`;writeFileSync(join(out,name),wasm.subarray(i,i+8*1024*1024));parts.push(name);}
writeFileSync(join(out,'ffmpeg-manifest.json'),JSON.stringify({parts}));
const ffRoot=join(root,'node_modules/@ffmpeg/ffmpeg');
const cmd=join(root,'node_modules/.bin/esbuild');
for(const [src,dest] of [[join(ffRoot,'dist/esm/worker.js'),'ffmpeg-worker.js'],[join(root,'lib/lyricforge/transcription.worker.ts'),'transcription.js']]){const r=spawnSync(cmd,[src,'--bundle','--format=esm','--platform=browser','--minify','--outfile='+join(out,dest)],{stdio:'inherit'});if(r.status)process.exit(r.status);}
const tfRoot=realpathSync(join(root,'node_modules/@huggingface/transformers'));
const tfRequire=createRequire(join(tfRoot,'package.json'));
const ortDist=dirname(tfRequire.resolve('onnxruntime-web'));
for(const name of readdirSync(ortDist).filter(x=>/^ort-wasm-simd-threaded.*\.(wasm|mjs)$/.test(x)))copyFileSync(join(ortDist,name),join(out,name));
console.log('Media workers prepared.');
