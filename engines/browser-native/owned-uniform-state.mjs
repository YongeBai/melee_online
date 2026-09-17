// Only immutable JS snapshots from native-render-context/native-camera enter
// this cache. No native heap views, addresses, or geometry plans. It is cleared
// at every flush because other renderers and verification share the GL context.
export function createOwnedUniformState(){
 let programs=new Map(),lights=new WeakMap(),current=null;
 const stats={projectionUploads:0,projectionSkipped:0,lightingUploads:0,lightingSkipped:0};
 return {
  begin(){programs=new Map();lights=new WeakMap();current=null;for(const key of Object.keys(stats))stats[key]=0;},
  select(gl,program){if(current!==program){gl.useProgram(program);current=program;}let row=programs.get(program);if(!row){row={projection:null,lights:null,fog:null,currentMatrix:null,images:0};programs.set(program,row);}return row;},
  projection(row,value){const changed=row.projection!==value;row.projection=value;stats[changed?'projectionUploads':'projectionSkipped']++;return changed;},
  lighting(row,value){const changed=row.lights!==value;row.lights=value;stats[changed?'lightingUploads':'lightingSkipped']++;return changed;},
  packLights(value){
   let packed=lights.get(value);if(packed)return packed;
   packed={lightColor:new Int32Array(32),lightPosition:new Float32Array(24),lightDirection:new Float32Array(24),lightAngular:new Float32Array(24),lightDistance:new Float32Array(24)};
   for(let i=0;i<8;i++)if(value[i]){packed.lightColor.set(value[i].color,i*4);packed.lightPosition.set(value[i].position,i*3);packed.lightDirection.set(value[i].direction,i*3);packed.lightAngular.set(value[i].angular,i*3);packed.lightDistance.set(value[i].distance,i*3);}
   lights.set(value,packed);return packed;
  },
  snapshot:()=>({...stats})
 };
}
