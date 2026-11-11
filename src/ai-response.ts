// Never repair partial JSON: a completed-looking size can precede missing caveats.
export async function readAIJSON(response:Response,local:boolean):Promise<unknown>{
 let data:any;
 try{data=await response.json();}catch{throw Error('The AI service returned an incomplete response. Press Refresh to try again.');}
 const stop=local?data?.done_reason:data?.stop_reason;
 if(stop==='max_tokens'||stop==='length'||local&&data?.done===false)throw Error('The AI response was cut off before completion. No recommendation shown. Press Refresh to try again.');
 if(stop==='refusal')throw Error('The AI declined this assessment. No recommendation shown.');
 if(stop&&stop!==(local?'stop':'end_turn'))throw Error('The AI did not finish its assessment. Press Refresh to try again.');
 const blocks=Array.isArray(data?.content)?data.content:[];
 const raw=local?data?.message?.content:blocks.filter((b:any)=>b?.type==='text'&&typeof b.text==='string').map((b:any)=>b.text).join('');
 if(typeof raw!=='string'||!raw.trim())throw Error('The AI returned no assessment. Press Refresh to try again.');
 try{return JSON.parse(raw.trim().replace(/^```(?:json)?\s*|\s*```$/g,''));}
 catch{throw Error('The AI returned an incomplete or invalid answer. No recommendation shown. Press Refresh to try again.');}
}
