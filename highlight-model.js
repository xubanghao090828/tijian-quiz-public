(function(root){
  'use strict';
  const backgrounds={yellow:'#ffe653',lime:'#c8ff47',mint:'#72f6bd',cyan:'#64e9ff',blue:'#91bfff',purple:'#c3a2ff',pink:'#ff9ed4',orange:'#ffba67',red:'#ff9299',navy:'#234786'};
  const inks={dark:'#10141c',white:'#ffffff',yellow:'#ffe653',cyan:'#64e9ff',pink:'#ff9ed4',red:'#ff717d',green:'#8dff9d',purple:'#c3a2ff',blue:'#91bfff',original:'inherit'};
  const uuid=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/.test(value);
  function valid(item){
    return !!(item&&uuid(item.id)&&uuid(item.deviceId)&&typeof item.questionId==='string'&&item.questionId.length>0&&item.questionId.length<=120
      &&typeof item.text==='string'&&item.text.length>0&&item.text.length<=12000
      &&typeof item.name==='string'&&item.name.length<=100&&Number.isSafeInteger(item.number)&&item.number>=1
      &&Number.isSafeInteger(item.createdAt)&&item.createdAt>=0&&Number.isSafeInteger(item.updatedAt)&&item.updatedAt>=item.createdAt&&item.updatedAt<=8640000000000000
      &&['marker','ink','both'].includes(item.style)&&Object.hasOwn(backgrounds,item.bgColor)&&Object.hasOwn(inks,item.inkColor)
      &&Number.isInteger(item.opacity)&&item.opacity>=20&&item.opacity<=100
      &&(item.deleted===undefined||typeof item.deleted==='boolean')&&Array.isArray(item.strokes)&&item.strokes.length<=500
      &&item.strokes.every(s=>s&&Number.isInteger(s.start)&&Number.isInteger(s.end)&&s.start>=0&&s.end>s.start&&s.end<=item.text.length));
  }
  function clean(item){const {id,deviceId,questionId,text,name,number,createdAt,updatedAt,style,bgColor,inkColor,opacity,strokes}=item;return {id,deviceId,questionId,text,name,number,createdAt,updatedAt,style,bgColor,inkColor,opacity,strokes:strokes.map(({start,end})=>({start,end})),deleted:!!item.deleted};}
  function merge(left,right){
    if(!left)return clean(right);if(!right)return clean(left);
    const a=clean(left),b=clean(right),rank=b.updatedAt-a.updatedAt||Number(b.deleted)-Number(a.deleted)||b.deviceId.localeCompare(a.deviceId)||JSON.stringify(b).localeCompare(JSON.stringify(a));
    return rank>0?b:a;
  }
  function mergeLists(left=[],right=[]){const items=new Map(left.filter(valid).map(item=>[item.id,{...clean(item),dirty:!!item.dirty}]));for(const item of right.filter(valid)){const old=items.get(item.id);items.set(item.id,{...merge(old,item),dirty:!!(old?.dirty||item.dirty)})}return [...items.values()];}
  root.TijianHighlights={backgrounds,inks,valid,clean,merge,mergeLists};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.TijianHighlights;
})(globalThis);
