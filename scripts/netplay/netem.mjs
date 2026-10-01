// Real network impairment for two-browser netplay tests. A command runs inside
// an unprivileged network namespace where only UDP (WebRTC) on loopback passes
// through Linux netem, so page loads stay fast while SCTP sees genuine delay,
// jitter, reordering and loss (including its retransmission behaviour).
//
//   node scripts/netplay/netem.mjs <profile> -- <command> [args...]
//
// Both browsers share the namespace, so every peer packet crosses loopback once:
// netem delay is one-way delay and its loss rate applies to each packet.
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';

// One-way figures. Jitter uses netem's paretonormal distribution; `loss` uses a
// Gilbert-Elliott-style correlation so drops arrive in short bursts like Wi-Fi.
export const profiles={
 lan:{delayMs:1,jitterMs:0,lossPct:0,description:'Same machine, no impairment'},
 'same-city':{delayMs:8,jitterMs:2,lossPct:0,description:'Same city, wired'},
 regional:{delayMs:20,jitterMs:4,lossPct:0.2,description:'Same region, ~40 ms RTT'},
 'cross-country':{delayMs:35,jitterMs:5,lossPct:0.5,description:'Coast to coast, ~70 ms RTT'},
 'home-wifi':{delayMs:25,jitterMs:15,lossPct:1.5,lossCorrelationPct:25,description:'Regional link over busy home Wi-Fi'},
 'bad-wifi':{delayMs:30,jitterMs:25,lossPct:3,lossCorrelationPct:40,description:'Congested Wi-Fi with bursty loss'},
 far:{delayMs:60,jitterMs:8,lossPct:1,description:'Transcontinental, ~120 ms RTT'},
 // Wi-Fi rarely jitters evenly: it is mostly fine, then stalls for a few
 // hundred milliseconds (channel contention, scans, power save). Spikes raise
 // the one-way delay by extraMs for durationMs at random intervals.
 'wifi-spikes':{delayMs:20,jitterMs:4,lossPct:0.5,spikes:{everyMs:[2500,7000],extraMs:200,durationMs:250},description:'Regional link over Wi-Fi with periodic ~200 ms stalls'},
 'far-wifi':{delayMs:45,jitterMs:8,lossPct:1,spikes:{everyMs:[3000,8000],extraMs:150,durationMs:200},description:'Cross-country over Wi-Fi with periodic stalls'},
 'very-far':{delayMs:90,jitterMs:10,lossPct:1,description:'Intercontinental, ~180 ms RTT'},
};

const resolve=profile=>{const p=typeof profile==='string'?profiles[profile]:profile;if(!p)throw Error('Unknown network profile '+profile);return p;};
const qdisc=(p,extraMs=0)=>{
 const delay=`delay ${p.delayMs+extraMs}ms`+(p.jitterMs?` ${p.jitterMs}ms distribution paretonormal`:'');
 const loss=p.lossPct?` loss ${p.lossPct}%`+(p.lossCorrelationPct?` ${p.lossCorrelationPct}%`:''):'';
 return `netem limit 100000 ${delay}${loss}`;
};
export function netemCommands(profile){
 const p=resolve(profile);
 return [
  'ip link set lo up',
  // WebRTC ignores loopback interfaces; a dummy address gives each browser a
  // host candidate whose traffic is still routed over lo.
  'ip link add d0 type dummy','ip addr add 10.77.0.1/24 dev d0','ip link set d0 up',
  // Chrome gathers no candidates without a default route.
  'ip route add default dev d0',
  'tc qdisc add dev lo root handle 1: prio bands 3 priomap 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1',
  // A generous limit keeps netem from dropping its own queue at high delay.
  `tc qdisc add dev lo parent 1:3 handle 30: ${qdisc(p)}`,
  'tc filter add dev lo parent 1:0 protocol ip u32 match ip protocol 17 0xff flowid 1:3',
 ];
}

// Background loop that applies a profile's delay spikes inside the namespace.
export function spikeLoop(profile){
 const p=resolve(profile);if(!p.spikes)return null;const {everyMs:[min,max],extraMs,durationMs}=p.spikes;
 return `while :; do sleep $(awk -v r=$(shuf -i ${min}-${max} -n1) 'BEGIN{print r/1000}'); tc qdisc change dev lo parent 1:3 handle 30: ${qdisc(p,extraMs)}; sleep ${durationMs/1000}; tc qdisc change dev lo parent 1:3 handle 30: ${qdisc(p)}; done`;
}
export function runImpaired(profile,command,args,options={}){
 const setup=netemCommands(profile).join(' && '),spikes=spikeLoop(profile);
 const quoted=[command,...args].map(a=>`'${String(a).replaceAll("'","'\\''")}'`).join(' ');
 const script=spikes?`${setup} && { ${spikes}; } & spiker=$!; ${quoted}; status=$?; kill $spiker; exit $status`:`${setup} && exec ${quoted}`;
 return spawn('unshare',['-rn','sh','-c',script],{stdio:'inherit',...options});
}

if(import.meta.url===pathToFileURL(process.argv[1]).href){
 const split=process.argv.indexOf('--'),name=process.argv[2];
 if(!name||split<0||split===process.argv.length-1){console.error('Usage: node scripts/netplay/netem.mjs <'+Object.keys(profiles).join('|')+'> -- <command> [args...]');process.exit(2);}
 const child=runImpaired(name,process.argv[split+1],process.argv.slice(split+2));
 child.on('exit',code=>process.exit(code??1));
}
