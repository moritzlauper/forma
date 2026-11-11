import type {Connection} from './page-connection';
import type {Assessment} from './assessment';
export type ScanState={status:'reading'|'error';at:number;error?:string};
export function idlePageStatus(connection:Connection,scan:ScanState|undefined,assessment:Assessment|undefined,now=Date.now()){
 if(assessment?.status==='ready')return {title:'Assessment completed',text:'Your last completed assessment is available.'};
 if(connection.status==='permission')return {title:'Connect this shop',text:connection.message};
 if(connection.status==='unsupported')return {title:'Open a product page',text:connection.message};
 if(connection.status==='error')return {title:'Page connection failed',text:connection.message};
 if(scan?.status==='error')return {title:'Page could not be read',text:scan.error||'Press Refresh to read this page again.'};
 if(assessment?.status==='error')return {title:'AI assessment failed',text:assessment.error||'Press Refresh to retry.'};
 if(assessment?.status==='blocked')return {title:'AI assessment needs attention',text:assessment.error||'Check your AI settings.'};
 if(assessment?.status==='running')return !assessment.startedAt||now-assessment.startedAt>45000
  ?{title:'Assessment interrupted',text:'No completed answer arrived. Press Refresh to reconnect and retry.'}
  :{title:'Reviewing garment and fit…',text:'The AI request is running. Results appear here when it finishes.'};
 const at=scan?.at||connection.at;
 if(now-at>10000)return {title:'Page scan did not respond',text:'No product data has arrived. Press Refresh to reconnect. No AI request is confirmed.'};
 return {title:connection.status==='checking'?'Connecting to this page…':'Reading the size guide…',text:'FORMA is checking the product page locally. No AI request has started yet.'};
}
