/* eslint-disable @typescript-eslint/no-require-imports -- 감사 측정 스크립트(Node CJS) */
const fs=require('fs');const {PNG}=require(process.cwd()+'/node_modules/pngjs');
const dir=process.argv[2];const cache={};
function load(p){return cache[p]||(cache[p]=PNG.sync.read(fs.readFileSync(dir+'/'+p)));}
function ext(p,[x0,y0,x1,y1],thr=60){const im=load(p);const g=(x,y)=>{const i=(y*im.width+x)*4;return .299*im.data[i]+.587*im.data[i+1]+.114*im.data[i+2];};
const border=[];for(let x=x0;x<x1;x++){border.push(g(x,y0),g(x,y1-1));}border.sort((a,b)=>a-b);const bg=border[border.length>>1];
let ys=[],xs=new Set();for(let y=y0;y<y1;y++){let hit=false;for(let x=x0;x<x1;x++){if(Math.abs(g(x,y)-bg)>thr){hit=true;xs.add(x);}}if(hit)ys.push(y);}
if(!ys.length)return null;const xa=[...xs];return {top:ys[0],bot:ys[ys.length-1],h:ys[ys.length-1]-ys[0]+1,x:Math.min(...xa),x2:Math.max(...xa)};}
const L=[
 ["TG date pill 11월 12일","x-tg-room.png",[350,866,452,896]],
 ["TG call title 취소된 전화 (bold)","x-tg-room.png",[458,914,575,948]],
 ["TG header name K K","x-tg-room.png",[146,50,190,78]],
 ["TG header status","x-tg-room.png",[146,79,366,100]],
 ["TG call time 19:00","x-tg-room.png",[486,952,535,974]],
 ["TG list name 공장장","x-tg-list.png",[100,465,165,495]],
 ["TG list preview 발신 전화","x-tg-list.png",[133,498,215,527]],
 ["DB date pill","x-dibay-room.png",[340,804,462,830]],
 ["DB bubble 머리염색","x-dibay-room.png",[84,1102,160,1135]],
 ["DB bubble 넵ㅎㅎ","x-dibay-room.png",[708,1006,775,1038]],
 ["DB time 9:22 PM","x-dibay-room.png",[176,1124,236,1144]],
 ["DB header name 김양수","x-dibay-room.png",[126,45,190,73]],
 ["DB header status","x-dibay-room.png",[126,74,312,96]],
 ["DB sender name","x-dibay-room.png",[72,1070,120,1092]],
 ["DB system pill 1:1 대화","x-dibay-room.png",[352,126,448,150]],
 ["DB list name 김양수","x-list.png",[100,1062,160,1092]],
 ["DB list preview 네네","x-list.png",[100,1095,200,1122]],
];
for(const [n,p,b] of L)console.log(n.padEnd(34),JSON.stringify(ext(p,b)));
