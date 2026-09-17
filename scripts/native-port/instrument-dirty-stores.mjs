// Reproducible, fail-closed transform of Binaryen's folded WAT. All original
// store instructions and bulk destination writes are instrumented, not a
// profile-selected subset. Metadata lives in a separate non-game memory.
export function instrumentDirtyStores(wat){
 const tokens=[...wat.matchAll(/"(?:\\.|[^"\\])*"|;;[^\n]*|[()]|[^\s()]+/g)].filter(m=>!m[0].startsWith(';;'));
 const stack=[],nodes=[];for(let i=0;i<tokens.length;i++){const t=tokens[i][0];if(t==='('){const n={start:tokens[i].index,open:i,head:i+1,children:[]};stack.at(-1)?.children.push(n);stack.push(n);nodes.push(n);}else if(t===')'){const n=stack.pop();if(!n)throw Error('Unbalanced WAT');n.end=tokens[i].index+1;n.close=i;}}
 if(stack.length||nodes[0]?.end!==wat.trimEnd().length)throw Error('WAT must be one folded module');
 if(nodes.some(n=>tokens[n.head][0]==='memory'&&tokens[n.head+1]?.[0]!=='$0'))throw Error('Unexpected source memory');
 if(nodes.filter(n=>tokens[n.head][0]==='memory').length!==2)throw Error('Expected definition and export of one memory');
 const edits=[],counts={stores:0,copy:0,fill:0};
 for(const n of nodes){const op=tokens[n.head][0];
  if(/atomic|\.store.*lane|^v128\.|^memory\.(init|discard|grow)|^data\.drop/.test(op))throw Error('Unaudited memory instruction '+op);
  if(/^[if](32|64)\.store(?:8|16|32)?$/.test(op)){
   if(n.children.length!==2)throw Error('Unfolded store '+op);
   const args=tokens.slice(n.head+1,n.children[0].open).map(t=>t[0]);
   if(args.some(a=>!/^offset=\d+$|^align=\d+$/.test(a)))throw Error('Unknown memory store arguments '+args);
   const offset=Number(args.find(a=>a.startsWith('offset='))?.slice(7)??0),size=Number(op.match(/store(\d+)/)?.[1]??op.match(/^[if](\d+)/)[1])/8;
   const a=n.children[0];edits.push({at:a.start,text:'(call $__dirty_store '},{at:a.end,text:` (i32.const ${offset}) (i32.const ${size}))`});counts.stores++;
  }else if(op==='memory.copy'||op==='memory.fill'){
   if(n.children.length!==3||tokens[n.head+1][0]!=='(')throw Error('Unknown bulk memory arguments');
   edits.push({at:tokens[n.head].index,end:tokens[n.head].index+op.length,text:'call $__dirty_'+op.slice(7)});counts[op.slice(7)]++;
  }else if(op.includes('.store'))throw Error('Unaudited store '+op);
 }
 if(!counts.stores)throw Error('No stores instrumented');
 // Apply inserts in a single pass. Equal offsets put closing child insertions
 // before opening siblings; expression order and original memarg stay intact.
 edits.sort((a,b)=>a.at-b.at);let result='',pos=0;for(const e of edits){if(e.at<pos)throw Error('Overlapping edits');result+=wat.slice(pos,e.at)+e.text;pos=e.end??e.at;}result+=wat.slice(pos);
 const helper=`
 (memory $__dirty 8 8)
 (export "__dirty_memory" (memory $__dirty))
 (export "__dirty_mark" (func $__dirty_host))
 (func $__dirty_range (param $start i64) (param $size i64) (local $end i64)
  (local.set $end (i64.add (local.get $start) (local.get $size)))
  (if (i64.gt_u (local.get $end) (i64.shl (i64.extend_i32_u (memory.size $0)) (i64.const 16))) (then (unreachable)))
  (if (i64.ne (local.get $size) (i64.const 0)) (then
   (memory.fill $__dirty (i32.wrap_i64 (i64.shr_u (local.get $start) (i64.const 12))) (i32.const 1)
    (i32.wrap_i64 (i64.add (i64.sub (i64.shr_u (i64.sub (local.get $end) (i64.const 1)) (i64.const 12)) (i64.shr_u (local.get $start) (i64.const 12))) (i64.const 1)))))))
 (func $__dirty_host (param $addr i32) (param $size i32)
  (call $__dirty_range (i64.extend_i32_u (local.get $addr)) (i64.extend_i32_u (local.get $size))))
 (func $__dirty_store (param $addr i32) (param $offset i32) (param $size i32) (result i32) (local $first i64) (local $last i64)
  (local.set $first (i64.add (i64.extend_i32_u (local.get $addr)) (i64.extend_i32_u (local.get $offset))))
  (local.set $last (i64.sub (i64.add (local.get $first) (i64.extend_i32_u (local.get $size))) (i64.const 1)))
  (if (i64.ge_u (local.get $last) (i64.shl (i64.extend_i32_u (memory.size $0)) (i64.const 16))) (then (unreachable)))
  (i32.store8 $__dirty (i32.wrap_i64 (i64.shr_u (local.get $first) (i64.const 12))) (i32.const 1))
  (i32.store8 $__dirty (i32.wrap_i64 (i64.shr_u (local.get $last) (i64.const 12))) (i32.const 1))
  (local.get $addr))
 (func $__dirty_copy (param $dst i32) (param $src i32) (param $size i32)
  (call $__dirty_host (local.get $dst) (local.get $size))
  (memory.copy $0 $0 (local.get $dst) (local.get $src) (local.get $size)))
 (func $__dirty_fill (param $dst i32) (param $value i32) (param $size i32)
  (call $__dirty_host (local.get $dst) (local.get $size))
  (memory.fill $0 (local.get $dst) (local.get $value) (local.get $size)))
 `;
 const end=result.lastIndexOf(')');return {wat:result.slice(0,end)+helper+result.slice(end),counts};
}
