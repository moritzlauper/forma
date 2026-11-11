/** Finer display bands for internal estimates; never a guarantee of fit. */
export function fitRating(score:number|null|undefined,eligible=true):string{
 if(!eligible)return 'Not recommended';
 if(score==null||!Number.isFinite(score))return 'Not enough data';
 if(score>=90)return 'Excellent fit';
 if(score>=85)return 'Very good fit';
 if(score>=80)return 'Good fit';
 if(score>=75)return 'Mostly good fit';
 if(score>=70)return 'Fair fit';
 if(score>=60)return 'Mixed fit';
 if(score>=40)return 'Poor fit';
 return 'Very poor fit';
}

export const fitLabels=['Very poor fit','Poor fit','Mixed fit','Fair fit','Mostly good fit','Good fit','Very good fit','Excellent fit','Not recommended','Not enough data','Confirmed good fit'] as const;
export type OverallFit={label:typeof fitLabels[number];reason:string;score?:number|null};
export function overallFit(review:{size?:string|null;basis?:string;overallFit?:OverallFit;ranked?:{size:string;overall:number|null;eligible:boolean;reason:string}[]}):OverallFit{
 if(review.overallFit)return review.overallFit;
 if(review.basis==='tried'&&review.size)return {label:'Confirmed good fit',reason:'Based on your own experience with this item.'};
 return {label:'Not enough data',reason:'Cut and proportions have not been assessed independently of size.'};
}

/** Display the existing estimate on a ten-point scale, without inventing missing scores. */
export function fitScore(score:number|null|undefined,eligible=true):string {
 if(!eligible)return 'Not recommended';
 if(score==null||!Number.isFinite(score))return 'Not enough data';
 return (Math.max(0,Math.min(100,score))/10).toFixed(1)+'/10';
}
export function overallScore(review:Parameters<typeof overallFit>[0]):string {
 if(review.overallFit?.score!=null)return fitScore(review.overallFit.score*10);
 return review.basis==='tried'?'Confirmed by you':'Not enough data';
}
