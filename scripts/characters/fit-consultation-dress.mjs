// The inset crossed the bodice during seated gestures. Keep the continuous
// bodice, collar, buttons and cuffs, and remove that overlapping panel.
export function fitConsultationDress(document) {
  const mesh = document.getRoot().listNodes().find(n => n.getName() === 'RendererC_GoldenDressDetails')?.getMesh();
  if (!mesh) return;
  for (const primitive of mesh.listPrimitives()) {
    const points = primitive.getAttribute('POSITION');
    if (/Secondary/.test(primitive.getMaterial().getName())) {
      const raw = primitive.getIndices().getArray();
      const parent = Array.from({length:points.getCount()},(_,i)=>i);
      const find = i => parent[i] === i ? i : (parent[i] = find(parent[i]));
      const welded = new Map();
      for(let i=0;i<points.getCount();i++) {
        const key=points.getElement(i,[]).map(v=>v.toFixed(5)).join(',');
        if(welded.has(key)) parent[find(i)]=find(welded.get(key)); else welded.set(key,i);
      }
      for(let i=0;i<raw.length;i+=3) {parent[find(raw[i+1])]=find(raw[i]);parent[find(raw[i+2])]=find(raw[i]);}
      const bounds=new Map();
      for(let i=0;i<points.getCount();i++) {
        const root=find(i),y=points.getElement(i,[])[1];
        const bound=bounds.get(root)||[Infinity,-Infinity];bound[0]=Math.min(bound[0],y);bound[1]=Math.max(bound[1],y);bounds.set(root,bound);
      }
      const kept=[];
      for(let i=0;i<raw.length;i+=3) {
        const [low,high]=bounds.get(find(raw[i]));
        if(high-low<0.15) kept.push(raw[i],raw[i+1],raw[i+2]);
      }
      if(!kept.length || kept.length===raw.length) throw new Error('Could not separate the collar from the inset');
      primitive.getIndices().setArray(new Uint32Array(kept));
      console.log('Removed overlapping inset triangles:',(raw.length-kept.length)/3);
    } else if (/Accent/.test(primitive.getMaterial().getName())) {
      for(const side of [-1,1]) {
        const ids=[];
        for(let i=0;i<points.getCount();i++) if(points.getElement(i,[])[0]*side>0.3) ids.push(i);
        const center=[0,0,0];
        for(const i of ids) {const p=points.getElement(i,[]);for(let k=0;k<3;k++)center[k]+=p[k]/ids.length;}
        for(const i of ids) {
          const p=points.getElement(i,[]);points.setElement(i,p.map((v,k)=>center[k]+(v-center[k])*0.68));
          for(const target of primitive.listTargets()) {
            const delta=target.getAttribute('POSITION');
            if(delta) delta.setElement(i,delta.getElement(i,[]).map(v=>v*0.68));
          }
        }
      }
    }
  }
}
