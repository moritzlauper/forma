export function constrainPopup(x:number,y:number,width:number,height:number,viewportWidth:number,viewportHeight:number){
 const margin=8;
 return {x:Math.max(margin,Math.min(x,Math.max(margin,viewportWidth-width-margin))),y:Math.max(margin,Math.min(y,Math.max(margin,viewportHeight-height-margin)))};
}
export function makePopupMovable(host:HTMLElement,handle:HTMLElement){
 let drag:{id:number;x:number;y:number;left:number;top:number}|null=null;
 const place=(x:number,y:number)=>{const r=host.getBoundingClientRect();const p=constrainPopup(x,y,r.width,r.height,innerWidth,innerHeight);host.style.left=p.x+'px';host.style.top=p.y+'px';host.style.right='auto';host.style.bottom='auto';};
 const down=(e:PointerEvent)=>{if(e.button!==0)return;const r=host.getBoundingClientRect();drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:r.left,top:r.top};handle.setPointerCapture(e.pointerId);e.preventDefault();};
 const move=(e:PointerEvent)=>{if(drag&&drag.id===e.pointerId)place(drag.left+e.clientX-drag.x,drag.top+e.clientY-drag.y);};
 const end=()=>{drag=null;};
 const key=(e:KeyboardEvent)=>{const delta:Record<string,[number,number]>={ArrowLeft:[-16,0],ArrowRight:[16,0],ArrowUp:[0,-16],ArrowDown:[0,16]};if(!delta[e.key])return;e.preventDefault();const r=host.getBoundingClientRect();place(r.left+delta[e.key][0],r.top+delta[e.key][1]);};
 const resize=()=>{if(host.isConnected&&host.style.left){const r=host.getBoundingClientRect();place(r.left,r.top);}};
 handle.tabIndex=0;handle.setAttribute('role','button');handle.setAttribute('aria-label','Move FORMA popup');handle.title='Drag to move · use arrow keys when focused';handle.classList.add('drag-handle');
 handle.addEventListener('pointerdown',down);handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end);handle.addEventListener('lostpointercapture',end);handle.addEventListener('keydown',key);window.addEventListener('resize',resize);
 const observer=new ResizeObserver(resize);observer.observe(host);
 return ()=>{observer.disconnect();window.removeEventListener('resize',resize);handle.removeEventListener('pointerdown',down);handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',end);handle.removeEventListener('pointercancel',end);handle.removeEventListener('lostpointercapture',end);handle.removeEventListener('keydown',key);};
}
