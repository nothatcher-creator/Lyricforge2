export interface AppVersionBounds{minAppVersion:string;maxAppVersion?:string;}

type ParsedSemVer={major:number;minor:number;patch:number};
const SEMVER=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function parseSemVer(value:string):ParsedSemVer{
 const match=SEMVER.exec(value);
 if(!match)throw new Error(`Invalid semantic version: ${value}`);
 return {major:Number(match[1]),minor:Number(match[2]),patch:Number(match[3])};
}

export function compareSemVer(a:string,b:string):number{
 const left=parseSemVer(a),right=parseSemVer(b);
 if(left.major!==right.major)return left.major-right.major;
 if(left.minor!==right.minor)return left.minor-right.minor;
 return left.patch-right.patch;
}

export function isAppVersionCompatible(appVersion:string,bounds:AppVersionBounds):boolean{
 if(compareSemVer(appVersion,bounds.minAppVersion)<0)return false;
 if(bounds.maxAppVersion&&compareSemVer(appVersion,bounds.maxAppVersion)>0)return false;
 return true;
}
