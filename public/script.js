const EXP={Food:'#0f766e',Housing:'#2563eb',Transport:'#f59e0b',Shopping:'#db2777',Bills:'#7c3aed',Health:'#e11d48',Fun:'#0891b2',Other:'#64748b'};
const INC={Salary:'#0f9d6b',Freelance:'#65a30d','Other income':'#84cc16'};
const $=id=>document.getElementById(id);
let user=null;
async function api(path,opts={}){
  const r=await fetch('/api'+path,{
    method:opts.method||'GET',
    headers:Object.assign({'X-Requested-With':'ledgerly'},opts.body?{'Content-Type':'application/json'}:{}),
    body:opts.body?JSON.stringify(opts.body):undefined,
    credentials:'same-origin'
  });
  let d=null;try{d=await r.json()}catch(e){}
  if(r.status===401&&!path.startsWith('/auth')){user=null;stop()}
  if(!r.ok)throw new Error((d&&d.error)||'Request failed ('+r.status+')');
  return d;
}
const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const today=new Date();
let S={tx:[],budget:1500,cur:'USD',type:'expense'};
let month=iso(today).slice(0,7);

async function loadData(){
  const [t,s]=await Promise.all([api('/transactions'),api('/settings')]);
  S.tx=t.map(r=>({id:r.id,date:r.date,type:r.type,cat:r.category,amt:r.amount,note:r.note||''}));
  S.budget=s.budget;S.cur=s.currency;
  $('cur').value=S.cur;
}
const saveSettings=()=>api('/settings',{method:'PUT',body:{budget:S.budget,currency:S.cur}}).catch(e=>alert('Could not save settings: '+e.message));
const money=(n,d=2)=>{try{return new Intl.NumberFormat(undefined,{style:'currency',currency:S.cur,maximumFractionDigits:d,minimumFractionDigits:d}).format(n)}catch(e){return n.toFixed(d)}};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sum=(a,t)=>a.filter(x=>x.type===t).reduce((s,x)=>s+x.amt,0);
const color=x=>(x.type==='income'?INC:EXP)[x.cat]||'#64748b';

function fillCats(){
  const c=S.type==='income'?INC:EXP;
  $('category').innerHTML=Object.keys(c).map(k=>`<option>${k}</option>`).join('');
  $('addbtn').textContent=S.type==='income'?'Add income':'Add expense';
  document.querySelectorAll('.seg button').forEach(b=>b.classList.toggle('on',b.dataset.t===S.type));
}

function render(){
  const cm=S.tx.filter(x=>x.date.startsWith(month));
  const inc=sum(cm,'income'),exp=sum(cm,'expense'),net=inc-exp;
  const [y,m]=month.split('-').map(Number);
  const isCur=month===iso(today).slice(0,7);
  const days=isCur?today.getDate():new Date(y,m,0).getDate();
  $('bal').textContent=money(net);
  $('balsub').textContent=cm.length+' transactions in '+new Date(y,m-1,1).toLocaleString(undefined,{month:'long',year:'numeric'});
  $('inc').textContent=money(inc,0);$('exp').textContent=money(exp,0);
  $('rate').textContent=inc>0?Math.max(0,Math.round(net/inc*100))+'%':'–';
  $('avg').textContent=money(exp/days,0);

  const pct=S.budget>0?exp/S.budget*100:0;
  const f=$('bfill');f.style.width=Math.min(100,pct)+'%';f.style.background=pct>100?'var(--loss)':pct>80?'var(--warn)':'var(--brand)';
  $('btxt').textContent=exp>S.budget?money(exp-S.budget,0)+' over budget':money(Math.max(0,S.budget-exp),0)+' left of '+money(S.budget,0);
  $('bpct').textContent=Math.round(pct)+'%';

  // donut
  const by={};cm.filter(x=>x.type==='expense').forEach(x=>by[x.cat]=(by[x.cat]||0)+x.amt);
  const ent=Object.entries(by).sort((a,b)=>b[1]-a[1]);
  let off=25,svg='<circle cx="21" cy="21" r="15.9" fill="none" stroke="var(--line)" stroke-width="5"/>';
  ent.forEach(([k,v])=>{const p=v/exp*100;svg+=`<circle cx="21" cy="21" r="15.9" fill="none" stroke="${EXP[k]||'#64748b'}" stroke-width="5" stroke-dasharray="${p} ${100-p}" stroke-dashoffset="${off}"/>`;off-=p});
  svg+=`<text x="21" y="22.5" text-anchor="middle" font-size="4.6" font-weight="800" fill="var(--ink)">${ent.length?money(exp,0):'No data'}</text>`;
  $('donut').innerHTML=svg;
  $('legend').innerHTML=ent.length?ent.map(([k,v])=>`<div><i style="background:${EXP[k]||'#64748b'}"></i>${esc(k)}<span>${Math.round(v/exp*100)}%</span></div>`).join(''):'<div class="muted">Add an expense to see the breakdown.</div>';

  // trend
  const ms=[];for(let i=5;i>=0;i--){const d=new Date(y,m-1-i,1);ms.push({k:iso(d).slice(0,7),l:d.toLocaleString(undefined,{month:'short'})})}
  const data=ms.map(o=>{const a=S.tx.filter(x=>x.date.startsWith(o.k));return{l:o.l,i:sum(a,'income'),e:sum(a,'expense')}});
  const mx=Math.max(1,...data.flatMap(d=>[d.i,d.e]));
  let t='';
  data.forEach((d,i)=>{const x=10+i*58,hi=d.i/mx*120,he=d.e/mx*120;
    t+=`<rect x="${x}" y="${140-hi}" width="19" height="${hi}" rx="4" fill="var(--gain)"><title>${d.l} income ${money(d.i,0)}</title></rect>`;
    t+=`<rect x="${x+22}" y="${140-he}" width="19" height="${he}" rx="4" fill="var(--loss)"><title>${d.l} expenses ${money(d.e,0)}</title></rect>`;
    t+=`<text x="${x+20}" y="158" text-anchor="middle" font-size="11" fill="var(--muted)">${d.l}</text>`});
  t+=`<line x1="0" x2="360" y1="140" y2="140" stroke="var(--line)"/><rect x="226" y="2" width="9" height="9" rx="2" fill="var(--gain)"/><text x="240" y="10" font-size="10" fill="var(--muted)">Income</text><rect x="288" y="2" width="9" height="9" rx="2" fill="var(--loss)"/><text x="302" y="10" font-size="10" fill="var(--muted)">Expenses</text>`;
  $('trend').innerHTML=t;

  // table
  const q=$('q').value.trim().toLowerCase(),ft=$('ft').value;
  const list=cm.filter(x=>(ft==='all'||x.type===ft)&&(!q||(x.note+' '+x.cat).toLowerCase().includes(q))).sort((a,b)=>b.date.localeCompare(a.date)||b.id-a.id);
  $('rows').innerHTML=list.length?list.map(x=>`<tr><td>${new Date(x.date+'T00:00').toLocaleDateString(undefined,{day:'numeric',month:'short'})}</td><td>${esc(x.note||'—')}</td><td><span class="pill"><i style="background:${color(x)}"></i>${esc(x.cat)}</span></td><td class="amt ${x.type==='income'?'gain':'loss'}">${x.type==='income'?'+':'−'}${money(x.amt)}</td><td><button class="x" data-del="${x.id}" aria-label="Delete transaction">×</button></td></tr>`).join(''):'<tr><td colspan="5" class="empty">No transactions match. Add one using the form.</td></tr>';
}

document.querySelectorAll('.seg button').forEach(b=>b.onclick=()=>{S.type=b.dataset.t;fillCats()});
$('form').onsubmit=async e=>{
  e.preventDefault();
  const amt=parseFloat($('amount').value),date=$('date').value;
  if(!(amt>0)){$('err').textContent='Enter an amount greater than zero.';return}
  if(!date){$('err').textContent='Choose a date.';return}
  try{
    const r=await api('/transactions',{method:'POST',body:{date,type:S.type,category:$('category').value,amount:amt,note:$('note').value.trim()}});
    S.tx.push({id:r.id,date:r.date,type:r.type,cat:r.category,amt:r.amount,note:r.note||''});
  }catch(err){$('err').textContent=err.message;return}
  $('err').textContent='';$('amount').value='';$('note').value='';
  month=date.slice(0,7);$('month').value=month;
  render();
};
$('rows').onclick=async e=>{
  const id=e.target.dataset.del;if(!id)return;
  try{await api('/transactions/'+id,{method:'DELETE'})}catch(err){alert(err.message);return}
  S.tx=S.tx.filter(x=>String(x.id)!==id);render();
};
$('month').onchange=e=>{if(e.target.value){month=e.target.value;render()}};
$('cur').onchange=e=>{S.cur=e.target.value;saveSettings();render()};
$('q').oninput=render;$('ft').onchange=render;
$('setb').onclick=()=>{const v=parseFloat(prompt('Monthly spending budget',S.budget));if(v>0){S.budget=v;saveSettings();render()}};
$('theme').onclick=()=>{const r=document.documentElement,dark=r.dataset.theme?r.dataset.theme==='dark':matchMedia('(prefers-color-scheme:dark)').matches;r.dataset.theme=dark?'light':'dark';render()};

/* ---------- Auth ---------- */
let mode='in';
function msg(t,ok){const m=$('amsg');m.textContent=t||'';m.className='msg'+(ok?' ok':'')}
function showApp(on){$('auth').hidden=on;$('app').hidden=!on;$('user').textContent=user?user.email:''}
function setMode(m){
  mode=m;
  $('atitle').textContent=m==='in'?'Sign in to your ledger':'Create your account';
  $('asubmit').textContent=m==='in'?'Sign in':'Create account';
  $('aswitch').textContent=m==='in'?'New here? Create an account':'Have an account? Sign in';
  $('pass').autocomplete=m==='in'?'current-password':'new-password';
  msg('');
}
$('aswitch').onclick=()=>setMode(mode==='in'?'up':'in');
$('authForm').onsubmit=async e=>{
  e.preventDefault();
  const email=$('email').value.trim(),password=$('pass').value;
  if(mode==='up'&&password.length<8){msg('Use a password with at least 8 characters.');return}
  msg('Working…',true);
  try{
    const d=await api(mode==='in'?'/auth/login':'/auth/register',{method:'POST',body:{email,password}});
    user=d.user;msg('');await start();
  }catch(err){msg(err.message)}
};
$('logout').onclick=async()=>{try{await api('/auth/logout',{method:'POST'})}catch(e){}user=null;stop()};

async function start(){
  await loadData();
  month=iso(today).slice(0,7);
  $('month').value=month;$('date').value=iso(today);S.type='expense';fillCats();
  showApp(true);render();
}
function stop(){S.tx=[];S.budget=1500;S.cur='USD';$('authForm').reset();setMode('in');showApp(false)}

setMode('in');
(async()=>{try{const d=await api('/auth/me');user=d.user;await start()}catch(e){stop()}})();