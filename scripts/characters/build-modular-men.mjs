import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../..');
const blender=[process.env.BLENDER_BIN,'/Applications/Blender.app/Contents/MacOS/Blender','/private/tmp/ghosts-character-tools/Blender52.app/Contents/MacOS/Blender'].find(p=>p&&existsSync(p));
if(!blender) throw new Error('Set BLENDER_BIN to Blender 5.2 or later.');
const selected=process.argv.find(a=>a.startsWith('--identity='))?.split('=')[1];
if(selected&&!['male-a','male-b'].includes(selected)) throw new Error('Identity must be male-a or male-b.');
const identities=selected?[selected]:['male-a','male-b'];
const source='assets/source/modular-men-2026-10-31';
const assets={'male-a':'male-lean-template','male-b':'male-broad-template'};
function run(command,args){const r=spawnSync(command,args,{cwd:root,stdio:'inherit'});if(r.error)throw r.error;if(r.status!==0)throw new Error(`${command} exited ${r.status}`);}
function python(script,args){run(blender,['--background','--factory-startup','--threads','4','--python-exit-code','1','--python',`scripts/characters/${script}`,'--',...args]);}
for(const identity of identities){
  if(!process.argv.includes('--assemble-only')) python('build_carmela_head.py',['--identity',identity,'--output',`${source}/fitted-${identity}`]);
  python('build_modular_male.py',['--identity',identity,'--output',`game/public/models/characters/${assets[identity]}.glb`,...(process.argv.includes('--reuse-motions')?['--reuse-motions']:[])]);
  python('audit_modular_motion.py',['--blend',`${source}/${identity}-assembled.blend`,'--output',`artifacts/characters/modular-men/${identity}-motion.json`]);
}
run(process.execPath,['scripts/characters/optimize-modular-patients.mjs',...identities.map(id=>`game/public/models/characters/${assets[id]}.glb`)]);
