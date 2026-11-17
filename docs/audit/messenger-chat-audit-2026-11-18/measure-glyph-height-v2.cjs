/* eslint-disable @typescript-eslint/no-require-imports -- 감사 측정 스크립트(Node CJS) */
const fs=require('fs');const {PNG}=require(process.cwd()+'/node_modules/pngjs');
const [,,dir,jsonSpec]=process.argv;const spec=JSON.parse(fs.readFileSync(jsonSpec,'utf8'));const cache={};
const load=p=>cache[p]||(cache[p]=PNG.sync.read(fs.readFileSync(dir+'/'+p)));
function ext(p,[x0,y0,x1,y1],thr=60){const im=load(p);const g=(x,y)=>{const i=(y*im.width+x)*4;return .299*im.data[i]+.587*im.data[i+1]+.114*im.data[i+2];};
const b=[];for(let x=x0;x<x1;x++){b.push(g(x,y0),g(x,y1-1));}b.sort((a,c)=>a-c);const bg=b[b.length>>1];
let ys=[];for(let y=y0;y<y1;y++){for(let x=x0;x<x1;x++){if(Math.abs(g(x,y)-bg)>thr){ys.push(y);break;}}}
return ys.length?{top:ys[0],bot:ys.at(-1),h:ys.at(-1)-ys[0]+1}:null;}
for(const [n,p,b] of spec)console.log(n.padEnd(34),JSON.stringify(ext(p,b)));
