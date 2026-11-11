// Old content scripts survive an extension reload in already-open shop tabs.
// Use the callback API and consume lastError; no Chrome-owned rejected Promise
// should escape while its runtime is being torn down.
export function createRuntimeMessenger(runtime:Pick<typeof chrome.runtime,'id'|'lastError'|'sendMessage'>,onInvalidated:()=>void){
 let closed=false;const pending=new Set<()=>void>();
 const close=()=>{if(closed)return;closed=true;for(const cancel of pending)cancel();pending.clear();};
 const invalidate=()=>{if(closed)return;close();onInvalidated();};
 const alive=()=>{if(closed)return false;try{if(runtime.id)return true;}catch{}invalidate();return false;};
 function send(message:unknown):Promise<any>{
  if(!alive())return Promise.resolve(undefined);
  return new Promise((resolve,reject)=>{
   let done=false;const finish=(value?:unknown,error?:Error)=>{if(done)return;done=true;pending.delete(cancel);if(error)reject(error);else resolve(value);};
   const cancel=()=>finish();pending.add(cancel);
   const fail=(error:unknown)=>{const text=error instanceof Error?error.message:String(error);if(/extension context invalidated/i.test(text)||!alive()){invalidate();finish();}else finish(undefined,Error(text));};
   try{
    const returned=runtime.sendMessage(message,response=>{
     // Read lastError even if this request was cancelled during invalidation.
     try{const error=runtime.lastError?.message;if(error){fail(Error(error));return;}if(alive())finish(response);else finish();}catch(error){fail(error);}
    }) as unknown as Promise<unknown>|undefined;
    // Some runtime wrappers still return a Promise with a callback supplied.
    // Observe its rejection too, instead of relying on that implementation detail.
    if(returned&&typeof returned.then==='function')returned.catch(fail);
   }catch(error){fail(error);}
  });
 }
 return {send,alive,close};
}
