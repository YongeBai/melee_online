import test from 'node:test';
import assert from 'node:assert/strict';
import {createImmediateResourcePool,immediateResourceKey,appendImmediateGeometry,immediateTriangles,uploadImmediateResource} from '../../engines/browser-native/immediate-geometry.mjs';
function gpu(){
 let id=0,vao=null;const bound=new Map(),buffers=new Map(),vaos=new Map(),deleted=[],allocations=[];
 const gl={ARRAY_BUFFER:1,ELEMENT_ARRAY_BUFFER:2,FLOAT:3,INT:4,DYNAMIC_DRAW:5,isContextLost:()=>false,
 createBuffer:()=>++id,createVertexArray:()=>{const n=++id;vaos.set(n,new Map());return n;},
 bindVertexArray:n=>{vao=n;bound.set(2,vaos.get(n)?.get('indices'));},bindBuffer:(t,b)=>{bound.set(t,b);if(t===2&&vao)vaos.get(vao).set('indices',b);},
 enableVertexAttribArray:i=>vaos.get(vao).set('enabled'+i,true),vertexAttribPointer:(i,...args)=>vaos.get(vao).set(i,{buffer:bound.get(1),integer:false,args}),vertexAttribIPointer:(i,...args)=>vaos.get(vao).set(i,{buffer:bound.get(1),integer:true,args}),
 bufferData:(t,size)=>{assert.equal(typeof size,'number');buffers.set(bound.get(t),new Uint8Array(size));allocations.push([bound.get(t),size]);},
 bufferSubData:(t,offset,data)=>{const b=buffers.get(bound.get(t));assert.ok(offset+data.byteLength<=b.length);b.set(new Uint8Array(data.buffer,data.byteOffset,data.byteLength),offset);},
 deleteBuffer:b=>deleted.push(b),deleteVertexArray:b=>deleted.push(b)};
 return {gl,buffers,vaos,deleted,allocations};
}
const layout=(kind=0,textured=1,cull=0,flatRegisters=true)=>({kind,textured,cull,flatRegisters});
function fill(g,plan,shape,count,value){
 const vertices=new Float32Array(count*9).fill(value),registers=new Int32Array(16).fill(-value);
 appendImmediateGeometry(plan.stream,vertices,immediateTriangles(0x80,count),shape.flatRegisters?registers:null);
 vertices.fill(99);registers.fill(99);g.gl.bindVertexArray(plan.vao);uploadImmediateResource(g.gl,plan,shape.flatRegisters);
 for(const [buffer,view] of [[plan.vertex,plan.stream.data.subarray(0,count*9)],[plan.indices,plan.stream.indices.subarray(0,plan.stream.indexCount)],...(shape.flatRegisters?[[plan.registers,plan.stream.registers.subarray(0,count*16)]]:[])])assert.deepEqual(g.buffers.get(buffer).subarray(0,view.byteLength),new Uint8Array(view.buffer,view.byteOffset,view.byteLength));
 assert.equal(plan.stream.data[0],value);if(shape.flatRegisters)assert.equal(plan.stream.registers[0],-value);
}
test('mixed immediate layouts reorder, disappear and return across exclusive leases without sharing queued storage',()=>{
 const g=gpu(),pool=createImmediateResourcePool(g.gl),shapes=[layout(0,1,0,true),layout(1,0,2,false),layout(2,1,0,true)],lease=pool.acquire();
 const original=shapes.map((s,i)=>{const p=lease.take(s);p.mesh={frame:1};fill(g,p,s,8,i+1);return p;});
 const duplicate=lease.take(shapes[0]);assert.notEqual(duplicate.resource,original[0].resource);fill(g,duplicate,shapes[0],4,9);assert.equal(original[0].stream.data[0],1);
 assert.throws(()=>pool.acquire(),/leased/);assert.throws(()=>pool.dispose(),/leased/);lease.release();assert.throws(()=>lease.take(shapes[0]),/Released/);
 const next=pool.acquire();for(const i of [2,0]){const p=next.take(shapes[i]);assert.equal(p.resource,original[i].resource);assert.notEqual(p,original[i]);assert.equal(p.mesh,undefined);assert.equal(p.stream.vertexCount,0);fill(g,p,shapes[i],4,10+i);}
 const added=next.take(layout(0,0,1,false));fill(g,added,layout(0,0,1,false),12,20);
 next.release();const last=pool.acquire(),returned=last.take(shapes[1]);assert.equal(returned.resource,original[1].resource);fill(g,returned,shapes[1],16,30);last.release();
 const count=pool.snapshot().slots;pool.dispose();pool.dispose();assert.equal(g.deleted.length,count*4);assert.equal(new Set(g.deleted).size,g.deleted.length);assert.throws(()=>pool.acquire(),/unavailable/);
});
test('all structural variants have distinct resources and correct VAO register types/enables',()=>{
 const g=gpu(),pool=createImmediateResourcePool(g.gl),lease=pool.acquire(),keys=new Set(),resources=new Set();
 for(let kind=0;kind<3;kind++)for(const textured of [0,1])for(let cull=0;cull<4;cull++)for(const flatRegisters of [false,true]){
  const shape={kind,textured,cull,flatRegisters},p=lease.take(shape);keys.add(immediateResourceKey(shape));resources.add(p.resource);const attrs=g.vaos.get(p.vao);
  assert.deepEqual(attrs.get(0).args,[3,g.gl.FLOAT,false,36,0]);assert.deepEqual(attrs.get(7).args,[2,g.gl.FLOAT,false,36,28]);
  for(let i=8;i<12;i++){assert.equal(attrs.get(i).integer,true);assert.equal(!!attrs.get('enabled'+i),flatRegisters);assert.equal(attrs.get(i).buffer,p.registers);}
 }
 assert.equal(keys.size,48);assert.equal(resources.size,48);lease.release();pool.dispose();
 for(const bad of [layout(3),layout(0,2),layout(0,0,4),layout(0,0,0,1)])assert.throws(()=>immediateResourceKey(bad),/layout/);
});
test('GPU capacity survives shrinking and grows only when necessary; every used byte is replaced',()=>{
 const g=gpu(),pool=createImmediateResourcePool(g.gl),lease=pool.acquire(),shape=layout();let p=lease.take(shape);fill(g,p,shape,16,1);const resource=p.resource,allocated=g.allocations.length;
 lease.begin();p=lease.take(shape);assert.equal(p.resource,resource);fill(g,p,shape,4,2);assert.equal(g.allocations.length,allocated);
 lease.begin();p=lease.take(shape);fill(g,p,shape,64,3);assert.equal(g.allocations.length,allocated+3);assert.equal(p.stream.vertexCount,64);assert.equal(p.stream.indexCount,96);
 lease.release();pool.dispose();
});
