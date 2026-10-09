'use strict';
/* =================== Level generator =================== */
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function shuffle(arr,rnd){for(let i=arr.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));const t=arr[i];arr[i]=arr[j];arr[j]=t}return arr}
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
        if(keep())return;arrows.pop();for(const c of p)occ[c]=-1}
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
  // Steps until the first cell held by another arrow, or -1 when the way to the edge is clear.
  blocker(a,occ,cols,rows){
    const h=a.cells[a.cells.length-1];let x=h%cols,y=(h/cols)|0,k=0;
    for(;;){x+=DIRS[a.dir][0];y+=DIRS[a.dir][1];k++;if(x<0||y<0||x>=cols||y>=rows)return -1;if(occ[y*cols+x]!==-1)return k}
  }
};

/* =================== Helpers =================== */
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmt=ms=>{const s=Math.max(0,Math.floor(ms/1000));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')};
const dayKey=(d=new Date())=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const daySeed=()=>{const d=new Date();return d.getFullYear()*10000+(d.getMonth()+1)*100+d.getDate()};
const yesterday=()=>{const d=new Date();d.setDate(d.getDate()-1);return dayKey(d)};
const tok=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function retrigger(el,cls){if(!el)return;el.classList.remove(cls);void el.offsetWidth;el.classList.add(cls)}
function pent(i){i=Math.min(i,19);const d=[0,2,4,7,9];const m=60+12*Math.floor(i/5)+d[((i%5)+5)%5];return 440*Math.pow(2,(m-69)/12)}

/* =================== Saved progress =================== */
const KEY='slideout.v2';
const P=(()=>{let d=null;try{d=JSON.parse(localStorage.getItem(KEY))}catch(e){}
  if(!d){let lvl=1,h=0;try{lvl=JSON.parse(localStorage.getItem('cs.arLevel'))||1;h=JSON.parse(localStorage.getItem('cs.hints'))||0}catch(e){}d={level:lvl,hints:Math.max(h,5)}}
  return Object.assign({level:1,hints:5,stars:{},gifts:{},streak:0,lastDaily:'',daily:{},sound:true,music:true,haptics:true,skin:'paper',best:0},d)})();
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(P))}catch(e){}};
const totalStars=()=>Object.values(P.stars).reduce((a,b)=>a+b,0);
const streakNow=()=>P.lastDaily===dayKey()||P.lastDaily===yesterday()?P.streak:0;
const SKINS=[
  {id:'paper',name:'Paper',need:0,sw:['#4A6CF7','#FF6B57','#18B987','#FFB020'],bg:'#FFFFFF'},
  {id:'candy',name:'Candy',need:12,sw:['#F0458B','#7A5CFF','#2EC4B6','#FF9F1C'],bg:'#FFFFFF'},
  {id:'ocean',name:'Ocean',need:30,sw:['#0F9DB8','#FF7A59','#1F5FBF','#F4B400'],bg:'#FFFFFF'},
  {id:'neon',name:'Neon Night',need:60,sw:['#39F3FF','#FF4FD8','#B6FF3B','#FFD23F'],bg:'#1B1532'}];
let PAL={};
function applySkin(){
  document.documentElement.dataset.skin=P.skin;
  PAL={paper:tok('--paper'),dot:tok('--dot'),danger:tok('--danger'),gold:tok('--gold'),shadow:tok('--shadow'),edge:tok('--edge'),
       arrows:['--a1','--a2','--a3','--a4','--a5','--a6'].map(tok)};
  const m=$('meta[name="theme-color"]');if(m)m.content=tok('--bg');
}

/* =================== Sound (all synthesised, no files) =================== */
const Sound={
  ctx:null,
  unlock(){
    if(!this.ctx){
      const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
      const c=this.ctx=new AC();
      this.comp=c.createDynamicsCompressor();this.comp.threshold.value=-12;this.comp.ratio.value=4;this.comp.connect(c.destination);
      const len=Math.floor(c.sampleRate*1.8);this.ir=c.createBuffer(2,len,c.sampleRate);
      for(let ch=0;ch<2;ch++){const d=this.ir.getChannelData(ch);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,2.8)}
      this.nb=c.createBuffer(1,c.sampleRate,c.sampleRate);const nd=this.nb.getChannelData(0);for(let i=0;i<nd.length;i++)nd[i]=Math.random()*2-1;
      this.sfx=this.bus(P.sound?1:0);this.mus=this.bus(P.music?.8:0);
    }
    if(this.ctx.state!=='running')this.ctx.resume().catch(()=>{});
    Music.start();
  },
  bus(v){const c=this.ctx,g=c.createGain();g.gain.value=v;g.connect(this.comp);const r=c.createConvolver();r.buffer=this.ir;const rg=c.createGain();rg.gain.value=.45;r.connect(rg);rg.connect(g);return{in:g,verb:r}},
  set(){if(!this.ctx)return;this.sfx.in.gain.value=P.sound?1:0;this.mus.in.gain.value=P.music?.8:0},
  now(){return this.ctx?this.ctx.currentTime:0},
  tone(f,o={}){
    const c=this.ctx;if(!c)return;const bus=o.bus||'sfx';if(bus==='sfx'&&!P.sound)return;
    const t=Math.max(o.t||0,c.currentTime),dur=o.dur||.3,b=this[bus];
    const os=c.createOscillator(),g=c.createGain();os.type=o.type||'sine';os.frequency.setValueAtTime(f,t);
    if(o.glide)os.frequency.exponentialRampToValueAtTime(o.glide,t+dur);
    g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(o.vol||.2,t+(o.attack||.004));g.gain.exponentialRampToValueAtTime(.0001,t+dur);
    os.connect(g);g.connect(b.in);
    const wet=o.wet===undefined?.25:o.wet;if(wet){const w=c.createGain();w.gain.value=wet;g.connect(w);w.connect(b.verb)}
    os.start(t);os.stop(t+dur+.05);
  },
  noise(o={}){
    const c=this.ctx;if(!c||!P.sound)return;const t=Math.max(o.t||0,c.currentTime),dur=o.dur||.12;
    const s=c.createBufferSource();s.buffer=this.nb;const f=c.createBiquadFilter();f.type=o.type||'bandpass';
    f.frequency.setValueAtTime(o.f||2000,t);if(o.f2)f.frequency.exponentialRampToValueAtTime(o.f2,t+dur);f.Q.value=o.q||1;
    const g=c.createGain();g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(o.vol||.15,t+(o.attack||.01));g.gain.exponentialRampToValueAtTime(.0001,t+dur);
    s.connect(f);f.connect(g);g.connect(this.sfx.in);if(o.wet){const w=c.createGain();w.gain.value=o.wet;g.connect(w);w.connect(this.sfx.verb)}
    s.start(t,Math.random()*.5);s.stop(t+dur+.05);
  },
  marimba(f,o={}){const v=o.vol||.16;this.tone(f,{...o,dur:.6,vol:v});this.tone(f*4,{...o,dur:.06,vol:v*.25,wet:0});this.tone(f*2,{...o,type:'triangle',dur:.16,vol:v*.12})},
  bell(f,o={}){const v=o.vol||.12;this.tone(f,{...o,dur:1.5,vol:v,wet:.6});this.tone(f*2.76,{...o,dur:.5,vol:v*.22,wet:.5})},
  click(){this.tone(1600,{dur:.03,vol:.05,type:'triangle',wet:0})},
  whoosh(){this.noise({f:450,f2:3400,q:1.4,dur:.28,vol:.2,attack:.03,wet:.15})},
  thud(){this.tone(170,{glide:48,dur:.26,vol:.55,wet:.05});this.noise({type:'lowpass',f:600,dur:.12,vol:.4})},
  error(){this.thud();this.tone(185,{type:'square',dur:.13,vol:.03,wet:0,t:this.now()+.03})},
  clear(combo){this.whoosh();this.marimba(pent(4+Math.min(combo,14)),{vol:.17})},
  combo(n){this.bell(pent(9+Math.min(n,10)),{vol:.09})},
  star(i){this.bell(pent(9+i*2),{vol:.15});this.marimba(pent(4+i*2),{vol:.1})},
  win(){const t=this.now();for(let i=0;i<8;i++)this.marimba(pent(5+i),{t:t+i*.065,vol:.14});[12,14,16].forEach(k=>this.bell(pent(k),{t:t+.58,vol:.09}))},
  gift(){const t=this.now();[10,12,14,17].forEach((k,i)=>this.bell(pent(k),{t:t+i*.09,vol:.1}))},
  appear(i){this.tone(pent(2+i%8)*2,{dur:.05,vol:.025,type:'triangle',wet:.2})}
};
/* Gentle generative background music: C-Am-F-G pad, soft bass, sparse marimba. */
const Music={timer:null,next:0,step:0,
  start(){if(this.timer||!Sound.ctx)return;this.next=Sound.ctx.currentTime+.2;this.timer=setInterval(()=>this.tick(),100)},
  tick(){const c=Sound.ctx;if(!c||c.state!=='running'||!P.music)return;const spb=60/84/2;if(this.next<c.currentTime)this.next=c.currentTime+.05;
    while(this.next<c.currentTime+.35){this.play(this.step,this.next);this.next+=spb;this.step++}},
  play(s,t){
    const CH=[[0,4,7],[9,12,16],[5,9,12],[7,11,14]],ch=CH[Math.floor(s/16)%4],m=n=>440*Math.pow(2,(n-69)/12);
    if(s%16===0)for(const k of ch)Sound.tone(m(55+k),{t,dur:4.4,vol:.02,attack:1,wet:.7,bus:'mus'});
    if(s%8===0)Sound.tone(m(43+ch[0]),{t,dur:1.6,vol:.045,type:'triangle',wet:.2,bus:'mus'});
    if(s%2===0&&Math.random()<.4){const pool=[0,2,4,7,9,12,14,16];Sound.marimba(m(72+pool[Math.floor(Math.random()*pool.length)]),{t,vol:.03,bus:'mus',wet:.6})}
  }};
document.addEventListener('visibilitychange',()=>{if(!Sound.ctx)return;document.hidden?Sound.ctx.suspend():Sound.ctx.resume()});

/* =================== Haptics ===================
   Android: Vibration API. iPhone (iOS 18+): Safari has no vibration API, but toggling a native
   switch control plays the system haptic tick, so we click a hidden one. */
const Haptic={
  tick(){
    if(!P.haptics)return;
    if(navigator.vibrate){try{navigator.vibrate(10)}catch(e){}return}
    try{const l=document.createElement('label');l.ariaHidden='true';l.style.display='none';const i=document.createElement('input');i.type='checkbox';i.setAttribute('switch','');l.appendChild(i);document.head.appendChild(l);l.click();l.remove()}catch(e){}
  },
  pattern(ms,vib){if(!P.haptics)return;if(navigator.vibrate){try{navigator.vibrate(vib)}catch(e){}return}ms.forEach(t=>t?setTimeout(()=>this.tick(),t):this.tick())},
  tap(){this.tick()},
  success(){this.pattern([0,110],[14,60,22])},
  error(){this.pattern([0,80,160],[40,40,40,40,60])},
  big(){this.pattern([0,90,180,320],[20,50,20,50,80])}
};

/* =================== Particles, floating text, toasts =================== */
const FX={p:[],on:false,
  init(){this.cv=$('#fx');this.x=this.cv.getContext('2d');this.size();addEventListener('resize',()=>this.size())},
  size(){this.d=Math.min(devicePixelRatio||1,2);this.cv.width=innerWidth*this.d;this.cv.height=innerHeight*this.d},
  add(o){this.p.push(o);if(!this.on){this.on=true;this.last=performance.now();requestAnimationFrame(t=>this.step(t))}},
  burst(x,y,colors,n=14,sp=260){if(reduce)n=Math.ceil(n/3);for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,v=sp*(.35+Math.random()*.65);this.add({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-70,g:520,life:0,max:.45+Math.random()*.35,r:2.5+Math.random()*3.5,c:colors[i%colors.length]})}},
  spark(x,y,c){this.add({x,y,vx:(Math.random()-.5)*40,vy:(Math.random()-.5)*40,g:0,life:0,max:.28,r:2+Math.random()*2,c})},
  confetti(colors){const n=reduce?30:150,W=innerWidth,H=innerHeight;
    for(let i=0;i<n;i++){const side=i%3;let x,y,vx,vy;
      if(side===0){x=Math.random()*W;y=-20;vx=(Math.random()-.5)*120;vy=80+Math.random()*180}
      else{x=side===1?-10:W+10;y=H*.78;vx=(side===1?1:-1)*(180+Math.random()*340);vy=-(480+Math.random()*440)}
      this.add({x,y,vx,vy,g:560,drag:.986,life:0,max:3.4,w:6+Math.random()*5,h:9+Math.random()*7,rot:Math.random()*6,vr:(Math.random()-.5)*14,c:colors[i%colors.length],rect:true})}},
  step(t){
    const dt=Math.min(.033,(t-this.last)/1000);this.last=t;const x=this.x;
    x.setTransform(this.d,0,0,this.d,0,0);x.clearRect(0,0,innerWidth,innerHeight);
    this.p=this.p.filter(q=>{q.life+=dt;if(q.life>q.max||q.y>innerHeight+60)return false;
      q.vy+=q.g*dt;if(q.drag){q.vx*=q.drag;q.vy*=q.drag}q.x+=q.vx*dt;q.y+=q.vy*dt;
      x.globalAlpha=Math.min(1,(q.max-q.life)/.3);x.fillStyle=q.c;
      if(q.rect){q.rot+=q.vr*dt;x.save();x.translate(q.x,q.y);x.rotate(q.rot);x.scale(1,Math.cos(q.rot*1.7));x.fillRect(-q.w/2,-q.h/2,q.w,q.h);x.restore()}
      else{x.beginPath();x.arc(q.x,q.y,q.r*(1-q.life/q.max*.6),0,7);x.fill()}
      return true});
    x.globalAlpha=1;
    if(this.p.length)requestAnimationFrame(t=>this.step(t));else{this.on=false;x.clearRect(0,0,innerWidth,innerHeight)}
  }};
const confettiColors=()=>[...PAL.arrows.slice(0,5),PAL.gold];
function floatText(txt,x,y,cls=''){const d=document.createElement('div');d.className='float '+cls;d.textContent=txt;d.style.left=x+'px';d.style.top=y+'px';document.body.appendChild(d);d.addEventListener('animationend',()=>d.remove());setTimeout(()=>d.remove(),1500)}
function toast(html){const d=document.createElement('div');d.className='toast';d.innerHTML=html;$('#toasts').appendChild(d);setTimeout(()=>d.remove(),2900)}

/* =================== Icons & art =================== */
const I={
  back:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  star:'<svg viewBox="0 0 24 24"><path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  flame:'<svg viewBox="0 0 24 24"><path d="M12 2c1 3.6 5.5 5.6 5.5 11.2a5.5 5.5 0 0 1-11 0c0-2.6 1.3-4.3 2.6-5.4.1 1.9 1 3.2 2.3 3.6C10.9 8.5 11.2 5 12 2z" fill="currentColor"/></svg>',
  bulb:'<svg viewBox="0 0 24 24"><path d="M12 2.5a6.5 6.5 0 0 0-3.8 11.8c.6.5 1 1.2 1 2V17h5.6v-.7c0-.8.4-1.5 1-2A6.5 6.5 0 0 0 12 2.5z" fill="currentColor"/><path d="M9.5 19.5h5M10.5 22h3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  restart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 12a8.5 8.5 0 1 0 2.8-6.3L3.5 8.3"/><path d="M3.5 3.5v4.8h4.8"/></svg>',
  heart:'<svg viewBox="0 0 24 24"><path d="M12 20.5s-8-4.9-8-11A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5c0 6.1-8 11-8 11z" stroke-linejoin="round"/></svg>',
  heartFill:'<svg viewBox="0 0 24 24"><path d="M12 20.5s-8-4.9-8-11A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5c0 6.1-8 11-8 11z" fill="currentColor"/></svg>',
  lock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2.5" fill="currentColor" stroke="none"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  gift:'<svg viewBox="0 0 24 24"><rect x="3.5" y="10.5" width="17" height="10" rx="2" fill="currentColor"/><rect x="2.5" y="7" width="19" height="4.6" rx="1.5" fill="currentColor"/><path d="M12 7v13.5" stroke="var(--surface)" stroke-width="2"/><path d="M12 7c-1.6-3.2-5.2-3.4-5.2-1.2C6.8 7 9 7 12 7s5.2 0 5.2-1.2c0-2.2-3.6-2-5.2 1.2z" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  sliders:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4 7h9M19 7h1M4 17h3M13 17h7"/><circle cx="16" cy="7" r="2.6"/><circle cx="10" cy="17" r="2.6"/></svg>',
  clock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9.5 2.5h5"/></svg>',
  play:'<svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>'
};
const ART=`<svg class="art" viewBox="0 0 320 200" aria-hidden="true">
 <g fill="var(--dot)">${Array.from({length:40},(_,i)=>`<circle cx="${40+(i%8)*34}" cy="${30+Math.floor(i/8)*35}" r="3"/>`).join('')}</g>
 <g fill="none" stroke-width="14" stroke-linecap="round" stroke-linejoin="round">
  <path d="M40 170V100h68" stroke="var(--a1)"/><path d="M176 170h-34v-70" stroke="var(--a3)"/><path d="M280 30v70h-60" stroke="var(--a5)"/>
  <g class="slide"><path d="M44 30h110" stroke="var(--a2)"/></g>
  <g class="slide2"><path d="M246 175v-34" stroke="var(--a4)"/></g>
 </g>
 <g>
  <path d="M106 86l22 14-22 14z" fill="var(--a1)" stroke="var(--a1)" stroke-width="6" stroke-linejoin="round"/>
  <path d="M128 102l14-22 14 22z" fill="var(--a3)" stroke="var(--a3)" stroke-width="6" stroke-linejoin="round"/>
  <path d="M222 86l-22 14 22 14z" fill="var(--a5)" stroke="var(--a5)" stroke-width="6" stroke-linejoin="round"/>
  <g class="slide"><path d="M152 16l22 14-22 14z" fill="var(--a2)" stroke="var(--a2)" stroke-width="6" stroke-linejoin="round"/></g>
  <g class="slide2"><path d="M232 143l14-22 14 22z" fill="var(--a4)" stroke="var(--a4)" stroke-width="6" stroke-linejoin="round"/></g>
 </g></svg>`;

/* =================== Markup =================== */
document.body.insertAdjacentHTML('afterbegin',`
<div id="app">
 <section id="home" class="screen">
  <header class="topbar">
   <div class="pills">
    <span class="pill" aria-label="Stars"><span class="c-gold">${I.star}</span><b id="pStars">0</b></span>
    <span class="pill" aria-label="Daily streak"><span class="c-flame">${I.flame}</span><b id="pStreak">0</b></span>
    <span class="pill" aria-label="Hints"><span class="c-gold">${I.bulb}</span><b data-hints>0</b></span>
   </div>
   <button class="icon-btn" id="btnSettings" aria-label="Settings">${I.sliders}</button>
  </header>
  <div class="home-body">
   <div class="hero">
    <div class="hero-art">${ART}</div>
    <div class="hero-head"><h1>Slide Out</h1><span class="lvl-tag" id="heroLvl"></span></div>
    <p>Tap an arrow and it zooms off the board. Clear every arrow without crashing.</p>
    <div class="gift"><span class="gi">${I.gift}</span><div class="bar"><i id="giftBar"></i></div><span id="giftTxt"></span></div>
    <button class="btn big glow" id="btnPlay">${I.play}<span id="playTxt">Play</span></button>
    <div class="duo"><button class="btn soft" id="btnLevels">Levels</button><button class="btn soft" id="btnDaily">Daily</button></div>
   </div>
   <p class="install" id="installTip" hidden>Play it like an app: in Safari tap Share, then “Add to Home Screen”.</p>
   <a class="back-link" id="allLink" href="../" hidden>More puzzles</a>
  </div>
 </section>
 <section id="levels" class="screen" hidden>
  <header class="gbar"><button class="icon-btn" data-home aria-label="Back">${I.back}</button><div class="gtitle"><h2>Levels</h2><div class="sub" id="lvSub"></div></div></header>
  <div class="lv-grid" id="lvGrid"></div>
 </section>
 <section id="game" class="screen" hidden>
  <header class="gbar">
   <button class="icon-btn" data-home aria-label="Menu">${I.back}</button>
   <div class="gtitle"><h2 id="gTitle">Level 1</h2><div class="sub" id="gSub"></div></div>
   <div class="hearts" id="hearts"></div>
  </header>
  <div class="progress"><i id="prog"></i></div>
  <div class="stage" id="stage"><canvas id="arCanvas"></canvas></div>
  <p class="coach" id="coach" hidden></p>
  <nav class="gctl">
   <button class="rbtn hint" id="btnHint"><i class="disc">${I.bulb}<b class="count" data-hints>0</b></i><span>Hint</span></button>
   <button class="rbtn" id="btnRestart"><i class="disc">${I.restart}</i><span>Restart</span></button>
  </nav>
 </section>
</div>
<div id="sheetWrap" hidden><div class="sheet" id="sheet"></div></div>
<div id="toasts"></div>
<canvas id="fx"></canvas>`);

/* =================== Sheets =================== */
let adTimer=null;
function openSheet(html,dismiss){const w=$('#sheetWrap'),s=$('#sheet');s.innerHTML=html;w.hidden=false;retrigger(s,'sheet');w.onclick=e=>{if(dismiss&&e.target===w)closeSheet()};return s}
function closeSheet(){$('#sheetWrap').hidden=true;clearInterval(adTimer)}
function bind(s,map){s.querySelectorAll('[data-act]').forEach(b=>b.onclick=()=>map[b.dataset.act]())}
function playAd(reward){
  let n=3;const draw=()=>openSheet(`<p class="eyebrow" style="font-weight:800;color:var(--muted)">AD BREAK</p><div class="big-n">${n}</div><div class="ad-box">Rewarded ad slot. The App Store version plays a short video ad here.</div>`);
  draw();clearInterval(adTimer);adTimer=setInterval(()=>{n--;if(n<=0){closeSheet();reward()}else draw()},1000);
}
function useHint(apply){if(P.hints>0){P.hints--;save();hud();apply();return}
  const s=openSheet(`<div class="sheet-icon">${I.bulb}</div><h3>Out of hints</h3><p>Watch a short ad for 3 more. Gifts every 5 levels and each daily puzzle also give hints.</p><div class="stack"><button class="btn gold big" data-act="ad">${I.play}Watch ad · +3</button><button class="btn soft" data-act="no">Not now</button></div>`,true);
  bind(s,{ad:()=>playAd(()=>{P.hints+=3;save();hud();toast(`${I.bulb} +3 hints`);Sound.gift();Haptic.success()}),no:closeSheet});
}
function settings(){
  const ts=totalStars(),tg=(k,l)=>`<button class="tgl" role="switch" aria-checked="${P[k]}" data-tg="${k}"><span>${l}</span><i></i></button>`;
  const s=openSheet(`<h3>Settings</h3><div class="tgls">${tg('sound','Sound effects')}${tg('music','Music')}${tg('haptics','Vibration')}</div>
   <h4>Themes <span>${I.star}${ts}</span></h4>
   <div class="skins">${SKINS.map(k=>{const lock=ts<k.need;return`<button class="skin ${P.skin===k.id?'sel':''} ${lock?'locked':''}" data-skin="${k.id}" ${lock?'disabled':''}><span class="sw" style="background:${k.bg}">${k.sw.map(c=>`<i style="background:${c}"></i>`).join('')}</span><b>${k.name}</b><small>${lock?I.lock+' '+k.need+' stars':P.skin===k.id?'In use':'Tap to use'}</small></button>`}).join('')}</div>
   <button class="btn big" data-act="done">Done</button>`,true);
  s.querySelectorAll('[data-tg]').forEach(b=>b.onclick=()=>{const k=b.dataset.tg;P[k]=!P[k];save();b.setAttribute('aria-checked',P[k]);Sound.set();if(k==='haptics')Haptic.tap()});
  s.querySelectorAll('[data-skin]').forEach(b=>b.onclick=()=>{P.skin=b.dataset.skin;save();applySkin();Sound.gift();settings()});
  bind(s,{done:closeSheet});
}

/* =================== Screens =================== */
function go(id){$$('.screen').forEach(s=>s.hidden=s.id!==id);if(id==='home')renderHome();if(id==='game'){layout();loop()}}
function hud(){$$('[data-hints]').forEach(e=>e.textContent=P.hints);const s=$('#pStars');if(s)s.textContent=totalStars();$('#pStreak').textContent=streakNow()}
function renderHome(){
  hud();const into=(P.level-1)%5;
  $('#heroLvl').textContent='Level '+P.level;$('#playTxt').textContent='Play Level '+P.level;
  $('#giftBar').style.width='0%';requestAnimationFrame(()=>requestAnimationFrame(()=>$('#giftBar').style.width=(into/5*100)+'%'));
  $('#giftTxt').textContent=`Gift in ${5-into}`;
  const done=!!P.daily[dayKey()];$('#btnDaily').innerHTML=done?`${I.check}Daily`:'Daily <i class="dot"></i>';$('#btnDaily').classList.toggle('done',done);
}
function showLevels(){
  const cur=P.level,max=Math.max(30,Math.ceil((cur+12)/5)*5);let h='';
  for(let i=1;i<=max;i++){const st=P.stars[i]||0,state=i<cur?'done':i===cur?'cur':'lock';
    h+=`<button class="lvl ${state}" data-lv="${i}" ${state==='lock'?'disabled':''}><span>${state==='lock'?I.lock:i}</span>${state==='done'?`<span class="lst">${[0,1,2].map(k=>`<i class="${k<st?'on':''}">${I.star}</i>`).join('')}</span>`:''}${i%5===0&&state!=='done'?`<span class="lgift">${I.gift}</span>`:''}</button>`}
  $('#lvGrid').innerHTML=h;$('#lvSub').innerHTML=`${I.star} ${totalStars()} stars · ${cur-1} cleared`;
  go('levels');const c=$('#lvGrid .cur');if(c)c.scrollIntoView({block:'center'});
}
document.addEventListener('pointerdown',e=>{Sound.unlock();const b=e.target.closest('button');if(b&&!b.disabled){Sound.click();Haptic.tap()}},true);
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  if(b.dataset.lv)start(+b.dataset.lv);else if(b.hasAttribute('data-home')){closeSheet();go('home')}});
$('#btnPlay').onclick=()=>start(P.level);
$('#btnLevels').onclick=showLevels;
$('#btnDaily').onclick=()=>start(0,true);
$('#btnSettings').onclick=settings;

/* =================== Game =================== */
const A={},cv=$('#arCanvas'),ctx=cv.getContext('2d');
const COACH={1:'Tap an arrow. It slides off the board the way it points.',2:'Crash into another arrow and you lose a heart. Free the path first.',3:'Clear arrows quickly one after another for a combo.'};
function start(level,daily=false){
  closeSheet();
  const q=Arrows.params(daily?14:level),g=Arrows.generate(q.cols,q.rows,q.minL,q.maxL,daily?daySeed()*3+7:level*7919+13);
  const order=shuffle(g.arrows.map((_,i)=>i),mulberry32(level+99));
  Object.assign(A,{level,daily,cols:g.cols,rows:g.rows,hearts:3,done:false,failed:false,hint:null,t0:performance.now(),tStart:Date.now(),combo:0,lastClear:0,total:g.arrows.length,
    arrows:g.arrows.map((a,i)=>({...a,id:i,len:a.cells.length,anim:null,gone:false,out:false,flash:0,jolt:0,burst:false,ci:(i*7+level)%6,born:order.indexOf(i)}))});
  A.occ=new Int16Array(A.cols*A.rows).fill(-1);
  for(const a of A.arrows){for(const c of a.cells)A.occ[c]=a.id;buildTrack(a)}
  $('#gTitle').textContent=daily?'Daily Puzzle':'Level '+level;
  $('#gSub').innerHTML=`${I.star}${I.star}${I.star} finish with all hearts`;
  const tip=daily?'':COACH[level]||'';$('#coach').hidden=!tip;$('#coach').textContent=tip;
  A.stagger=Math.min(22,900/Math.max(1,A.total));
  go('game');hud();hearts();progress();
  const n=Math.min(A.total,24);for(let i=0;i<n;i++)setTimeout(()=>Sound.appear(i),i*A.stagger*A.total/n);
}
function buildTrack(a){
  const t=a.cells.map(c=>[c%A.cols,(c/A.cols)|0]);let [x,y]=t[t.length-1];const [dx,dy]=DIRS[a.dir];
  a.dist=dx>0?A.cols-1-x:dx<0?x:dy>0?A.rows-1-y:y;
  for(let k=0;k<a.dist+a.len+3;k++){x+=dx;y+=dy;t.push([x,y])}
  a.track=t;
}
function hearts(lost=-1){$('#hearts').innerHTML=[0,1,2].map(i=>`<span class="heart ${i<A.hearts?'on':''} ${i===lost?'break':''}">${I.heart}</span>`).join('')}
function progress(){const left=A.arrows.filter(a=>!a.out).length;$('#prog').style.width=((A.total-left)/A.total*100)+'%'}
function layout(){
  const r=$('#stage').getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,3);
  cv.width=Math.round(r.width*dpr);cv.height=Math.round(r.height*dpr);
  Object.assign(A,{dpr,w:r.width,h:r.height});
  A.cell=Math.floor(Math.min((r.width-8)/(A.cols+.8),(r.height-8)/(A.rows+.8),64));
  A.ox=(r.width-A.cols*A.cell)/2;A.oy=(r.height-A.rows*A.cell)/2;
}
addEventListener('resize',()=>{if(!$('#game').hidden)layout()});

cv.addEventListener('pointerdown',e=>{
  if(A.done||A.failed)return;
  const r=cv.getBoundingClientRect(),gx=(e.clientX-r.left-A.ox)/A.cell,gy=(e.clientY-r.top-A.oy)/A.cell,x=Math.floor(gx),y=Math.floor(gy);
  let id=x>=0&&y>=0&&x<A.cols&&y<A.rows?A.occ[y*A.cols+x]:-1;
  if(id<0){let best=.8;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=A.cols||ny>=A.rows)continue;const o=A.occ[ny*A.cols+nx];if(o<0)continue;const d=Math.hypot(nx+.5-gx,ny+.5-gy);if(d<best){best=d;id=o}}}
  if(id<0)return;
  const a=A.arrows[id],now=performance.now();if(a.out||(a.anim&&a.anim.type==='bump'&&now-a.anim.t0<450))return;
  if(!$('#coach').hidden&&A.level>1)$('#coach').hidden=true;
  const k=Arrows.blocker(a,A.occ,A.cols,A.rows);
  if(A.hint===id)A.hint=null;
  if(k<0){
    for(const c of a.cells)A.occ[c]=-1;a.out=true;a.anim={type:'exit',t0:now};
    A.combo=now-A.lastClear<1500?A.combo+1:1;A.lastClear=now;
    Sound.clear(A.combo);Haptic.tap();
    if(A.combo>=3){floatText(A.combo>=6?`Combo ×${A.combo}!`:`Combo ×${A.combo}`,e.clientX,e.clientY-30,A.combo>=6?'big':'');Sound.combo(A.combo);if(A.combo%5===0)Haptic.success()}
    progress();
    if(A.arrows.every(x=>x.out))setTimeout(()=>{if(!A.done&&!A.failed&&A.arrows.every(x=>x.out))win()},850);
  }else{
    const h=a.cells[a.len-1],bx=h%A.cols+DIRS[a.dir][0]*k,by=((h/A.cols)|0)+DIRS[a.dir][1]*k,blk=A.arrows[A.occ[by*A.cols+bx]];
    a.anim={type:'bump',t0:now,k};a.flash=now+520;if(blk){blk.flash=now+520;blk.jolt=now+(70+25*k)}
    A.hearts--;A.combo=0;hearts(A.hearts);retrigger($('#stage'),'shake');
    setTimeout(()=>{Sound.error();Haptic.error()},60+20*k);
    if(A.hearts<=0){A.failed=true;setTimeout(fail,650)}
  }
});
$('#btnHint').onclick=()=>{
  if(A.done||A.failed)return;
  const free=A.arrows.filter(a=>!a.out&&Arrows.blocker(a,A.occ,A.cols,A.rows)<0);if(!free.length)return;
  useHint(()=>{A.hint=free[Math.floor(Math.random()*free.length)].id;A.hintT=performance.now();Sound.bell(pent(12),{vol:.1})});
};
$('#btnRestart').onclick=()=>start(A.level,A.daily);

function fail(){
  const left=A.arrows.filter(a=>!a.out).length;
  const s=openSheet(`<div class="sheet-icon" style="color:var(--danger)">${I.heartFill}</div><h3>Out of hearts</h3><p>${left} arrow${left===1?'':'s'} left. So close.</p><div class="stack"><button class="btn gold big" data-act="ad">${I.play}Watch ad · +1 heart</button><button class="btn soft" data-act="retry">Try again</button></div>`);
  bind(s,{ad:()=>playAd(()=>{A.hearts=1;A.failed=false;hearts();Sound.gift();Haptic.success()}),retry:()=>start(A.level,A.daily)});
}
function win(){
  A.done=true;const stars=Math.max(1,A.hearts),time=Date.now()-A.tStart;
  Sound.win();Haptic.big();FX.confetti(confettiColors());
  const res={gift:false,skins:[],daily:false},before=totalStars();
  if(A.daily){const k=dayKey();if(!P.daily[k]){P.daily[k]=1;P.streak=P.lastDaily===yesterday()?P.streak+1:P.lastDaily===k?P.streak:1;P.lastDaily=k;P.hints+=1;res.daily=true}}
  else{P.stars[A.level]=Math.max(P.stars[A.level]||0,stars);if(A.level>=P.level)P.level=A.level+1;
    if(A.level%5===0&&!P.gifts[A.level]){P.gifts[A.level]=1;P.hints+=2;res.gift=true}
    res.skins=SKINS.filter(s=>s.need>before&&s.need<=totalStars())}
  save();hud();
  setTimeout(()=>winSheet(stars,time,res),650);
}
function winSheet(stars,time,res){
  const title=A.daily?'Daily done!':stars===3?'Perfect!':stars===2?'Great!':'Cleared!';
  const into=A.level%5,giftRow=A.daily?'':`<div class="gift"><span class="gi">${I.gift}</span><div class="bar"><i id="wGift" style="width:${((into===0?5:into)-1)/5*100}%"></i></div><span>${into===0?'Opened!':'Gift in '+(5-into)}</span></div>`;
  const chips=`<div class="chips"><span class="chip">${I.clock}${fmt(time)}</span><span class="chip" style="color:var(--danger)">${I.heartFill}<span style="color:var(--ink)">${A.hearts} left</span></span>${A.daily?`<span class="chip"><span class="c-flame">${I.flame}</span>${streakNow()} day streak</span>`:''}</div>`;
  const s=openSheet(`<div class="ribbon">${title}</div>
    <div class="wstars">${[0,1,2].map(i=>`<span class="wstar ${i<stars?'on':''}" style="--d:${.15+i*.3}s">${I.star}</span>`).join('')}</div>
    ${chips}${giftRow}
    <div class="stack">${A.daily?`<button class="btn big" data-act="home">Back to menu</button>`:`<button class="btn big glow" data-act="next">Next level ${I.play}</button>`}
    <div class="duo"><button class="btn soft" data-act="replay">${I.restart}Replay</button><button class="btn soft" data-act="home">Menu</button></div></div>`);
  for(let i=0;i<stars;i++)setTimeout(()=>{Sound.star(i);Haptic.tap();const el=s.querySelectorAll('.wstar')[i];if(el){const r=el.getBoundingClientRect();FX.burst(r.left+r.width/2,r.top+r.height/2,[PAL.gold,'#fff',PAL.gold],16,300)}},300+i*300);
  const g=$('#wGift');if(g)setTimeout(()=>g.style.width=((into===0?5:into)/5*100)+'%',300+stars*300);
  let delay=500+stars*300;
  if(res.gift){setTimeout(()=>{Sound.gift();Haptic.success();toast(`${I.gift} Gift opened: +2 hints`)},delay);delay+=900}
  if(res.daily){setTimeout(()=>{Sound.gift();toast(`${I.flame} Daily streak: ${streakNow()} · +1 hint`)},delay);delay+=900}
  for(const k of res.skins){setTimeout(()=>{Sound.gift();Haptic.success();toast(`${I.star} New theme unlocked: ${k.name}`)},delay);delay+=900}
  bind(s,{next:()=>start(A.level+1),replay:()=>start(A.level,A.daily),home:()=>{closeSheet();go('home')}});
}

/* Drawing */
function interp(t,f){const i=Math.floor(f);if(i>=t.length-1)return t[t.length-1];if(i<0)return t[0];const u=f-i;return[t[i][0]+(t[i+1][0]-t[i][0])*u,t[i][1]+(t[i+1][1]-t[i][1])*u]}
function rr(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath()}
let rafOn=false;
function loop(){if(rafOn)return;rafOn=true;const step=()=>{if($('#game').hidden){rafOn=false;return}draw(performance.now());requestAnimationFrame(step)};requestAnimationFrame(step)}
function draw(now){
  const {cell,ox,oy,dpr}=A,pad=cell*.4;
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,A.w,A.h);
  ctx.save();ctx.shadowColor=PAL.shadow;ctx.shadowBlur=26;ctx.shadowOffsetY=8;ctx.fillStyle=PAL.paper;rr(ox-pad,oy-pad,A.cols*cell+pad*2,A.rows*cell+pad*2,cell*.55);ctx.fill();ctx.restore();
  ctx.fillStyle=PAL.dot;
  for(let y=0;y<A.rows;y++)for(let x=0;x<A.cols;x++){ctx.beginPath();ctx.arc(ox+(x+.5)*cell,oy+(y+.5)*cell,Math.max(1.6,cell*.065),0,7);ctx.fill()}
  const rect=cv.getBoundingClientRect(),P2=p=>[ox+(p[0]+.5)*cell,oy+(p[1]+.5)*cell],w=Math.max(4,cell*.22);
  let animating=false;
  for(const a of A.arrows){
    if(a.gone)continue;
    let s=0,grow=1,jx=0,jy=0,color=PAL.arrows[a.ci];
    const born=A.t0+a.born*A.stagger;
    if(!reduce&&now<born+320){grow=Math.max(0,(now-born)/320);grow=1-Math.pow(1-grow,3);animating=true;if(grow<=0)continue}
    if(a.anim){
      const tt=Math.max(0,(now-a.anim.t0)/1000);
      if(a.anim.type==='exit'){
        s=reduce?a.track.length:9*tt+46*tt*tt;
        if(s>=a.track.length-a.len){a.gone=true;continue}
        animating=true;
        const hp=P2(interp(a.track,s+a.len-1));if(s<=a.dist&&Math.random()<.7)FX.spark(rect.left+hp[0],rect.top+hp[1],color);
        if(!a.burst&&s>=a.dist+.5){a.burst=true;const e=P2(interp(a.track,a.len-1+a.dist+.5));FX.burst(rect.left+e[0],rect.top+e[1],[color,color,PAL.gold],14,280)}
      }else{const D=a.anim.k-1+.38,half=.07+.025*D;s=tt<half?D*(tt/half):tt<2*half?D*(1-(tt-half)/half):0;if(tt>=2*half)a.anim=null}
    }
    if(a.jolt&&now>a.jolt&&now<a.jolt+320){const k=(now-a.jolt)/320,amp=cell*.09*(1-k);jx=Math.sin(k*38)*amp;jy=Math.cos(k*31)*amp*.5}
    if(a.flash>now)color=PAL.danger;
    const head=s+(a.len-1)*grow,pts=[interp(a.track,s)];
    for(let i=Math.max(0,Math.ceil(s));i<=Math.min(a.track.length-1,Math.floor(head));i++)if(i>s&&i<head)pts.push(a.track[i]);
    pts.push(interp(a.track,head));
    const sp=pts.map(p=>{const q=P2(p);return[q[0]+jx,q[1]+jy]});
    const hint=A.hint===a.id;
    // soft drop shadow, optional hint glow, then the arrow
    strokeArrow(sp,a.dir,PAL.shadow,w,cell,grow,0,cell*.07);
    if(hint){const ph=(Math.sin((now-A.hintT)/170)+1)/2;ctx.globalAlpha=.35+.5*ph;strokeArrow(sp,a.dir,PAL.gold,w+cell*.2,cell,grow,0,0);ctx.globalAlpha=1}
    strokeArrow(sp,a.dir,color,w,cell,grow,0,0);
  }
  if(!A.done&&!A.failed&&!animating&&A.arrows.every(a=>a.out))win();
}
function strokeArrow(sp,dir,color,w,cell,grow,dx0,dy0){
  ctx.save();ctx.translate(dx0,dy0);ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=w;
  ctx.beginPath();sp.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.stroke();
  const [hx,hy]=sp[sp.length-1],[dx,dy]=DIRS[dir],L=cell*.36*grow,W=cell*.27*grow,b=cell*.05*grow;
  ctx.lineWidth=w*.45;ctx.beginPath();ctx.moveTo(hx+dx*L,hy+dy*L);ctx.lineTo(hx-dx*b-dy*W,hy-dy*b+dx*W);ctx.lineTo(hx-dx*b+dy*W,hy-dy*b-dx*W);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.restore();
}

/* =================== Boot =================== */
applySkin();FX.init();
if(!(navigator.standalone||matchMedia('(display-mode: standalone)').matches)){$('#installTip').hidden=false;$('#allLink').hidden=false}
document.addEventListener('gesturestart',e=>e.preventDefault());
if('serviceWorker' in navigator)navigator.serviceWorker.register('../sw.js').catch(()=>{});
const m=location.hash.match(/^#(?:level-)?(\d+)$/);
if(m)start(+m[1]);else if(location.hash==='#levels')showLevels();else if(location.hash==='#settings'){go('home');settings()}else go('home');
