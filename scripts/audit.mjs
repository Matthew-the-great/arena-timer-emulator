import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const files=[...new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean))];
let failures=0;
for(const file of files){
 const forbidden=/(^|\/)(runtime|verification|\.tools|\.pio|build)(\/|$)|\.(bin|elf|exe|dll|log|pcap|pcapng)$|(^|\/)(state\.json|uart-clear\.json|\.env(?:\..*)?)$/i;
 if(forbidden.test(file)&&!file.endsWith('.env.example')){console.error('Excluded artifact is a Git candidate:',file);failures++;continue;}
 const full=path.join(root,file);if(!fs.existsSync(full)||!fs.statSync(full).isFile())continue;
 const text=fs.readFileSync(full,'utf8');
 // Report filenames only; never echo matched secrets.
 const secrets=[/rcm_live_[A-Za-z0-9_-]{16,}/,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/https?:[^\s"'<>]*[?&]t=[A-Za-z0-9_-]{20,}/];
 if(secrets.some(re=>re.test(text))){console.error('Possible secret; inspect locally:',file);failures++;}
}
console.log(`Reviewed ${files.length} Git candidate files; ${failures} findings. Pattern checks do not replace manual review.`);
process.exitCode=failures?1:0;
