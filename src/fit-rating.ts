/** User-facing bands for internal comparison scores, not fit probabilities. */
export function fitRating(score:number|null|undefined,eligible=true):string{
 if(!eligible)return 'Not recommended';
 if(score==null||!Number.isFinite(score))return 'Not enough data';
 if(score>=85)return 'Very good fit';
 if(score>=70)return 'Good fit';
 if(score>=50)return 'Mixed fit';
 return 'Poor fit';
}
