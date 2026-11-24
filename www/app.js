(function(){
"use strict";

var KINDS={
  income:{label:"مدخول",title:"مدخول جديد",hint:"طلبيات: كل مبلغ تسجلو يتحسب طلبية وحدة. مجموع: مجموع النهار كامل، وكل مرة تسجلو يمسح القديم ويبقى الجديد. ما تخلطش الاثنين في نفس النهار باش ما يتحسبش المدخول مرتين.",noNote:true,cats:[{c:"طلبيات"},{c:"مجموع"}]},
  saving:{label:"مدخراتي",title:"مدخراتي",hint:"ما تدخلش في الربح الصافي.",opsFirst:true,cats:[{c:"موطو"},{c:"نفسي"},{c:"للدار"}],ops:[{c:"حطيت",d:1},{c:"سحبت",d:-1}]},
  custsaving:{label:"مدخرات زبائن",title:"مدخرات زبائن",hint:"ما تدخلش في الربح الصافي.",noNote:true,cats:[{c:"ريم"},{c:"مروة"},{c:"كراء"},{c:"أخرى"}],ops:[{c:"استلمت",d:1},{c:"رجّعت",d:-1}]},
  expense:{label:"مصروف",title:"مصروف جديد",hint:"",cats:["ليصانس","ميكنيسيا","غسل","تأمين","فليكسي","انترنت","أكل","أخرى"].map(function(c){return {c:c}})},
  debt:{label:"ديون",title:"ديون",hint:"تسلفت: خذيت سلف. سلّفت: عطيت سلف لواحد. سدّدت ورجعولي: الإرجاع.",cats:[{c:"تسلفت",d:1,s:"me"},{c:"سدّدت",d:-1,s:"me"},{c:"سلّفت",d:1,s:"them"},{c:"رجعولي",d:-1,s:"them"}]}
};
var PL={day:"اليوم",week:"آخر 7 أيام",month:"هذا الشهر"};
var LSK="dafter-sawaq:v1";
var LOC="ar-DZ-u-nu-latn";
var PILL={none:["",""],loading:["جاري الاتصال…",""],ok:["✓ متزامن مع حسابك","ok"],saving:["جاري الحفظ…",""],offline:["ما كاينش اتصال حاليا","warn"],local:["محفوظ في هذا الجهاز فقط","warn"]};

var state={entries:[],ready:false,mode:"local",period:"day",kind:null,view:null,confirmId:null,email:"",why:""};
var fb=null,auth=null,fdb=null,unsub=null,cloud=null,syncTimer=null;

function $(s){return document.querySelector(s)}
function pad(n){return String(n).padStart(2,"0")}
function ymd(d){return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())}
function today(){return ymd(new Date())}
function parse(s){var p=s.split("-").map(Number);return new Date(p[0],p[1]-1,p[2])}
function addDays(s,n){var p=s.split("-").map(Number);return ymd(new Date(p[0],p[1]-1,p[2]+n))}
function fmt(n){return String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g," ")}
function esc(s){return String(s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]})}
function uid(){return "e"+Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
function nice(v){var p=Math.pow(10,Math.floor(Math.log10(v))),f=v/p,s=[1,1.5,2,2.5,3,4,5,6,8,10],i;for(i=0;i<s.length;i++){if(f<=s[i])return s[i]*p}return 10*p}
function signed(n){return (n<0?"−":"")+fmt(n)}
function valid(e){return e&&typeof e.amount==="number"&&e.date}

var RENAME={"بنزين":"ليصانس","صيانة":"ميكنيسيا","غسيل":"غسل","هاتف وانترنت":"فليكسي"};
function norm(e){
  if(e.kind==="income"&&e.cat!=="مجموع")e.cat="طلبيات";
  else if(e.kind==="expense"&&RENAME[e.cat])e.cat=RENAME[e.cat];
  else if(e.kind==="custsaving"&&(e.cat==="استلمت من زبون"||e.cat==="رجّعت لزبون"))e.cat="أخرى";
  else if(e.kind==="saving"&&(e.cat==="حطيت"||e.cat==="سحبت"))e.cat="أخرى";
  return e;
}

function dayLabel(s){
  var t=today();
  if(s===t)return "اليوم";
  if(s===addDays(t,-1))return "البارح";
  return parse(s).toLocaleDateString(LOC,{weekday:"long",day:"numeric",month:"long"});
}

function inPeriod(e){
  var t=today();
  if(state.period==="day")return e.date===t;
  if(state.period==="week")return e.date>addDays(t,-7)&&e.date<=t;
  return e.date.slice(0,7)===t.slice(0,7);
}

function totals(list){
  var r={i:0,x:0,orders:0,oi:0};
  list.forEach(function(e){
    if(e.kind==="income"){r.i+=e.amount;if(e.cat!=="مجموع"){r.orders++;r.oi+=e.amount}}else if(e.kind==="expense"){r.x+=e.amount}
  });
  r.net=r.i-r.x;
  return r;
}

/* ---------- storage ---------- */
function lsLoad(){try{var v=JSON.parse(localStorage.getItem(LSK));return Array.isArray(v)?v:[]}catch(e){return []}}
function lsSave(){try{localStorage.setItem(LSK,JSON.stringify(state.entries))}catch(e){}}
function body(e){var o={},k;for(k in e){if(k!=="id")o[k]=e[k]}return o}
function onWriteErr(err){toast("ما تسجلش، عاود جرب ("+((err&&err.code)||"خطأ")+")")}

function addEntries(list){
  if(state.mode==="cloud"&&cloud){
    list.forEach(function(e){cloud.set(e.id,body(e)).catch(onWriteErr)});
    return Promise.resolve();
  }
  state.entries=state.entries.concat(list);
  lsSave();render();
  return Promise.resolve();
}
function removeEntries(ids){
  if(state.mode==="cloud"&&cloud){
    ids.forEach(function(id){cloud.del(id).catch(onWriteErr)});
    return Promise.resolve();
  }
  state.entries=state.entries.filter(function(e){return ids.indexOf(e.id)<0});
  lsSave();render();
  return Promise.resolve();
}

/* ---------- render ---------- */
function renderSeg(){
  $("#seg").innerHTML=Object.keys(PL).map(function(k){
    return '<button type="button" data-period="'+k+'" aria-pressed="'+(state.period===k)+'">'+PL[k]+'</button>';
  }).join("");
}

function renderSummary(){
  var list=state.entries.filter(inPeriod),t=totals(list),h="";
  h+='<div class="net-label">الربح الصافي · '+PL[state.period]+'</div>';
  h+='<div class="net'+(t.net<0?" neg":"")+'"><span class="num">'+(t.net>0?"+":"")+signed(t.net)+'</span><span class="cur">دج</span></div>';
  h+='<div class="split"><div><span>المداخيل</span><b class="in num">'+fmt(t.i)+' دج</b></div>'+
    '<div><span>المصاريف</span><b class="out num">'+fmt(t.x)+' دج</b></div>'+
    '<div><span>التوصيلات</span><b class="dl num">'+t.orders+'</b><small class="num">'+fmt(t.oi)+' دج</small></div></div>';
  var st="";
  if(t.orders>0){
    st+='<span>متوسط التوصيلة <b class="num">'+fmt(t.oi/t.orders)+' دج</b></span>';
  }
  if(t.i>0){
    st+='<span>المصاريف تاكل <b class="num">'+Math.round(t.x/t.i*100)+'%</b> من المداخيل</span>';
  }
  if(st)h+='<p class="stats">'+st+'</p>';
  $("#summary").innerHTML=h;
}

function renderChart(){
  var t=today(),days=[],k;
  for(k=6;k>=0;k--)days.push(addDays(t,-k));
  var rows=days.map(function(d){
    var i=0,x=0;
    state.entries.forEach(function(e){if(e.date===d){if(e.kind==="income")i+=e.amount;else if(e.kind==="expense")x+=e.amount}});
    return {d:d,i:i,x:x};
  });
  var raw=Math.max.apply(null,rows.map(function(r){return Math.max(r.i,r.x)}));
  var max=raw>0?nice(raw):1000;
  var W=360,H=170,L=6,R=54,T=12,B=28,pw=W-L-R,ph=H-T-B,step=pw/7;
  var s='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="مداخيل ومصاريف آخر 7 أيام">';
  [0,0.5,1].forEach(function(f){
    var y=T+ph-f*ph;
    s+='<line class="grid" x1="'+L+'" x2="'+(W-R)+'" y1="'+y+'" y2="'+y+'"/>';
    s+='<text class="axis" x="'+(W-R+6)+'" y="'+(y+3.5)+'">'+fmt(max*f)+'</text>';
  });
  rows.forEach(function(r,idx){
    var cx=L+pw-(idx+0.5)*step;
    var wd=parse(r.d).toLocaleDateString(LOC,{weekday:"short"});
    var lab=wd+": ";
    if(r.i>0){
      var hi=Math.max(r.i/max*ph,2);
      s+='<rect class="b-in" x="'+(cx+1.5).toFixed(1)+'" y="'+(T+ph-hi).toFixed(1)+'" width="14" height="'+hi.toFixed(1)+'" rx="2"><title>'+lab+'مداخيل '+fmt(r.i)+' دج</title></rect>';
    }
    if(r.x>0){
      var hx=Math.max(r.x/max*ph,2);
      s+='<rect class="b-out" x="'+(cx-15.5).toFixed(1)+'" y="'+(T+ph-hx).toFixed(1)+'" width="14" height="'+hx.toFixed(1)+'" rx="2"><title>'+lab+'مصاريف '+fmt(r.x)+' دج</title></rect>';
    }
    s+='<text class="axis day'+(r.d===t?" now":"")+'" x="'+cx.toFixed(1)+'" y="'+(H-9)+'" text-anchor="middle">'+wd+'</text>';
  });
  s+='</svg>';
  $("#chart").innerHTML=s;
}

function renderBreakdown(){
  var list=state.entries.filter(inPeriod).filter(function(e){return e.kind==="expense"});
  $("#brkPeriod").textContent="· "+PL[state.period];
  if(!list.length){
    $("#brk").innerHTML='<p class="note">ما كاين حتى مصروف في هذي الفترة.</p>';
    return;
  }
  var by={},total=0;
  list.forEach(function(e){by[e.cat]=(by[e.cat]||0)+e.amount;total+=e.amount});
  var keys=Object.keys(by).sort(function(a,b){return by[b]-by[a]});
  $("#brk").innerHTML='<ul class="brk">'+keys.map(function(c){
    var p=by[c]/total*100;
    return '<li><div class="l"><span>'+esc(c)+'</span><span class="num">'+fmt(by[c])+' دج · '+Math.round(p)+'%</span></div><div class="bar"><i style="width:'+p.toFixed(1)+'%"></i></div></li>';
  }).join("")+'</ul>';
}

function rowHTML(e){
  var sub=[];
  if(e.note)sub.push(esc(e.note));
  var K=KINDS[e.kind]||{label:""};
  var tag=(e.kind==="income"||e.kind==="expense")?"":esc(K.label)+" · ";
  var plus=e.kind==="income"||(e.kind!=="expense"&&e.dir!==-1);
  var cls=e.kind==="income"?"in":e.kind==="expense"?"out":e.kind==="debt"?"db":"sv";
  var sure=state.confirmId===e.id;
  return '<li class="row"><div class="main"><span class="cat">'+tag+esc(e.cat)+'</span>'+(sub.length?'<span class="sub">'+sub.join(" · ")+'</span>':'')+'</div>'+
    '<span class="amt num '+cls+'">'+(plus?"+":"−")+fmt(e.amount)+'</span>'+
    '<button type="button" class="del'+(sure?" sure":"")+'" data-del="'+esc(e.id)+'" aria-label="'+(sure?"تأكيد المسح":"مسح")+'">'+(sure?"تأكيد المسح":"×")+'</button></li>';
}

function sgn(e){return (e.kind==="income"||(e.kind!=="expense"&&e.dir!==-1))?e.amount:-e.amount}

function renderLog(){
  var V=state.view,VK=V?KINDS[V]:null;
  $("#logTitle").textContent=VK?"سجل "+VK.label:"السجل";
  $("#logPeriod").textContent="· "+PL[state.period];
  $("#showAll").hidden=!VK;
  var el=$("#log");
  if(!state.ready){el.innerHTML='<p class="note">جاري التحميل…</p>';return}
  if(!state.entries.length){
    el.innerHTML='<div class="empty"><p>ما كاين حتى تسجيل بعد. اضغط "مدخول" بعد كل طلبية، و"مصروف" كي تعبّي البنزين أو تصلّح.</p><button type="button" class="btn" id="loadSample">جرّب بأمثلة</button></div>';
    return;
  }
  var list=state.entries.filter(inPeriod).filter(function(e){return !V||e.kind===V}).sort(function(a,b){
    return a.date<b.date?1:a.date>b.date?-1:(b.ts||0)-(a.ts||0);
  }).slice(0,200);
  if(!list.length){
    el.innerHTML='<p class="note">'+(VK?"ما كاين حتى تسجيل في "+esc(VK.label)+" في هذي الفترة. جرب تبدل الفترة فوق.":"ما كاين حتى تسجيل في هذي الفترة.")+'</p>';
    return;
  }
  var h="",i=0;
  while(i<list.length){
    var d=list[i].date,grp=[];
    while(i<list.length&&list[i].date===d){grp.push(list[i]);i++}
    var head="";
    if(V){
      var sum=grp.reduce(function(a,x){return a+sgn(x)},0);
      head='<span class="dnet num '+(sum<0?"out":"in")+'">'+(sum>0?"+":"")+signed(sum)+' دج</span>';
    }else{
      var t=totals(grp),has=grp.some(function(x){return x.kind==="income"||x.kind==="expense"});
      if(has)head='<span class="dnet num '+(t.net<0?"out":"in")+'">'+(t.net>0?"+":"")+signed(t.net)+' دج</span>';
    }
    h+='<h3 class="dayhead"><span>'+dayLabel(d)+'</span>'+head+'</h3><ul class="log">'+grp.map(rowHTML).join("")+'</ul>';
  }
  el.innerHTML=h;
}

function renderBanner(){
  var n=state.entries.filter(function(e){return e.sample}).length,b=$("#banner");
  if(!n){b.hidden=true;b.className="";b.innerHTML="";return}
  b.hidden=false;b.className="banner";
  b.innerHTML='<span>هذي أمثلة للتجربة، مش أرقامك.</span><button type="button" class="btn" id="clearSample">امسح الأمثلة</button>';
}

function renderBalances(){
  var b={sv:0,cs:0,owe:0,lent:0},by={},bys={};
  state.entries.forEach(function(e){
    var v=(e.dir===-1?-1:1)*e.amount;
    if(e.kind==="saving"){b.sv+=v;bys[e.cat]=(bys[e.cat]||0)+v}
    else if(e.kind==="custsaving"){b.cs+=v;by[e.cat]=(by[e.cat]||0)+v}
    else if(e.kind==="debt"){if(e.side==="me")b.owe+=v;else b.lent+=v}
  });
  function box(l,v,c,sub){return '<div><span>'+l+'</span><b class="num '+c+'">'+signed(v)+' دج</b>'+(sub?'<small>'+sub+'</small>':'')+'</div>'}
  function subOf(m){return Object.keys(m).filter(function(k){return m[k]!==0}).map(function(k){return esc(k)+" "+signed(m[k])}).join(" · ")}
  $("#bal").innerHTML=box("مدخراتي",b.sv,"c-saving",subOf(bys))+box("مدخرات زبائن",b.cs,"c-saving",subOf(by))+box("ديون عليّ",b.owe,"c-debt")+box("ديون ليّ",b.lent,"c-debt");
}

function renderWhere(){
  var w=$("#where"),a=$("#acct");
  if(state.mode==="cloud"){
    w.textContent="البيانات محفوظة في حسابك وتتزامن بين كل أجهزتك.";
    a.hidden=false;$("#acctEmail").textContent=state.email;
  }else{
    a.hidden=true;
    w.textContent=state.why==="failed"
      ?"تعذر تشغيل المزامنة، البيانات محفوظة في هذا الجهاز فقط."
      :"المزامنة ما مفعلتش بعد، البيانات محفوظة في هذا الجهاز فقط.";
  }
}

function render(){
  renderSeg();renderSummary();renderChart();renderBreakdown();renderLog();renderBanner();renderBalances();renderWhere();
}

/* ---------- form ---------- */
function setErr(m){var e=$("#err");e.textContent=m||"";e.hidden=!m}
function closeForm(clearView){
  state.kind=null;
  if(clearView){state.view=null;renderLog()}
  $("#formPanel").hidden=true;
  document.querySelectorAll(".add button").forEach(function(b){b.setAttribute("aria-expanded","false")});
  setErr("");
}
function openForm(kind){
  if(state.kind===kind){closeForm(true);return}
  state.kind=kind;
  state.view=kind;state.confirmId=null;renderLog();
  var K=KINDS[kind],hint=$("#formHint");
  $("#formTitle").textContent=K.title;
  hint.textContent=K.hint;hint.hidden=!K.hint;
  $("#cats").innerHTML=K.cats.map(function(c,i){
    return '<label class="chip"><input type="radio" name="cat" value="'+i+'"'+(i===0?" checked":"")+'><span>'+esc(c.c)+'</span></label>';
  }).join("");
  $("#catsField").hidden=K.cats.length<2;
  $("#opsField").hidden=!K.ops;
  var cf=$("#catsField");
  cf.parentNode.insertBefore($("#opsField"),K.opsFirst?cf:cf.nextSibling);
  $("#ops").innerHTML=(K.ops||[]).map(function(o,i){
    return '<label class="chip"><input type="radio" name="op" value="'+i+'"'+(i===0?" checked":"")+'><span>'+esc(o.c)+'</span></label>';
  }).join("");
  $("#noteField").hidden=!!K.noNote;
  $("#noteLabel").textContent=kind==="debt"?"اسم الشخص (اختياري)":"ملاحظة (اختياري)";
  document.querySelectorAll(".add button").forEach(function(b){
    b.setAttribute("aria-expanded",String(b.getAttribute("data-kind")===kind));
  });
  $("#formPanel").hidden=false;
  setErr("");
  $("#amount").focus();
}

function submitForm(ev){
  ev.preventDefault();
  var amt=parseFloat($("#amount").value);
  if(!(amt>0)){setErr("اكتب المبلغ بالدينار.");$("#amount").focus();return}
  var K=KINDS[state.kind],chk=document.querySelector('input[name="cat"]:checked');
  var c=K.cats[chk?parseInt(chk.value,10):0]||K.cats[0];
  var e={
    id:uid(),
    kind:state.kind,
    amount:Math.round(amt*100)/100,
    cat:c.c,
    note:K.noNote?"":$("#note").value.trim(),
    date:today(),
    ts:Date.now()
  };
  if(c.d)e.dir=c.d;
  if(c.s)e.side=c.s;
  if(K.ops){
    var ochk=document.querySelector('input[name="op"]:checked');
    e.dir=K.ops[ochk?parseInt(ochk.value,10):0].d;
  }
  var replaced=false;
  if(e.kind==="income"&&e.cat==="مجموع"){
    var old=state.entries.filter(function(x){return x.kind==="income"&&x.cat==="مجموع"&&x.date===e.date}).map(function(x){return x.id});
    if(old.length){replaced=true;removeEntries(old)}
  }
  addEntries([e]).then(function(){toast(replaced?"تبدل مجموع النهار":"تسجل")});
  $("#amount").value="";$("#note").value="";
  closeForm();
}

/* ---------- samples ---------- */
function sampleEntries(){
  var t=today(),n=0,out=[];
  var days=[
    {inc:[900,650,1200,800,650],exp:[["ليصانس",1500]]},
    {inc:[1100,700,900,1300,1100],exp:[]},
    {inc:[800,950,700,1150],exp:[["ليصانس",1400],["غسل",300]]},
    {inc:[1200,800,1000,900,800],exp:[["أكل",450]]},
    {inc:[700,1100,1100],exp:[]},
    {inc:[1300,900,1400,1000,1000],exp:[["ليصانس",1700],["فليكسي",1000]]},
    {inc:[900,1500,700,800],exp:[["ميكنيسيا",2500]]}
  ];
  days.forEach(function(d,k){
    var date=addDays(t,-k);
    d.inc.forEach(function(a){out.push({id:uid(),kind:"income",amount:a,cat:"طلبيات",note:"",date:date,ts:Date.now()+(n++),sample:true})});
    d.exp.forEach(function(x){out.push({id:uid(),kind:"expense",amount:x[1],cat:x[0],note:"",date:date,ts:Date.now()+(n++),sample:true})});
  });
  return out;
}

/* ---------- toast + pill ---------- */
var toastTimer=null;
function toast(m){
  $("#toastMsg").textContent=m;
  $("#toast").classList.add("on");
  clearTimeout(toastTimer);
  toastTimer=setTimeout(function(){$("#toast").classList.remove("on")},2400);
}
function setPill(k){var p=$("#pill"),v=PILL[k];p.textContent=v[0];p.className="pill "+v[1]}
function setSync(m){var s=$("#sync");s.textContent=m||"";s.hidden=!m}

/* ---------- auth ---------- */
function setAuthErr(m){var e=$("#authErr");e.textContent=m||"";e.hidden=!m}
function authMsg(c){
  var m={
    "auth/invalid-credential":"الإيميل ولا كلمة السر غالطين.",
    "auth/invalid-email":"اكتب إيميل صحيح.",
    "auth/email-already-in-use":"هذا الإيميل عندو حساب. اضغط دخول.",
    "auth/weak-password":"كلمة السر قصيرة، 6 حروف على الأقل.",
    "auth/network-request-failed":"ما كاينش نت.",
    "auth/too-many-requests":"محاولات كثيرة، استنى شوية وعاود.",
    "auth/operation-not-allowed":"الدخول بالإيميل ما مفعلش في Firebase.",
    "auth/missing-password":"اكتب كلمة السر."
  };
  return m[c]||("ما قدرناش ندخلوك ("+(c||"خطأ")+")");
}
async function doAuth(create){
  var em=$("#email").value.trim(),pw=$("#pass").value;
  if(!em||!pw){setAuthErr("اكتب الإيميل وكلمة السر.");return}
  setAuthErr("");
  try{
    if(create)await fb.createUserWithEmailAndPassword(auth,em,pw);
    else await fb.signInWithEmailAndPassword(auth,em,pw);
    $("#pass").value="";
  }catch(e){setAuthErr(authMsg(e&&e.code))}
}
function showAuth(on){$("#auth").hidden=!on;$("#main").hidden=on}

/* ---------- events ---------- */
document.addEventListener("click",function(ev){
  var t=ev.target.closest("button");
  if(!t)return;
  if(t.hasAttribute("data-period")){state.period=t.getAttribute("data-period");state.confirmId=null;render();return}
  if(t.hasAttribute("data-kind")){openForm(t.getAttribute("data-kind"));return}
  if(t.id==="cancel"){closeForm(true);return}
  if(t.id==="showAll"){state.view=null;state.confirmId=null;renderLog();return}
  if(t.id==="signup"){doAuth(true);return}
  if(t.id==="signout"){if(fb&&auth)fb.signOut(auth);return}
  if(t.id==="loadSample"){addEntries(sampleEntries());return}
  if(t.id==="clearSample"){
    var ids=state.entries.filter(function(e){return e.sample}).map(function(e){return e.id});
    removeEntries(ids);return;
  }
  if(t.hasAttribute("data-del")){
    var id=t.getAttribute("data-del");
    if(state.confirmId===id){state.confirmId=null;removeEntries([id]).then(function(){toast("تمسح")})}
    else{
      state.confirmId=id;renderLog();
      setTimeout(function(){if(state.confirmId===id){state.confirmId=null;renderLog()}},4000);
    }
  }
});
$("#entry").addEventListener("submit",submitForm);
$("#authForm").addEventListener("submit",function(ev){ev.preventDefault();doAuth(false)});
window.addEventListener("offline",function(){if(state.mode==="cloud")setPill("offline")});
window.addEventListener("online",function(){if(state.mode==="cloud")setPill("loading")});

/* ---------- start ---------- */
function configured(){var c=window.FIREBASE_CONFIG;return !!(c&&c.apiKey&&c.projectId)}

function startLocal(why){
  if(unsub){unsub();unsub=null}
  clearTimeout(syncTimer);
  state.mode="local";state.why=why||"";cloud=null;
  state.entries=lsLoad().filter(valid).map(norm);
  state.ready=true;
  showAuth(false);setSync("");setPill("local");render();
}

function onUser(user){
  if(unsub){unsub();unsub=null}
  clearTimeout(syncTimer);
  if(!user){
    state.mode="cloud";cloud=null;state.entries=[];state.ready=false;
    setPill("none");setSync("");showAuth(true);
    return;
  }
  showAuth(false);
  state.mode="cloud";state.entries=[];state.ready=false;state.email=user.email||"";
  var col=fb.collection(fdb,"users",user.uid,"entries");
  cloud={
    set:function(id,b){return fb.setDoc(fb.doc(col,id),b)},
    del:function(id){return fb.deleteDoc(fb.doc(col,id))}
  };
  setPill("loading");render();
  syncTimer=setTimeout(function(){
    setSync("ما كاينش اتصال حاليا. التسجيلات تتحفظ في الجهاز وتتزامن كي يرجع النت.");
    setPill("offline");state.ready=true;render();
  },10000);
  unsub=fb.onSnapshot(col,{includeMetadataChanges:true},function(snap){
    var m=snap.metadata;
    if(!m.fromCache){clearTimeout(syncTimer);setSync("")}
    setPill(m.hasPendingWrites?"saving":(m.fromCache?(navigator.onLine?"loading":"offline"):"ok"));
    if(!m.fromCache||snap.size>0)state.ready=true;
    state.entries=snap.docs.map(function(d){return norm(Object.assign({},d.data(),{id:d.id}))}).filter(valid);
    render();
  },function(err){
    clearTimeout(syncTimer);
    setPill("offline");
    setSync(err&&err.code==="permission-denied"
      ?"ما عندكش صلاحية. تأكد أن قواعد Firestore (ملف firestore.rules) منشورة."
      :"ما قدرناش نقرأ البيانات ("+((err&&err.code)||"خطأ")+").");
    state.ready=true;render();
  });
}

async function startCloud(){
  try{
    fb=await import("./vendor/firebase.js");
    var app=fb.initializeApp(window.FIREBASE_CONFIG);
    auth=fb.getAuth(app);
    try{
      fdb=fb.initializeFirestore(app,{localCache:fb.persistentLocalCache({tabManager:fb.persistentMultipleTabManager()})});
    }catch(e){
      fdb=fb.getFirestore(app);
    }
  }catch(e){
    startLocal("failed");return;
  }
  fb.onAuthStateChanged(auth,onUser,function(){startLocal("failed")});
}

function init(){
  $("#today").textContent=new Date().toLocaleDateString(LOC,{weekday:"long",day:"numeric",month:"long",year:"numeric"});
  if("serviceWorker" in navigator&&!window.Capacitor&&/^https?:$/.test(location.protocol)){
    navigator.serviceWorker.register("sw.js").catch(function(){});
  }
  render();
  if(configured()){setPill("loading");startCloud()}
  else startLocal("");
}
init();
})();
