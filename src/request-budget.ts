export const DEFAULT_REQUEST_LIMIT=100;
export type BudgetSettings={limit?:number;limitVersion?:number;unlimited?:boolean};
export function hasNoRequestCap(settings?:unknown):boolean{return !!settings&&typeof settings==='object'&&(settings as BudgetSettings).unlimited===true;}
export function requestLimit(settings?:unknown):number{
 const config=settings&&typeof settings==='object'?settings as BudgetSettings:undefined;
 const value=config?.limit;
 if(value===undefined||!Number.isSafeInteger(value)||value!<0)return DEFAULT_REQUEST_LIMIT;
 // The original default was stored as 10, with no distinction from a custom
 // value. Migrate it once; versioned custom limits, including zero, stay put.
 return config?.limitVersion!==1&&value===10?DEFAULT_REQUEST_LIMIT:value!;
}
export function additionalRequests(limit:number,used:number):number{return Math.max(limit,used)+100;}
export type RequestBudget={allowed:boolean;used:number;limit:number};
type Storage={get(keys:string[]):Promise<Record<string,any>>;set(values:Record<string,unknown>):Promise<unknown>};
export function createRequestBudget(storage:Storage){
 let queue=Promise.resolve();
 return ():Promise<RequestBudget>=>{
  const result=queue.then(async()=>{
   const data=await storage.get(['settings','aiCount','formaEnabled']);
   const limit=requestLimit(data.settings);
   const used=Number.isSafeInteger(data.aiCount)&&data.aiCount>=0?data.aiCount:0;
   if(data.formaEnabled===false)return {allowed:false,used,limit};
   if(!hasNoRequestCap(data.settings)&&used>=limit)return {allowed:false,used,limit};
   await storage.set({aiCount:used+1});
   return {allowed:true,used:used+1,limit};
  });
  queue=result.then(()=>{},()=>{});
  return result;
 };
}
