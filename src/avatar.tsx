import React,{useEffect,useRef} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import type {Profile} from './fit';
export function Avatar({profile}:{profile:Profile}){
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const el=ref.current!;let renderer:THREE.WebGLRenderer;try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});}catch{el.textContent='Figure preview unavailable on this device.';return;}
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(el.clientWidth,260);el.append(renderer.domElement);
  const scene=new THREE.Scene();const camera=new THREE.PerspectiveCamera(38,el.clientWidth/260,.1,100);camera.position.set(0,1.1,4.5);
  const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,.8,0);controls.enablePan=false;controls.enableZoom=false;
  scene.add(new THREE.HemisphereLight(0xffffff,0x6d3fd1,3));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(2,4,3);scene.add(light);
  const material=new THREE.MeshStandardMaterial({color:0xbba9db,roughness:.85});
  function part(x:number,y:number,z:number,sx:number,sy:number,sz:number){const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,28,20),material);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);scene.add(mesh);}
  const m=profile.measures;const body=profile.mode==='body';const c=body?(m.chest?.value||92)/92:1;const waist=body?(m.waist?.value||78)/78:1;const hip=body?(m.hip?.value||96)/96:1;
  part(0,1.7,0,.16,.21,.17);part(0,1.35,0,.27*c,.25,.16*c);part(0,1.09,0,.21*waist,.18,.14*waist);part(0,.88,0,.25*hip,.18,.17*hip);
  for(const s of [-1,1]){part(s*.35,1.27,0,.08,.25,.08);part(s*.39,.94,0,.065,.22,.065);part(s*.13,.5,0,.105,.36,.11);part(s*.13,.04,.045,.09,.1,.16);}
  const grid=new THREE.GridHelper(3,18,0xc5bbd2,0xded6e8);grid.position.y=-.05;scene.add(grid);
  let frame=0;const render=()=>{frame=requestAnimationFrame(render);controls.update();renderer.render(scene,camera);};render();
  const resize=new ResizeObserver(()=>{renderer.setSize(el.clientWidth,260);camera.aspect=el.clientWidth/260;camera.updateProjectionMatrix();});resize.observe(el);
  return()=>{cancelAnimationFrame(frame);resize.disconnect();controls.dispose();scene.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});material.dispose();renderer.dispose();el.replaceChildren();};
 },[profile.measures,profile.mode]);
 return <><div className="avatar" ref={ref}/><p className="small">Drag to rotate · schematic illustration, not a body simulation. Recommendations use only entered measurements.</p></>;
}
