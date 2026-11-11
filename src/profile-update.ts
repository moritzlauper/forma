import {productIdentity} from './good-fits';
import type {Profile} from './fit';

// Additive personal updates never replace measurements or saved fit evidence.
export function applyProfileUpdate(profile:Profile, value:unknown):Profile {
 const update=value as {kind?:unknown;bodyShape?:unknown;fitNotes?:unknown};
 if(!update||update.kind!=='forma-profile-update'||typeof update.bodyShape!=='string'||!update.bodyShape.trim()||update.bodyShape.length>1000)throw Error('Invalid profile update.');
 if(update.fitNotes!==undefined&&(typeof update.fitNotes!=='string'||update.fitNotes.length>6000))throw Error('Invalid fit notes in profile update.');
 return {...profile,context:{height:0,weight:0,waistLabel:'',style:'',concerns:[],...profile.context,bodyShape:update.bodyShape.trim()}};
}

export function profileFeedbackUpdate(value:unknown,previous:import('./assessment').Feedback[]){
 const entries=(value as {feedback?:unknown}).feedback;if(entries===undefined)return previous;
 if(!Array.isArray(entries)||entries.length>20)throw Error('Invalid feedback update.');
 for(const f of entries)if(!f||typeof f.name!=='string'||f.name.length>200||typeof f.url!=='string'||!/^https?:\/\//.test(f.url)||typeof f.size!=='string'||f.size.length>30||typeof f.value!=='string'||f.value.length>200||typeof f.note!=='string'||f.note.length>2000)throw Error('Invalid feedback update.');
 return [...entries,...previous.filter(old=>!entries.some(f=>productIdentity(f.url)===productIdentity(old.url||'')&&f.size===old.size))].slice(0,100);
}
