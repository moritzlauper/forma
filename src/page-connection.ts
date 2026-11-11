export const READER_PROTOCOL='forma-reader-v7';
export type Connection={status:'checking'|'connected'|'permission'|'unsupported'|'error';message:string;at:number};
export function deadline<T>(work:Promise<T>,ms:number,message:string):Promise<T>{
 let timer:ReturnType<typeof setTimeout>;
 return Promise.race([work,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error(message)),ms);})]).finally(()=>clearTimeout(timer));
}
// Opening the panel must repair a missing reader in an already-open tab.
// Dynamic registration alone only covers subsequent document loads.
export function createPageConnector(api:Pick<typeof chrome,'permissions'|'scripting'|'tabs'>=chrome,timeout=3000){
 const pending=new Map<string,Promise<Connection>>();
 return (tab:Pick<chrome.tabs.Tab,'id'|'url'>,options:{force?:boolean;retry?:boolean;fresh?:boolean}={}):Promise<Connection>=>{
  const key=JSON.stringify([tab.id,tab.url,options]);const previous=pending.get(key);if(previous)return previous;
  const task=(async():Promise<Connection>=>{
   const result=(status:Connection['status'],message:string):Connection=>({status,message,at:Date.now()});
   if(!tab.id||!tab.url||!/^https?:/.test(tab.url))return result('unsupported','Open a shop product page. Chrome settings and extension pages cannot be analysed.');
   const id=tab.id;
   try{
    if(!await deadline(api.permissions.contains({origins:[new URL(tab.url).origin+'/*']}),timeout,'Could not check website access.'))return result('permission','Website access is not enabled for this shop. Click Analyse this page to connect it.');
    const ping=()=>deadline(api.tabs.sendMessage(id,{type:'forma-ping'},{frameId:0}),timeout,'The page reader did not respond.');
    let reader=await ping().catch(()=>null);
    if(reader?.protocol!==READER_PROTOCOL){
     // An invalidated extension context can leave its window guard behind.
     // Remove only our reader before reinjecting, even when its version matches.
     await deadline(api.scripting.executeScript({target:{tabId:id},func:()=>{
      const state=window as unknown as {formaReader?:{dispose?:()=>void}};
      try{state.formaReader?.dispose?.();}catch{}
      delete state.formaReader;
     }}),timeout,'The old page reader could not be reset.');
     await deadline(api.scripting.executeScript({target:{tabId:id},files:['content.js']}),timeout,'The page reader could not start. Refresh the shop page and try again.');
     reader=await ping();
    }
    if(reader?.protocol!==READER_PROTOCOL)throw Error('The page reader is outdated. Refresh the shop page and try again.');
    const ack=await deadline(api.tabs.sendMessage(id,{type:'refresh',...options},{frameId:0}),timeout,'The page scan did not start. Press Refresh to reconnect.');
    if(!ack?.accepted)throw Error('The page scan did not start. Press Refresh to reconnect.');
    return result('connected','Reading product details and checking the size guide…');
   }catch{return result('error','Could not connect to this page. Press Refresh to reconnect, or reload the shop page.');}
  })().finally(()=>pending.delete(key));pending.set(key,task);return task;
 };
}
