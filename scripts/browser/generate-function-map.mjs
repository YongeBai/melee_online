import {readFileSync,writeFileSync} from 'node:fs';
// Development fixture only; emit names/boundaries, never guest instructions.
const [source,destination]=process.argv.slice(2);
if(!source||!destination)throw Error('Usage: node scripts/browser/generate-function-map.mjs symbols.txt output.json');
const functions=[];
for(const line of readFileSync(source,'utf8').split('\n')){
 const match=/^(.+?) = \.[^:]+:0x([0-9A-Fa-f]+); \/\/ type:function size:0x([0-9A-Fa-f]+)/.exec(line);
 if(match)functions.push({name:match[1],start:parseInt(match[2],16),size:parseInt(match[3],16)});
}
functions.sort((a,b)=>a.start-b.start);
if(!functions.length)throw Error('No function boundaries found');
writeFileSync(destination,JSON.stringify(functions));
console.log('Wrote '+functions.length+' function boundaries.');
