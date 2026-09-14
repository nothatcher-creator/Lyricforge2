export type TimelineTouchGesture='tap'|'pan-x'|'pan-y';

export function classifyTimelineTouchGesture(dx:number,dy:number,threshold=8):TimelineTouchGesture{
  if(Math.hypot(dx,dy)<threshold)return 'tap';
  return Math.abs(dy)>Math.abs(dx)?'pan-y':'pan-x';
}
