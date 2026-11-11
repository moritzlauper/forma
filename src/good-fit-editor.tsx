import React,{useEffect,useState} from 'react';
import type {GoodFit} from './good-fits';
export function GoodFitEditor({entry,save,remove}:{entry:GoodFit;save:(entry:GoodFit)=>Promise<void>;remove:()=>Promise<void>}){
 const [size,Size]=useState(entry.size),[reason,Reason]=useState(entry.reason),[busy,Busy]=useState(false),[message,Message]=useState('');
 useEffect(()=>{Size(entry.size);Reason(entry.reason);},[entry.url,entry.size,entry.reason]);
 const changed=size!==entry.size||reason!==entry.reason;
 const run=async(action:()=>Promise<void>,success:string)=>{Busy(true);Message('');try{await action();Message(success);}catch{Message('Could not save this good fit. Try again.');}finally{Busy(false);}};
 return <div className="good-fit-editor"><label>Size that actually fits you · optional{entry.product?<select value={size} onChange={e=>Size(e.target.value)}><option value="">Not recorded</option>{entry.product.sizes.map(s=><option key={s.label} value={s.label}>{s.label}</option>)}</select>:<input value={size} onChange={e=>Size(e.target.value)} placeholder="Your worn size"/>}</label><label>What do you like? · optional<textarea rows={2} maxLength={1200} value={reason} onChange={e=>Reason(e.target.value)} placeholder="Great sleeve length, roomy without being too long…"/></label><p className="small">Without a confirmed size, this is a preference example. With your size and its chart, FORMA can compare measurements on future products.</p><div className="actions"><button disabled={busy||!changed} onClick={()=>run(()=>save({...entry,size,reason}),'Details saved. Future assessments use this example.')}>Save details</button><button disabled={busy} onClick={()=>run(remove,'Removed.')}>Remove</button></div>{message&&<p className="small" role="status">{message}</p>}</div>;
}
