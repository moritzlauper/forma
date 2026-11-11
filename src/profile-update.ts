import type {Profile} from './fit';

// Additive personal updates never replace measurements or saved fit evidence.
export function applyProfileUpdate(profile:Profile, value:unknown):Profile {
 const update=value as {kind?:unknown;bodyShape?:unknown;fitNotes?:unknown};
 if(!update||update.kind!=='forma-profile-update'||typeof update.bodyShape!=='string'||!update.bodyShape.trim()||update.bodyShape.length>1000)throw Error('Invalid profile update.');
 if(update.fitNotes!==undefined&&(typeof update.fitNotes!=='string'||update.fitNotes.length>6000))throw Error('Invalid fit notes in profile update.');
 return {...profile,context:{height:0,weight:0,waistLabel:'',style:'',concerns:[],...profile.context,bodyShape:update.bodyShape.trim()}};
}
