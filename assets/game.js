function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function shuffle(arr,rnd){for(let i=arr.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));const t=arr[i];arr[i]=arr[j];arr[j]=t}return arr}
function orth(n,c){const r=(c/n)|0,k=c%n,o=[];if(r>0)o.push(c-n);if(r<n-1)o.push(c+n);if(k>0)o.push(c-1);if(k<n-1)o.push(c+1);return o}
function touchesTent(n,tent,c){const r=(c/n)|0,k=c%n;for(let dr=-1;dr<=1;dr++)for(let dk=-1;dk<=1;dk++){if(!dr&&!dk)continue;const rr=r+dr,kk=k+dk;if(rr>=0&&rr<n&&kk>=0&&kk<n&&tent[rr*n+kk])return true}return false}

/* ---------- Campsite (Tents & Trees) ---------- */
const Camp={
  size(level){return level<=3?5:level<=8?6:level<=16?7:8},
  generate(n,seed){
    const rnd=mulberry32(seed),N=n*n,target=Math.round(N*0.2);let last=null;
    for(let attempt=0;attempt<400;attempt++){
      const tree=new Uint8Array(N),tent=new Uint8Array(N);let placed=0;
      for(const c of shuffle([...Array(N).keys()],rnd)){
        if(placed>=target)break;
        if(tree[c]||tent[c]||touchesTent(n,tent,c))continue;
        const opts=orth(n,c).filter(x=>!tree[x]&&!tent[x]);
        if(!opts.length)continue;
        tent[c]=1;tree[opts[Math.floor(rnd()*opts.length)]]=1;placed++;
      }
      const rowC=new Array(n).fill(0),colC=new Array(n).fill(0);
      for(let c=0;c<N;c++)if(tent[c]){rowC[(c/n)|0]++;colC[c%n]++}
      const p={n,tree,sol:tent,rowC,colC};
      if(Camp.count(p,2)===1){p.unique=true;return p}
      last=p;
    }
    return last;
  },
  matching(n,tree,tent){
    const trees=[];for(let c=0;c<n*n;c++)if(tree[c])trees.push(c);
    const owner=new Map();
    const tryT=(t,seen)=>{for(const x of orth(n,t)){if(!tent[x]||seen.has(x))continue;seen.add(x);if(!owner.has(x)||tryT(owner.get(x),seen)){owner.set(x,t);return true}}return false};
    for(const t of trees)if(!tryT(t,new Set()))return false;
    return true;
  },
  count(p,limit){
    const {n,tree,rowC,colC}=p,N=n*n;
    const cand=[];for(let c=0;c<N;c++)if(!tree[c]&&orth(n,c).some(x=>tree[x]))cand.push(c);
    const rowRem=new Array(n).fill(0),colRem=new Array(n).fill(0);
    for(const c of cand){rowRem[(c/n)|0]++;colRem[c%n]++}
    const candIdx=new Map(cand.map((c,i)=>[c,i]));
    const closes=cand.map(()=>[]);
    for(let t=0;t<N;t++)if(tree[t]){let m=-1;for(const x of orth(n,t))if(candIdx.has(x))m=Math.max(m,candIdx.get(x));if(m<0)return 0;closes[m].push(t)}
    const tent=new Uint8Array(N),rowT=new Array(n).fill(0),colT=new Array(n).fill(0);let found=0;
    const treesOk=i=>closes[i].every(t=>orth(n,t).some(x=>tent[x]));
    const rec=i=>{
      if(found>=limit)return;
      if(i===cand.length){
        for(let r=0;r<n;r++)if(rowT[r]!==rowC[r]||colT[r]!==colC[r])return;
        if(Camp.matching(n,tree,tent))found++;return;
      }
      const c=cand[i],r=(c/n)|0,k=c%n;
      rowRem[r]--;colRem[k]--;
      if(rowT[r]<rowC[r]&&colT[k]<colC[k]&&!touchesTent(n,tent,c)){
        tent[c]=1;rowT[r]++;colT[k]++;
        if(treesOk(i))rec(i+1);
        tent[c]=0;rowT[r]--;colT[k]--;
      }
      if(rowT[r]+rowRem[r]>=rowC[r]&&colT[k]+colRem[k]>=colC[k]&&treesOk(i))rec(i+1);
      rowRem[r]++;colRem[k]++;
    };
    rec(0);return found;
  },
  isSolved(p,state){
    const {n,tree,rowC,colC}=p,tent=new Uint8Array(n*n);
    for(let c=0;c<n*n;c++)tent[c]=state[c]===1?1:0;
    const rT=new Array(n).fill(0),cT=new Array(n).fill(0);
    for(let c=0;c<n*n;c++)if(tent[c]){if(touchesTent(n,tent,c))return false;rT[(c/n)|0]++;cT[c%n]++}
    for(let i=0;i<n;i++)if(rT[i]!==rowC[i]||cT[i]!==colC[i])return false;
    return Camp.matching(n,tree,tent);
  }
};

/* ---------- Slide Out (arrow escape) ---------- */
const DIRS=[[0,-1],[1,0],[0,1],[-1,0]];
const Arrows={
  params(level){const cols=Math.min(5+Math.floor((level-1)/3),9);return{cols,rows:Math.min(cols+1+Math.floor(level/6),13),minL:2,maxL:Math.min(3+Math.floor(level/3),9)}},
  generate(cols,rows,minL,maxL,seed){
    const rnd=mulberry32(seed),N=cols*rows,occ=new Int16Array(N).fill(-1);let arrows=[];
    const inside=(x,y)=>x>=0&&y>=0&&x<cols&&y<rows;
    const dirOf=(a,b)=>{const dx=b%cols-a%cols,dy=((b/cols)|0)-((a/cols)|0);return DIRS.findIndex(d=>d[0]===dx&&d[1]===dy)};
    const selfClear=(p,d)=>{const s=new Set(p);let x=p[p.length-1]%cols,y=(p[p.length-1]/cols)|0;for(;;){x+=DIRS[d][0];y+=DIRS[d][1];if(!inside(x,y))return true;if(s.has(y*cols+x))return false}};
    const grow=(s,keep)=>{
      const L=minL+Math.floor(rnd()*(maxL-minL+1)),path=[s],inP=new Set([s]);let last=-1;
      while(path.length<L){
        const c=path[path.length-1],x=c%cols,y=(c/cols)|0,opts=[];
        for(let d=0;d<4;d++){const nx=x+DIRS[d][0],ny=y+DIRS[d][1];if(!inside(nx,ny))continue;const nc=ny*cols+nx;if(occ[nc]!==-1||inP.has(nc))continue;opts.push(d)}
        if(!opts.length)break;
        const d=(last>=0&&opts.includes(last)&&rnd()<0.4)?last:opts[Math.floor(rnd()*opts.length)];
        const nc=(y+DIRS[d][1])*cols+x+DIRS[d][0];path.push(nc);inP.add(nc);last=d;
      }
      if(path.length<2)return;
      const tries=rnd()<0.5?[path,path.slice().reverse()]:[path.slice().reverse(),path];
      for(const p of tries){const d=dirOf(p[p.length-2],p[p.length-1]);if(!selfClear(p,d))continue;
        const id=arrows.length;arrows.push({cells:p,dir:d});for(const c of p)occ[c]=id;
        if(keep()){return}arrows.pop();for(const c of p)occ[c]=-1;}
    };
    const solvable=()=>{const o=occ.slice(),alive=new Set(arrows.map((_,i)=>i));
      while(alive.size){let moved=false;for(const i of [...alive])if(Arrows.blocker(arrows[i],o,cols,rows)<0){for(const c of arrows[i].cells)o[c]=-1;alive.delete(i);moved=true}if(!moved)return false}return true};
    for(const s of shuffle([...Array(N).keys()],rnd))if(occ[s]===-1)grow(s,()=>true);
    // Guarantee solvability: clear greedily; break any deadlock by dropping one stuck arrow.
    const o=occ.slice(),alive=new Set(arrows.map((_,i)=>i));
    while(alive.size){
      let moved=false;
      for(const i of [...alive])if(Arrows.blocker(arrows[i],o,cols,rows)<0){for(const c of arrows[i].cells)o[c]=-1;alive.delete(i);moved=true}
      if(!moved){const ids=[...alive],i=ids[Math.floor(rnd()*ids.length)];arrows[i].drop=true;for(const c of arrows[i].cells){o[c]=-1;occ[c]=-1}alive.delete(i)}
    }
    arrows=arrows.filter(a=>!a.drop);occ.fill(-1);arrows.forEach((a,i)=>{for(const c of a.cells)occ[c]=i});
    // Densify: fill leftover gaps with arrows that keep the board solvable.
    for(let pass=0;pass<3;pass++)for(const s of shuffle([...Array(N).keys()],rnd))if(occ[s]===-1)grow(s,solvable);
    return{cols,rows,arrows};
  },
  // Returns steps until the first cell occupied by another arrow, or -1 when the path to the edge is clear.
  blocker(a,occ,cols,rows){
    const h=a.cells[a.cells.length-1];let x=h%cols,y=(h/cols)|0,k=0;
    for(;;){x+=DIRS[a.dir][0];y+=DIRS[a.dir][1];k++;if(x<0||y<0||x>=cols||y>=rows)return -1;if(occ[y*cols+x]!==-1)return k}
  }
};

const $=s=>document.querySelector(s);
const store={get(k,d){try{const v=localStorage.getItem('cs.'+k);return v==null?d:JSON.parse(v)}catch(e){return d}},set(k,v){try{localStorage.setItem('cs.'+k,JSON.stringify(v))}catch(e){}}};

/* Sound + haptics */
let actx=null,muted=store.get('muted',false);
function tone(f,dur=0.07,type='sine',vol=0.07){if(muted)return;try{actx=actx||new(window.AudioContext||window.webkitAudioContext)();const t=actx.currentTime,o=actx.createOscillator(),g=actx.createGain();o.type=type;o.frequency.setValueAtTime(f,t);g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);o.connect(g).connect(actx.destination);o.start(t);o.stop(t+dur+0.02)}catch(e){}}
function chord(){[523,659,784,1046].forEach((f,i)=>setTimeout(()=>tone(f,0.25,'triangle',0.06),i*90))}
function buzz(ms){try{navigator.vibrate&&navigator.vibrate(ms)}catch(e){}}
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Screens */
function show(id){for(const s of document.querySelectorAll('.screen'))s.hidden=s.id!==id;if(id==='home')renderHome();if(id==='camp')layoutCamp();if(id==='arrows'){layoutArrows();loop()}}
document.querySelectorAll('[data-back]').forEach(b=>b.onclick=()=>{hideOverlay();show('home')});
function fmtTime(ms){const s=Math.floor(ms/1000);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')}

/* Overlay sheet */
function overlay({title,body='',big='',extra='',buttons=[]}){
  const sh=$('#sheet');
  sh.innerHTML=(big?`<div class="big">${big}</div>`:'')+`<h3>${title}</h3>`+(body?`<p>${body}</p>`:'')+extra+'<div class="stack"></div>';
  const st=sh.querySelector('.stack');
  for(const b of buttons){const el=document.createElement('button');el.className='btn'+(b.primary?'':' ghost');el.textContent=b.label;el.onclick=b.action;st.appendChild(el)}
  $('#overlay').hidden=false;
}
function hideOverlay(){$('#overlay').hidden=true;clearInterval(adTimer)}

/* Hints + rewarded-ad placeholder */
let hints=store.get('hints',3),adTimer=null;
function updateHints(){document.querySelectorAll('[data-hints]').forEach(e=>e.textContent='Hint · '+hints);$('#hintBank').textContent=hints+(hints===1?' hint':' hints')+' saved'}
function spendHint(fn){if(hints>0){hints--;store.set('hints',hints);updateHints();fn()}else offerAd('Out of hints','Watch a short ad to get 3 more hints.',()=>{hints+=3;store.set('hints',hints);updateHints()})}
function offerAd(title,body,reward,cancel){overlay({title,body,buttons:[{label:'Watch ad',primary:true,action:()=>playAd(reward)},{label:'Not now',action:()=>{hideOverlay();cancel&&cancel()}}]})}
function playAd(reward){
  let n=3;const draw=()=>overlay({title:'Ad break',big:String(n),extra:'<div class="ad-box">Rewarded ad slot. In the shipped app an ad network plays a 15–30 s video here.</div>'});
  draw();clearInterval(adTimer);adTimer=setInterval(()=>{n--;if(n<=0){hideOverlay();reward()}else draw()},1000);
}

/* Home */
function renderHome(){$('#playCamp').textContent='Level '+store.get('campLevel',1);$('#playArrows').textContent='Level '+store.get('arLevel',1);$('#muteBtn').textContent=muted?'Sound off':'Sound on';updateHints()}
$('#playCamp').onclick=()=>startCamp(store.get('campLevel',1),false);
$('#playDaily').onclick=()=>startCamp(0,true);
$('#playArrows').onclick=()=>startArrows(store.get('arLevel',1));
$('#muteBtn').onclick=()=>{muted=!muted;store.set('muted',muted);renderHome();tone(660)};

/* ================= Campsite ================= */
const SVG_TREE='<svg viewBox="0 0 24 24"><rect x="10.5" y="15" width="3" height="6.5" rx="1" fill="var(--trunk)"/><circle cx="12" cy="10" r="7" fill="var(--tree)"/><circle cx="9.5" cy="7.5" r="2.3" fill="var(--tree-hi)"/></svg>';
const SVG_TENT='<svg viewBox="0 0 24 24"><path d="M12 3.5 21.5 19.5h-19Z" fill="var(--tent)" stroke="var(--tent-dark)" stroke-width="1" stroke-linejoin="round"/><path d="M12 10.5 15.6 19.5H8.4Z" fill="var(--tent-dark)"/></svg>';
const SVG_GRASS='<svg viewBox="0 0 24 24"><path d="M8 17q1-3.5-.4-6M12 17q0-4.5-1.2-8M16 17q-1-3.5.6-6" stroke="var(--grass)" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>';
const camp={};let campTimer=null;
function startCamp(level,daily){
  let n,seed;
  if(daily){const d=new Date();seed=d.getFullYear()*10000+(d.getMonth()+1)*100+d.getDate();n=7;camp.title='Daily · '+d.toLocaleDateString(undefined,{month:'short',day:'numeric'})}
  else{n=Camp.size(level);seed=level*9973+17;camp.title='Level '+level}
  const p=Camp.generate(n,seed);
  Object.assign(camp,{level,daily,p,n,state:new Uint8Array(n*n),hist:[],t0:Date.now(),done:false,els:[]});
  buildCamp();show('camp');renderCamp();
  clearInterval(campTimer);campTimer=setInterval(()=>{if(!camp.done&&!$('#camp').hidden)$('#campSub').textContent=fmtTime(Date.now()-camp.t0)+' · '+n+'×'+n},500);
  $('#campSub').textContent='0:00 · '+n+'×'+n;
}
function buildCamp(){
  const {n,p}=camp,b=$('#campBoard');
  $('#campTitle').textContent=camp.title;
  b.className='camp-board';
  b.style.gridTemplateColumns=b.style.gridTemplateRows=`0.7fr repeat(${n},1fr)`;
  b.innerHTML='';const add=(cls,attrs={})=>{const d=document.createElement('div');d.className=cls;for(const k in attrs)d.dataset[k]=attrs[k];b.appendChild(d);return d};
  add('corner');
  camp.colEls=[];for(let k=0;k<n;k++){const e=add('clue',{col:k});e.textContent=p.colC[k];camp.colEls.push(e)}
  camp.rowEls=[];
  for(let r=0;r<n;r++){
    const e=add('clue',{row:r});e.textContent=p.rowC[r];camp.rowEls.push(e);
    for(let k=0;k<n;k++){const c=r*n+k,el=add('c'+(p.tree[c]?' tree':''),{c});if(p.tree[c])el.innerHTML=SVG_TREE;camp.els[c]=el}
  }
}
function layoutCamp(){
  const st=$('#campStage').getBoundingClientRect(),b=$('#campBoard');
  const size=Math.floor(Math.min(st.width,st.height,520));
  b.style.width=b.style.height=size+'px';
  b.style.setProperty('--fs',Math.round(size/(camp.n+0.7)*0.42)+'px');
}
function renderCamp(){
  const {n,p,state}=camp,tent=new Uint8Array(n*n);
  for(let c=0;c<n*n;c++)tent[c]=state[c]===1?1:0;
  const rT=new Array(n).fill(0),cT=new Array(n).fill(0);
  for(let c=0;c<n*n;c++){
    if(p.tree[c])continue;
    const el=camp.els[c],s=state[c];
    if(el._s!==s){el.innerHTML=s===1?SVG_TENT:s===2?SVG_GRASS:'';el._s=s}
    el.classList.toggle('grass',s===2);
    let bad=false;
    if(s===1){rT[(c/n)|0]++;cT[c%n]++;bad=touchesTent(n,tent,c)||!orth(n,c).some(x=>p.tree[x])}
    el.classList.toggle('bad',bad);
  }
  for(let i=0;i<n;i++){
    camp.rowEls[i].className='clue'+(rT[i]===p.rowC[i]?' done':rT[i]>p.rowC[i]?' over':'');
    camp.colEls[i].className='clue'+(cT[i]===p.colC[i]?' done':cT[i]>p.colC[i]?' over':'');
  }
}
let gesture=null,dragMode=null;
$('#campBoard').addEventListener('pointerdown',e=>{
  if(camp.done)return;
  const el=e.target.closest('[data-c],[data-row],[data-col]');if(!el)return;
  e.preventDefault();
  if(el.dataset.c===undefined){fillLine(el);return}
  const c=+el.dataset.c;if(camp.p.tree[c])return;
  const prev=camp.state[c],next=(prev+1)%3;
  camp.state[c]=next;gesture=[[c,prev]];dragMode=next===2?2:next===0&&prev===2?0:null;
  tone(next===1?520:next===2?380:300,0.05,'triangle');if(next===1)buzz(8);
  renderCamp();
});
$('#campBoard').addEventListener('pointermove',e=>{
  if(!gesture||dragMode===null)return;
  const el=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-c]');if(!el)return;
  const c=+el.dataset.c;if(camp.p.tree[c]||gesture.some(g=>g[0]===c))return;
  const s=camp.state[c];
  if(dragMode===2&&s===0||dragMode===0&&s===2){gesture.push([c,s]);camp.state[c]=dragMode;tone(360,0.03,'triangle',0.04);renderCamp()}
});
addEventListener('pointerup',endGesture);addEventListener('pointercancel',endGesture);
function endGesture(){if(!gesture)return;camp.hist.push(gesture);gesture=null;dragMode=null;checkCamp()}
function fillLine(el){
  const {n,p,state}=camp,isRow=el.dataset.row!==undefined,i=+(isRow?el.dataset.row:el.dataset.col);
  const cells=[...Array(n).keys()].map(j=>isRow?i*n+j:j*n+i);
  const tents=cells.filter(c=>state[c]===1).length;
  if(tents!==(isRow?p.rowC[i]:p.colC[i]))return;
  const g=[];for(const c of cells)if(!p.tree[c]&&state[c]===0){g.push([c,0]);state[c]=2}
  if(g.length){camp.hist.push(g);tone(400,0.08,'triangle');renderCamp();checkCamp()}
}
function checkCamp(){
  if(camp.done||!Camp.isSolved(camp.p,camp.state))return;
  camp.done=true;$('#campBoard').classList.add('solved');
  const {n,p,state}=camp;for(let c=0;c<n*n;c++)if(!p.tree[c]&&state[c]===0)state[c]=2;renderCamp();
  chord();buzz([20,40,20]);
  const t=fmtTime(Date.now()-camp.t0);
  if(!camp.daily)store.set('campLevel',Math.max(store.get('campLevel',1),camp.level+1));
  setTimeout(()=>overlay({title:camp.daily?'Daily solved':'Campsite set',big:t,body:camp.daily?'Come back tomorrow for a new one.':`Level ${camp.level} done. Every tree has its tent.`,
    buttons:camp.daily?[{label:'Back to menu',primary:true,action:()=>{hideOverlay();show('home')}}]:[{label:'Next level',primary:true,action:()=>{hideOverlay();startCamp(camp.level+1,false)}},{label:'Menu',action:()=>{hideOverlay();show('home')}}]}),650);
}
$('#campUndo').onclick=()=>{if(camp.done)return;const g=camp.hist.pop();if(!g)return;for(let i=g.length-1;i>=0;i--)camp.state[g[i][0]]=g[i][1];tone(300,0.05);renderCamp()};
$('#campReset').onclick=()=>{if(camp.done)return;camp.state.fill(0);camp.hist=[];renderCamp()};
$('#campHint').onclick=()=>{
  if(camp.done)return;
  const {n,p,state}=camp;let target=-1,val=0;
  for(let c=0;c<n*n&&target<0;c++)if(state[c]===1&&!p.sol[c]){target=c;val=2}
  for(let c=0;c<n*n&&target<0;c++)if(state[c]===2&&p.sol[c]){target=c;val=1}
  for(let c=0;c<n*n&&target<0;c++)if(p.sol[c]&&state[c]!==1){target=c;val=1}
  if(target<0)return;
  spendHint(()=>{camp.hist.push([[target,state[target]]]);state[target]=val;renderCamp();const el=camp.els[target];el.classList.remove('hinted');void el.offsetWidth;el.classList.add('hinted');tone(880,0.12,'triangle');checkCamp()});
};

/* ================= Slide Out ================= */
const ar={};const cv=$('#arCanvas'),ctx=cv.getContext('2d');
function startArrows(level){
  const q=Arrows.params(level),g=Arrows.generate(q.cols,q.rows,q.minL,q.maxL,level*7919+13);
  Object.assign(ar,{level,cols:g.cols,rows:g.rows,hearts:3,done:false,failed:false,hint:null,t0:Date.now(),
    arrows:g.arrows.map((a,i)=>({...a,id:i,len:a.cells.length,anim:null,gone:false,out:false,flash:0}))});
  ar.occ=new Int16Array(g.cols*g.rows).fill(-1);
  for(const a of ar.arrows){for(const c of a.cells)ar.occ[c]=a.id;a.track=buildTrack(a)}
  $('#arTitle').textContent='Level '+level;
  show('arrows');updateArHud();
}
function buildTrack(a){
  const {cols,rows}=ar,t=a.cells.map(c=>[c%cols,(c/cols)|0]);
  let [x,y]=t[t.length-1];const [dx,dy]=DIRS[a.dir];
  const dist=dx>0?cols-1-x:dx<0?x:dy>0?rows-1-y:y;
  for(let k=0;k<dist+a.len+2;k++){x+=dx;y+=dy;t.push([x,y])}
  return t;
}
function updateArHud(){
  const left=ar.arrows.filter(a=>!a.out).length;
  $('#arSub').textContent=left+(left===1?' arrow':' arrows')+' left';
  const heart=on=>`<svg viewBox="0 0 24 24"><path d="M12 20.5s-8-4.9-8-11A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5c0 6.1-8 11-8 11z" fill="${on?'var(--danger)':'none'}" stroke="var(--danger)" stroke-width="1.8"/></svg>`;
  $('#arHearts').innerHTML=[0,1,2].map(i=>heart(i<ar.hearts)).join('');
}
function layoutArrows(){
  const r=$('#arStage').getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,3);
  cv.width=Math.round(r.width*dpr);cv.height=Math.round(r.height*dpr);
  ar.dpr=dpr;ar.w=r.width;ar.h=r.height;
  ar.cell=Math.floor(Math.min(r.width/(ar.cols+0.4),r.height/(ar.rows+0.4),64));
  ar.ox=(r.width-ar.cols*ar.cell)/2;ar.oy=(r.height-ar.rows*ar.cell)/2;
}
addEventListener('resize',()=>{if(!$('#camp').hidden)layoutCamp();if(!$('#arrows').hidden)layoutArrows()});
cv.addEventListener('pointerdown',e=>{
  if(ar.done||ar.failed)return;
  const r=cv.getBoundingClientRect(),gx=(e.clientX-r.left-ar.ox)/ar.cell,gy=(e.clientY-r.top-ar.oy)/ar.cell;
  let id=-1;const x=Math.floor(gx),y=Math.floor(gy);
  if(x>=0&&y>=0&&x<ar.cols&&y<ar.rows)id=ar.occ[y*ar.cols+x];
  if(id<0){ // forgiving taps: snap to the nearest neighbouring cell's arrow
    let best=0.75;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=ar.cols||ny>=ar.rows)continue;const o=ar.occ[ny*ar.cols+nx];if(o<0)continue;const d=Math.hypot(nx+0.5-gx,ny+0.5-gy);if(d<best){best=d;id=o}}
  }
  if(id<0)return;
  const a=ar.arrows[id];if(a.out||(a.anim&&a.anim.type==='bump'))return;
  const k=Arrows.blocker(a,ar.occ,ar.cols,ar.rows);
  if(ar.hint===id)ar.hint=null;
  if(k<0){
    for(const c of a.cells)ar.occ[c]=-1;a.out=true;a.anim={type:'exit',t0:performance.now()};
    tone(600+Math.random()*200,0.09,'triangle');buzz(6);updateArHud();
  }else{
    const h=a.cells[a.len-1],bx=h%ar.cols+DIRS[a.dir][0]*k,by=((h/ar.cols)|0)+DIRS[a.dir][1]*k;
    const blk=ar.arrows[ar.occ[by*ar.cols+bx]];
    a.anim={type:'bump',t0:performance.now(),k};a.flash=performance.now()+500;if(blk)blk.flash=performance.now()+500;
    ar.hearts--;tone(140,0.18,'sawtooth',0.05);buzz([30,30,30]);updateArHud();
    if(ar.hearts<=0){ar.failed=true;setTimeout(failArrows,500)}
  }
});
function failArrows(){
  overlay({title:'Out of hearts',body:`${ar.arrows.filter(a=>!a.out).length} arrows were still on the board.`,buttons:[
    {label:'Watch ad · +1 heart',primary:true,action:()=>playAd(()=>{ar.hearts=1;ar.failed=false;updateArHud()})},
    {label:'Restart level',action:()=>{hideOverlay();startArrows(ar.level)}}]});
}
function winArrows(){
  ar.done=true;chord();buzz([20,40,20]);
  store.set('arLevel',Math.max(store.get('arLevel',1),ar.level+1));
  const lost=3-ar.hearts;
  overlay({title:'Board cleared',big:fmtTime(Date.now()-ar.t0),body:lost?`Level ${ar.level} done with ${lost} bump${lost>1?'s':''}.`:`Level ${ar.level} done without a single bump.`,
    buttons:[{label:'Next level',primary:true,action:()=>{hideOverlay();startArrows(ar.level+1)}},{label:'Menu',action:()=>{hideOverlay();show('home')}}]});
}
$('#arReset').onclick=()=>{hideOverlay();startArrows(ar.level)};
$('#arHint').onclick=()=>{
  if(ar.done||ar.failed)return;
  const free=ar.arrows.filter(a=>!a.out&&Arrows.blocker(a,ar.occ,ar.cols,ar.rows)<0);
  if(!free.length)return;
  spendHint(()=>{ar.hint=free[0].id;ar.hintT=performance.now();tone(880,0.12,'triangle')});
};
function interp(t,f){const i=Math.floor(f);if(i>=t.length-1)return t[t.length-1];const u=f-i;return[t[i][0]+(t[i+1][0]-t[i][0])*u,t[i][1]+(t[i+1][1]-t[i][1])*u]}
let rafOn=false;
function loop(){if(rafOn)return;rafOn=true;const step=now=>{if($('#arrows').hidden){rafOn=false;return}drawArrows(now);requestAnimationFrame(step)};requestAnimationFrame(step)}
function drawArrows(now){
  const cs=getComputedStyle(document.documentElement),col=n=>cs.getPropertyValue(n).trim();
  const ink=col('--ink'),danger=col('--danger'),accent=col('--gold'),line=col('--line');
  const {cell,ox,oy,dpr}=ar;
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,ar.w,ar.h);
  ctx.fillStyle=line;
  for(let y=0;y<ar.rows;y++)for(let x=0;x<ar.cols;x++){ctx.beginPath();ctx.arc(ox+(x+0.5)*cell,oy+(y+0.5)*cell,Math.max(1.5,cell*0.06),0,7);ctx.fill()}
  const P=p=>[ox+(p[0]+0.5)*cell,oy+(p[1]+0.5)*cell];
  let animating=false;
  for(const a of ar.arrows){
    if(a.gone)continue;
    let s=0,color=ink;
    if(a.anim){
      const tt=(now-a.anim.t0)/1000;
      if(a.anim.type==='exit'){s=reduceMotion?a.track.length:7*tt+38*tt*tt;if(s>=a.track.length-a.len){a.gone=true;continue}animating=true}
      else{const D=a.anim.k-1+0.35,half=0.07+0.025*D;s=tt<half?D*(tt/half):tt<2*half?D*(1-(tt-half)/half):0;if(tt>=2*half)a.anim=null}
    }
    if(a.flash>now)color=danger;
    else if(ar.hint===a.id){const ph=(Math.sin((now-ar.hintT)/160)+1)/2;color=ph>0.5?accent:ink}
    const tail=s,head=s+a.len-1,pts=[interp(a.track,tail)];
    for(let i=Math.ceil(tail);i<=Math.floor(head);i++)if(i>tail&&i<head)pts.push(a.track[i]);
    pts.push(interp(a.track,head));
    ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=Math.max(3,cell*0.2);ctx.lineCap='round';ctx.lineJoin='round';
    ctx.beginPath();pts.forEach((p,i)=>{const [X,Y]=P(p);i?ctx.lineTo(X,Y):ctx.moveTo(X,Y)});ctx.stroke();
    const [hx,hy]=P(pts[pts.length-1]),[dx,dy]=DIRS[a.dir],w=cell*0.28;
    ctx.beginPath();ctx.moveTo(hx+dx*cell*0.36,hy+dy*cell*0.36);ctx.lineTo(hx-dy*w-dx*cell*0.02,hy+dx*w-dy*cell*0.02);ctx.lineTo(hx+dy*w-dx*cell*0.02,hy-dx*w-dy*cell*0.02);ctx.closePath();ctx.fill();
  }
  if(!ar.done&&!animating&&ar.arrows.every(a=>a.out))winArrows();
}

renderHome();

/* Website build: single-game mode, install tip, offline cache */
const APP=document.body.dataset.app||'all';
if(APP!=='all'){
  $('#cardCamp').hidden=APP!=='camp';$('#cardArrows').hidden=APP!=='arrows';
  $('.home-head h1').textContent=APP==='camp'?'Campsite':'Slide Out';
  $('.home-head p').textContent=APP==='camp'?'Pitch a tent beside every tree. New levels never run out, plus a fresh daily puzzle.':'Clear the board one arrow at a time. Every level is generated and always solvable.';
}
if(!(navigator.standalone||matchMedia('(display-mode: standalone)').matches))$('#installTip').hidden=false;
document.addEventListener('gesturestart',e=>e.preventDefault());
if('serviceWorker' in navigator)navigator.serviceWorker.register(document.body.dataset.sw).catch(()=>{});
