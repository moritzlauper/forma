import React,{useEffect,useState} from 'react';
import type {Profile} from './fit';
export function ProfileBasics({profile,save}:{profile:Profile;save:(profile:Profile)=>Promise<void>}){
 const [draft,Draft]=useState(profile),[busy,Busy]=useState(false),[message,Message]=useState('');
 useEffect(()=>Draft(profile),[profile]);
 const context=draft.context||{height:0,weight:0,waistLabel:'',shoeSizeEU:'',style:'',concerns:[]};
 function field(key:string,value:unknown){Draft({...draft,context:{...context,[key]:value}});Message('');}
 return <div className="card"><h2>Body & usual sizes</h2><p className="small">Use what you know. These are editable at any time.</p><div className="grid">
 <label>Height · cm<input type="number" min="100" max="250" value={context.height||''} onChange={e=>field('height',Number(e.target.value))}/></label>
 <label>Weight · kg<input type="number" min="20" max="300" value={context.weight||''} onChange={e=>field('weight',Number(e.target.value))}/></label>
 <label>Usual jeans size<input value={context.waistLabel} onChange={e=>field('waistLabel',e.target.value)} placeholder="e.g. W33 / W34"/></label>
 <label>Usual shoe size · EU<input value={context.shoeSizeEU||''} onChange={e=>field('shoeSizeEU',e.target.value)} placeholder="e.g. 45"/></label>
 </div><label>Build & proportions<textarea rows={2} maxLength={1000} value={context.bodyShape||''} onChange={e=>field('bodyShape',e.target.value)} placeholder="e.g. Broad shoulders and chest relative to my height"/></label><p className="small">Your description helps assess room and proportions. It does not replace measured dimensions.</p><h2>Fit & style</h2><div className="grid"><label>Preferred fit<select value={draft.fit} onChange={e=>Draft({...draft,fit:e.target.value as Profile['fit']})}><option value="close">Close</option><option value="regular">Regular</option><option value="relaxed">Loose</option><option value="oversized">Oversized</option></select></label><label>Style<input value={context.style} maxLength={300} onChange={e=>field('style',e.target.value)} placeholder="e.g. Urban / Alternative"/></label></div>
 <button className="primary" disabled={busy||JSON.stringify(draft)===JSON.stringify(profile)} onClick={async()=>{Busy(true);try{await save({...draft,context:{...context,concerns:context.concerns.map(s=>s.trim()).filter(Boolean)}});Message('Profile saved.');}catch{Message('Could not save. Please try again.');}finally{Busy(false);}}}>{busy?'Saving…':'Save profile'}</button>{message&&<p role="status" className="small">{message}</p>}</div>;
}
