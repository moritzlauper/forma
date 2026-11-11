import React from 'react';
import type {ScoredSize} from './scoring';
import {fitRating} from './fit-rating';
export function FitComparison({scores}:{scores:ScoredSize[]}){
 return <details className="fit-comparison"><summary>Compare sizes</summary><p className="small">Estimated fit based on your profile and the available product details.</p>{scores.map(score=><div className="fit-comparison-row" key={score.size}><div className="fit-rating-row"><strong>Size {score.size}</strong><span>{fitRating(score.overall,score.eligible)}</span></div><p className="small">{score.reason}</p>{score.eligible&&<details><summary>Fit details</summary><dl>{(['width','length','style','sleeves'] as const).filter(k=>score[k]!==null).map(k=><div key={k}><dt>{k==='style'?'Cut':k[0].toUpperCase()+k.slice(1)}</dt><dd>{fitRating(score[k])}</dd></div>)}</dl>{score.assessed<score.applicable&&<p className="small">Some fit details could not be checked.</p>}</details>}</div>)}</details>;
}
