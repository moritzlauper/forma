/** Chrome can deliver a late rejected API promise after unloading this world.
 * Only handle that shutdown signal when our own runtime is actually gone.
 * Ordinary errors, including the same message in a live runtime, remain visible.
 */
export function watchRuntimeInvalidation(target:Pick<Window,'addEventListener'>,runtime:Pick<typeof chrome.runtime,'id'>,stop:()=>void){
 const disconnected=()=>{try{return !runtime.id;}catch{return true;}};
 target.addEventListener('unhandledrejection',((event:PromiseRejectionEvent)=>{
  const reason=event.reason;const message=typeof reason==='string'?reason:reason?.message;
  if(typeof message!=='string'||!/^Extension context invalidated\.?$/i.test(message.trim())||!disconnected())return;
  event.preventDefault();stop();
 }) as EventListener);
 // This listener intentionally outlives reader disposal: outstanding Chrome
 // promises can reject later. The document/world owns its lifetime.
}
