import React,{useState} from 'react';
export function ProfileNotes({saved,ready,save,apply,canApply,draft,Draft}:{draft:string;Draft:(value:string)=>void;saved:string;ready:boolean;save:(text:string)=>Promise<void>;apply:()=>Promise<void>;canApply:boolean}){
 const [edit,Edit]=useState<string|null>(null),[busy,Busy]=useState(false),[message,Message]=useState('');
 async function persist(text:string,editing=false){
  if(busy)return;Busy(true);Message('');
  try{await save(text);if(editing)Edit(null);else Draft('');Message('Saved. FORMA will use these notes in future assessments.');}
  catch(e){Message(e instanceof Error?e.message:'Could not save. Your text is still here; please retry.');}
  finally{Busy(false);}
 }
 const next=[saved.trim(),draft.trim()].filter(Boolean).join('\n\n');
 return <div className="profile-notes">
 <label>Add a fit note<textarea rows={4} maxLength={6000} value={draft} disabled={busy||!ready} onChange={e=>{Draft(e.target.value);Message('');}} placeholder="What should FORMA remember about your fit? English or German."/></label>
 <button className="primary" disabled={busy||!ready||!draft.trim()||next.length>6000} onClick={()=>persist(next)}>{busy?'Saving…':'Save note'}</button>
 <p className="small">Saved for future assessments. No AI request needed.</p>
 {next.length>6000&&<p role="alert">Your saved notes would exceed 6000 characters. Edit the saved notes below to make room.</p>}
 {message&&<p role="status" className="small">{message}</p>}
 <details className="card"><summary>Saved fit notes{saved?'':' · none yet'}</summary>
 {edit===null?<><p className="saved-notes">{saved||'Add a note above. It will appear here after saving.'}</p>{saved&&<button onClick={()=>Edit(saved)}>Edit saved notes</button>}</>:<><label>Saved notes<textarea rows={6} maxLength={6000} value={edit} disabled={busy} onChange={e=>Edit(e.target.value)}/></label><div className="actions"><button className="primary" disabled={busy||edit===saved} onClick={()=>persist(edit,true)}>Save changes</button><button disabled={busy} onClick={()=>Edit(null)}>Cancel</button></div></>}
 </details>
 {saved&&canApply&&<button onClick={async()=>{try{await apply();}catch(e){Message(e instanceof Error?e.message:'Could not update assessment.');}}}>Update this item with saved notes</button>}
 </div>;
}
