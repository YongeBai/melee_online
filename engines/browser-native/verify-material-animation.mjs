import {readModelMaterials} from './material-assets.mjs';
import {runTrack} from './verify-animations.mjs';

export function verifyMaterialAnimation(module,object,name,bytes,model,visibility,descriptor,costume,twin) {
  const converted=costume.animation,assets=readModelMaterials(bytes,model),textures=[],colors=[];let displayIndex=0;
  if(converted&&(converted.nodes.length!==model.tree.nodes.length||converted.nodes.some((n,i)=>n.parent!==model.tree.nodes[i].parent)))throw Error('Material animation hierarchy mismatch');
  for(let joint=0;joint<model.tree.nodes.length;joint++) {
    const displays=[...new Set(model.meshes.filter(m=>m.joint===joint).map(m=>m.dobj))],materials=converted?.nodes[joint].materials??[];
    if(materials.length>displays.length)throw Error('Material animation has excess display objects');
    for(let i=0;i<displays.length;i++) {
      const mesh=model.meshes.find(m=>m.dobj===displays[i]),material=assets.materials.get(mesh.material),animation=materials[i];
      if(animation?.animation)colors.push({index:displayIndex,animation:animation.animation});displayIndex++;
      for(let t=material.texture;t;t=t.next)textures.push({texture:t,animation:animation?.textures.find(a=>a.id===t.id)});
    }
  }
  const selected=visibility.textureRows[0]??[];
  if(selected.length!==visibility.textureCount||selected.some(i=>i>=textures.length||!textures[i].animation?.animation))throw Error('Costume texture has no animation');
  let checks=0,frames=0,colorChecks=0,isolationChecks=0;
  const root=costume.animationRoot,base=converted?root-converted.root:0;
  if(module._portMaterialAttach(object,descriptor)!==visibility.textureCount)throw Error('Original costume texture count mismatch');
  if(!twin||module._portMaterialAttach(twin,descriptor)!==visibility.textureCount)throw Error('Second fighter material setup failed');
  const twinTextures=selected.map((_,i)=>[1,2].map(field=>module._portMaterialRead(twin,i,field)));
  const twinColors=colors.map(({index})=>Array.from({length:6},(_,i)=>module._portMaterialColorRead(twin,index,i+1)));
  function checkIsolation() {
    for(let i=0;i<selected.length;i++)for(let field=1;field<=2;field++) {
      if(module._portMaterialRead(twin,i,field)!==twinTextures[i][field-1])throw Error('Material update leaked into second fighter');isolationChecks++;
    }
    for(let i=0;i<colors.length;i++)for(let channel=1;channel<=6;channel++) {
      if(module._portMaterialColorRead(twin,colors[i].index,channel)!==twinColors[i][channel-1])throw Error('Material color leaked into second fighter');isolationChecks++;
    }
  }
  const pointers=new Set();
  for(let i=0;i<selected.length;i++) {
    const {animation}=textures[selected[i]],count=Math.ceil(animation.animation.end)+1;
    if(count>4096)throw Error('Costume animation exceeds verification window');
    const reference=animation.animation.tracks.map(track=>{
      if(![1,10].includes(track.objType))throw Error('Unverified costume texture track type');
      return {track,values:runTrack(module,track,count)};
    });
    const pointer=module._portMaterialRead(object,i,0);if(!pointer||pointers.has(pointer))throw Error('Costume texture selection aliases unexpectedly');pointers.add(pointer);
    if(pointer===module._portMaterialRead(twin,i,0))throw Error('Fighter instances share a runtime texture');
    if(module._portMaterialRead(object,i,3)!==0)throw Error('Original costume animation rate not frozen');
    function verify(frame) {
      for(const {track,values} of reference) {
        const index=Math.trunc(values[frame*2]),table=track.objType===1?animation.images:animation.palettes;
        if(index<0||index>=table.length)throw Error('Costume animation selects outside its table');
        const expected=track.objType===1?base+table[index].offset:index;
        if(module._portMaterialRead(object,i,track.objType===1?1:2)!==expected)throw Error('Original costume image/palette selection mismatch: '+name+'/'+i+'/'+frame);
        checks++;
      }
    }
    // Ascending, descending and repeated requests exercise seeking at rate 0.
    for(const sequence of [Array.from({length:count},(_,i)=>i),Array.from({length:count},(_,i)=>count-1-i),[0,count-1,0]])for(const frame of sequence) {
      module._portMaterialSelect(object,i,frame);verify(frame);checkIsolation();frames++;
    }
    module._portMaterialReset(object);verify(0);
  }
  for(const {index,animation} of colors) {
    const count=Math.ceil(animation.end)+1;if(count>4096)throw Error('Material color animation exceeds verification window');
    const reference=animation.tracks.map(track=>{
      if(track.objType<1||track.objType>6)throw Error('Unverified material color track');
      return {track,values:runTrack(module,track,count)};
    });
    for(const sequence of [Array.from({length:count},(_,i)=>i),Array.from({length:count},(_,i)=>count-1-i)])for(const frame of sequence) {
      module._portMaterialColorSelect(object,index,frame);checkIsolation();
      for(const {track,values} of reference) {
        const value=values[frame*2];if(value<0||value>1)throw Error('Material color outside normalized range');
        if(module._portMaterialColorRead(object,index,track.objType)!==Math.trunc(value*255))throw Error('Original material color mismatch: '+name+'/'+index+'/'+frame);
        colorChecks++;
      }
    }
  }
  return {report:{name,textures:selected.length,images:converted?.images.size??0,palettes:converted?.palettes.size??0,checks,frames,colorAnimations:colors.length,colorChecks,isolationChecks,twoInstances:true,originalAttach:true,originalSelect:true,originalReset:true}};
}
