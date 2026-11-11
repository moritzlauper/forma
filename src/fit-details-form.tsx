import React,{useEffect,useState} from 'react';
export type FitDetails={size:string;note:string;issue:string};
const issues=['Fits','Too tight','Too wide','Too short','Sleeves too short','Too long'];
/** Shared form for bookmarks, product feedback and saved fit details. */
export function FitDetailsForm({initial,sizeRequired=false,allowIssues=false,save,remove,children}:{initial:FitDetails;sizeRequired?:boolean;allowIssues?:boolean;save:(details:FitDetails)=>Promise<void>;remove?:()=>Promise<void>;children?:React.ReactNode}){
 const [size,Size]=useState(initial.size),[note,Note]=useState(initial.note),[issue,Issue]=useState(initial.issue),[busy,Busy]=useState(false),[message,Message]=useState('');
 useEffect(()=>{Size(initial.size);Note(initial.note);Issue(initial.issue);},[initial.size,initial.note,initial.issue]);
 const changed=size!==initial.size||note!==initial.note||issue!==initial.issue;
 const valid=(!sizeRequired||!!size.trim())&&(!allowIssues||!!note.trim()||!!issue);
 async function submit(){if(busy||!changed||!valid)return;Busy(true);Message('');try{await save({size:size.trim(),note:note.trim(),issue});Message('Feedback saved.');}catch(e){Message(e instanceof Error?e.message:'Could not save. Please try again.');}finally{Busy(false);}}
 return <div className="fit-details-form">
 <label>{sizeRequired?'Size you wore':'Size you wore · optional'}<input disabled={busy} value={size} onChange={e=>Size(e.target.value)} placeholder="e.g. L or 33 x 32"/></label>
 <label>Fit details · optional<textarea rows={3} disabled={busy} maxLength={1200} value={note} onChange={e=>Note(e.target.value)} placeholder="What fits well? What would you change?"/></label>
 {allowIssues&&<details><summary>Quick labels · optional</summary><div className="segments">{issues.map(value=><button key={value} disabled={busy} aria-pressed={issue===value} onClick={()=>Issue(issue===value?'':value)}>{value==='Fits'?'Fits well':value}</button>)}</div></details>}
 <div className="actions"><button className="primary" disabled={busy||!changed||!valid} onClick={submit}>{busy?'Saving…':'Save feedback'}</button>{remove&&<button disabled={busy} onClick={async()=>{Busy(true);try{await remove();Message('Removed.');}catch{Message('Could not remove. Please try again.');}finally{Busy(false);}}}>Remove</button>}</div>
 {allowIssues&&<p className="small">Your worn size and note are enough. No quick label required.</p>}
 {message&&<p className="small" role="status">{message}</p>}{children}
 </div>;
}
