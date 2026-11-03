import {initializeApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,signInAnonymously,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,doc,setDoc,onSnapshot} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const subjects=["Estética Hidrotermal","Proyecto Intermodular","Drenaje Linfático","Tratamientos Estéticos","Depilación Avanzada","Sostenibilidad y Digitalización","Belleza en la Mirada"];
const defaults=[
 {id:1,title:"Limpiar la habitación",category:"home",frequency:"Semanal",due:"",done:false},
 {id:2,title:"Limpiar el coche",category:"home",frequency:"Cada mes",due:"",done:false},
 {id:3,title:"Cambiar las sábanas",category:"home",frequency:"Cada 2 semanas",due:"",done:false},
 {id:4,title:"Ducharme",category:"self",frequency:"Diaria",due:"",done:false},
 {id:5,title:"Lavarme el pelo",category:"self",frequency:"Cada 2 días",due:"",done:false},
 {id:6,title:"Limpieza facial mañana y noche",category:"self",frequency:"Diaria",due:"",done:false},
 {id:7,title:"Higiene y limpieza facial",category:"self",frequency:"Cada 2 semanas",due:"",done:false}
];
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`};
const dateFmt=s=>s?new Date(s+"T12:00:00").toLocaleDateString("es-ES",{day:"numeric",month:"short"}):"Sin fecha";
let data=JSON.parse(localStorage.getItem("organizeData")||"null")||{tasks:defaults,foods:[],exercises:[],notes:{},water:{},steps:{},profile:{},settings:{waterGoal:8,glassMl:250,stepGoal:8000,accent:"sage",theme:"light",userName:""},study:[]};
data.completed ??= [];
data.grades ??= {};
data.tasks.forEach(t=>{if(!t.due)t.due=t.nextDue||today();t.recurring=t.frequency&&t.frequency!=="Una vez"});
let taskFilter="pending",taskCat="all",monthIndex=0,selectedDay=today(),selectedSubject="Todas";
if(!localStorage.getItem("organizeData"))data.tasks.forEach(t=>{t.due=today();t.recurring=t.frequency!=="Una vez"});
/* ====== NUBE (Firebase) ======
   PEGA AQUÍ los datos de tu proyecto de Firebase (Configuración del proyecto → Tus apps → Config). */
const firebaseConfig={
  apiKey:"AIzaSyBdvrXKBby_XvN2WiTjJpuMeuBuDOs52KI",
  authDomain:"tareas-nerea.firebaseapp.com",
  projectId:"tareas-nerea",
  storageBucket:"tareas-nerea.firebasestorage.app",
  messagingSenderId:"1050144016858",
  appId:"1:1050144016858:web:fb9969d000f807b8db98e3"
};
const CACHE_KEY="organizeData",DIRTY_KEY="organizeDirty";
const DEFAULT_SETTINGS={waterGoal:8,glassMl:250,stepGoal:8000,accent:"sage",theme:"light",userName:""};
const DOCS={principal:["tasks","study","notes","grades","profile","settings"],historial:["completed"],salud:["foods","exercises","water","steps"]};
const configured=!String(firebaseConfig.apiKey).startsWith("PEGA");
let auth=null,fdb=null;const refs={};
if(configured){const fbApp=initializeApp(firebaseConfig);auth=getAuth(fbApp);fdb=getFirestore(fbApp);Object.keys(DOCS).forEach(k=>refs[k]=doc(fdb,"organize",k))}
let synced=false,inflight=0,failed=false,last={},got={},exists={},remote={},deferred={},unsubs=[];
function setSync(t,err=false){const e=document.getElementById("syncStatus");if(e){e.textContent=t;e.classList.toggle("error",err)}}
const modalOpen=()=>document.getElementById("modalBackdrop").classList.contains("open");
function partOf(name){const p={};DOCS[name].forEach(k=>p[k]=data[k]);return JSON.stringify(p)}
function normalize(){
  data.tasks??=[];data.study??=[];data.foods??=[];data.exercises??=[];data.notes??={};data.water??={};data.steps??={};data.profile??={};data.completed??=[];data.grades??={};
  data.settings={...DEFAULT_SETTINGS,...(data.settings||{})};
  data.tasks.forEach(t=>{if(!t.due)t.due=t.nextDue||today();t.recurring=t.frequency&&t.frequency!=="Una vez"});
}
function applyPart(name,json){try{Object.assign(data,JSON.parse(json));last[name]=json;normalize();try{localStorage.setItem(CACHE_KEY,JSON.stringify(data))}catch(e){}}catch(e){console.error(e)}}
function persist(){
  try{localStorage.setItem(CACHE_KEY,JSON.stringify(data));localStorage.setItem(DIRTY_KEY,"1")}catch(e){}
  if(synced)pushDocs();
}
function pushDocs(force=false){
  const writes=[];
  for(const name of Object.keys(DOCS)){
    const json=partOf(name);
    if(!force&&json===last[name])continue;
    if(json.length>900000){setSync("⚠ Hay demasiados datos guardados ("+name+").",true);continue}
    writes.push([name,json]);
  }
  if(!writes.length)return;
  failed=false;
  writes.forEach(([name,json])=>{
    last[name]=json;inflight++;setSync("Guardando…");
    setDoc(refs[name],{json}).then(()=>{inflight--;if(!inflight&&!failed){setSync("✓ Todo guardado");try{localStorage.removeItem(DIRTY_KEY)}catch(e){}}},err=>{
      inflight--;failed=true;last[name]="";
      const c=(err&&err.code)||"error";console.error("Error al guardar",err);
      setSync("⚠ No se han guardado los cambios ("+c+"). "+(c==="permission-denied"?"Revisa las reglas de Firestore.":"Revisa la conexión."),true);
    });
  });
}
function initialSync(){
  const names=Object.keys(DOCS),anyRemote=names.some(k=>exists[k]);
  let dirty=false;try{dirty=localStorage.getItem(DIRTY_KEY)==="1"}catch(e){}
  if(anyRemote&&!dirty)names.forEach(k=>{if(exists[k])applyPart(k,remote[k])});
  else if(anyRemote)names.forEach(k=>{if(exists[k])last[k]=remote[k]});
  synced=true;
  pushDocs(!anyRemote);
  render();
  if(!inflight)setSync("✓ Todo guardado");
}
function onDoc(name,snap){
  if(!synced){
    got[name]=true;exists[name]=snap.exists();remote[name]=snap.exists()?snap.data().json:null;
    if(Object.keys(DOCS).every(k=>got[k]))initialSync();
    return;
  }
  if(snap.metadata.hasPendingWrites||inflight>0||failed||!snap.exists())return;
  const j=snap.data().json;
  if(!j||j===last[name])return;
  if(modalOpen()){deferred[name]=j;return}
  applyPart(name,j);render();setSync("✓ Todo guardado");
}
setInterval(()=>{if(!synced||modalOpen())return;const n=Object.keys(deferred);if(!n.length)return;n.forEach(k=>{applyPart(k,deferred[k]);delete deferred[k]});render()},1500);
let undoSnapshot=null,undoTimer=null;
const cloneData=()=>JSON.parse(JSON.stringify(data));
function offerUndo(label="Cambio realizado"){undoSnapshot=window.__beforeChange||null;const bar=document.getElementById("undoBar");if(bar){bar.innerHTML=`${esc(label)} <button id="undoAction">Deshacer</button>`;bar.classList.add("show");document.getElementById("undoAction").onclick=()=>{if(undoSnapshot){data=undoSnapshot;undoSnapshot=null;persist();bar.classList.remove("show");render()}};clearTimeout(undoTimer);undoTimer=setTimeout(()=>bar.classList.remove("show"),7000)}}
const save=()=>{persist();render()};
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function showPage(id){$$(".page").forEach(p=>p.classList.toggle("active",p.id===id));$$(".tab").forEach(b=>b.classList.toggle("active",b.dataset.page===id));if(id==="settings")renderSettings();window.scrollTo(0,0)}
$$(".tab").forEach(b=>b.onclick=()=>showPage(b.dataset.page));$$("[data-go]").forEach(b=>b.onclick=()=>showPage(b.dataset.go));$("#settingsShortcut").onclick=()=>showPage("settings");
function openModal(title,fields,onSave){$("#modalTitle").textContent=title;$("#modalFields").innerHTML=fields;$("#modalBackdrop").classList.add("open");$("#modalForm").onsubmit=e=>{e.preventDefault();const v={};new FormData(e.target).forEach((x,k)=>v[k]=x);onSave(v);closeModal()}}
function closeModal(){$("#modalBackdrop").classList.remove("open")}$("#closeModal").onclick=closeModal;$("#modalBackdrop").onclick=e=>{if(e.target.id==="modalBackdrop")closeModal()};
const field=(label,name,type="text",value="",extra="")=>`<label class="field">${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
const selectField=(label,name,options,value)=>`<label class="field">${label}<select name="${name}">${options.map(o=>`<option ${o===value?"selected":""}>${esc(o)}</option>`).join("")}</select></label>`;
function addTask(category="home"){openModal("Nueva tarea",field("Nombre","title","text","","required")+field("Descripción","description")+selectField("Frecuencia","frequency",["Una vez","Diaria","Cada 2 días","Semanal","Cada 2 semanas","Cada mes"],"Una vez")+field("Fecha límite","due","date")+selectField("Categoría","category",["home","self"].map(x=>x==="home"?"Hogar":"Cuidado personal"),category==="self"?"Cuidado personal":"Hogar"),v=>{window.__beforeChange=cloneData();data.tasks.push({id:Date.now(),title:v.title,description:v.description,frequency:v.frequency,due:v.due,category:v.category==="Hogar"?"home":"self",done:false,recurring:v.frequency!=="Una vez",due:v.due||today()});save();offerUndo("Tarea añadida")})}
$("#addGeneralTask").onclick=()=>addTask();$("#taskTabs").onclick=e=>{if(e.target.dataset.filter){taskFilter=e.target.dataset.filter;$$("[data-filter]").forEach(b=>b.classList.toggle("selected",b===e.target));renderTasks()}};$("#taskCategories").onclick=e=>{if(e.target.dataset.cat){taskCat=e.target.dataset.cat;$$("[data-cat]").forEach(b=>b.classList.toggle("selected",b===e.target));renderTasks()}};
function nextOccurrence(date,frequency){
 const base=(date&&date>today())?date:today();const d=new Date(base+"T12:00:00");
 if(frequency==="Diaria")d.setDate(d.getDate()+1);
 else if(frequency==="Cada 2 días")d.setDate(d.getDate()+2);
 else if(frequency==="Semanal")d.setDate(d.getDate()+7);
 else if(frequency==="Cada 2 semanas")d.setDate(d.getDate()+14);
 else if(frequency==="Mensual"||frequency==="Cada mes")d.setMonth(d.getMonth()+1);
 else return "";
 return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function toggleTask(id){
 window.__beforeChange=cloneData();
 let t=data.tasks.find(x=>x.id===id)||data.study.find(x=>x.id===id);
 if(!t)return;
 if(t.recurring){data.completed.push({...t,id:Date.now()+Math.random(),done:true,completedAt:today(),completedOccurrence:t.due});t.due=nextOccurrence(t.due||today(),t.frequency);t.nextDue=t.due;t.done=false;}
 else{t.done=!t.done;t.completedAt=t.done?today():null;if(t.done)data.completed.push({...t,id:Date.now()+Math.random(),done:true,completedAt:today()});else data.completed=data.completed.filter(x=>!(x.title===t.title&&x.completedAt===today()));}
 save();offerUndo(t.done||t.recurring?"Tarea completada":"Tarea restaurada");
}
function taskHTML(t){return `<div class="task-row"><button class="check ${t.done?"checked":""}" data-check="${t.id}">${t.done?"✓":""}</button><div class="task-content ${t.done?"done":""}"><strong>${esc(t.title)}</strong><small>${esc(t.description||t.frequency||"")}${t.due?" · Fecha: "+dateFmt(t.due):""}</small></div><span class="tag">${t.category==="home"?"Hogar":t.category==="self"?"Cuidado":t.subject||"Clase"}</span><button class="text-button" data-edit-task="${t.id}" data-kind="${data.study.includes(t)?"study":"task"}">Editar</button><button class="text-button" data-remove-task="${t.id}" data-kind="${data.study.includes(t)?"study":"task"}">×</button></div>`}
function editTaskItem(t,isStudy){openModal("Editar tarea",field("Nombre","title","text",t.title,"required")+field("Descripción","description","text",t.description||"")+(isStudy?selectField("Asignatura","subject",subjects,t.subject||subjects[0])+field("Fecha de entrega","due","date",t.due||"")+selectField("Prioridad","priority",["Normal","Alta","Urgente"],t.priority||"Normal"):selectField("Frecuencia","frequency",["Una vez","Diaria","Cada 2 días","Semanal","Cada 2 semanas","Cada mes"],t.frequency||"Una vez")+field("Fecha","due","date",t.due||"")),v=>{window.__beforeChange=cloneData();Object.assign(t,v);if(!isStudy){t.recurring=v.frequency!=="Una vez";t.category=t.category||"home"}save();offerUndo("Tarea actualizada")})}
function bindTaskActions(){ $$('[data-check]').forEach(b=>b.onclick=()=>toggleTask(+b.dataset.check));$$('[data-edit-task]').forEach(b=>b.onclick=()=>{const isStudy=b.dataset.kind==="study",t=(isStudy?data.study:data.tasks).find(x=>x.id===+b.dataset.editTask);if(t)editTaskItem(t,isStudy)});$$('[data-remove-task]').forEach(b=>b.onclick=()=>{const isStudy=b.dataset.kind==="study",arr=isStudy?data.study:data.tasks,t=arr.find(x=>x.id===+b.dataset.removeTask);if(!t)return;if(confirm("¿Eliminar esta tarea?")){window.__beforeChange=cloneData();if(isStudy)data.study=data.study.filter(x=>x.id!==t.id);else data.tasks=data.tasks.filter(x=>x.id!==t.id);save();offerUndo("Tarea eliminada")}})}
function renderTasks(){let a=taskFilter==="done"?data.completed.filter(t=>taskCat==="all"||taskCat===t.category):data.tasks.filter(t=>!t.done&&(taskCat==="all"||taskCat===t.category));if(taskFilter==="done"){$("#taskList").innerHTML=a.length?a.slice().reverse().map(t=>`<div class="task-row"><button class="check checked" data-restore-completed="${t.id}">✓</button><div class="task-content done"><strong>${esc(t.title)}</strong><small>Completada: ${dateFmt(t.completedAt)}</small></div><span class="tag">${t.category==="home"?"Hogar":t.category==="self"?"Cuidado":"Clase"}</span><button class="text-button" data-delete-completed="${t.id}">×</button></div>`).join(""):`<div class="empty">Todavía no has completado tareas.</div>`;$$('[data-restore-completed]').forEach(b=>b.onclick=()=>{window.__beforeChange=cloneData();const done=data.completed.find(x=>String(x.id)===b.dataset.restoreCompleted);if(done){data.completed=data.completed.filter(x=>x!==done);const orig=(done.category==="study"?data.study:data.tasks).find(x=>x.title===done.title);if(orig)orig.done=false;else data.tasks.push({...done,id:Date.now(),done:false,completedAt:null});save();offerUndo("Tarea devuelta a pendientes")}});$$('[data-delete-completed]').forEach(b=>b.onclick=()=>{if(confirm("¿Eliminar este registro del historial?")){window.__beforeChange=cloneData();data.completed=data.completed.filter(x=>String(x.id)!==b.dataset.deleteCompleted);save();offerUndo("Registro eliminado")}})}else{$("#taskList").innerHTML=a.length?a.map(taskHTML).join(""):`<div class="empty">No hay tareas pendientes en este apartado.</div>`;bindTaskActions()}}

function subjectGrades(subject){data.grades[subject]??={exams:[],trimesters:[null,null,null]};data.grades[subject].exams??=[];data.grades[subject].trimesters??=[null,null,null];return data.grades[subject]}
function renderGrades(){const panel=$("#gradesPanel");if(selectedSubject==="Todas"){panel.innerHTML=`<div class="grades-hint">Selecciona una asignatura para añadir exámenes y consultar sus notas trimestrales.</div>`;return}const g=subjectGrades(selectedSubject),valid=g.exams.filter(e=>e.grade!==null&&e.grade!==""&&e.grade!==undefined).map(e=>Number(e.grade)).filter(n=>Number.isFinite(n)),avg=valid.length?(valid.reduce((a,b)=>a+b,0)/valid.length).toFixed(2).replace(".",","):"—";panel.innerHTML=`<div class="grades-heading"><div><p class="eyebrow">CALIFICACIONES</p><h3>${esc(selectedSubject)}</h3></div><button class="primary" id="addExam">＋ Examen</button></div><div class="trimester-grid">${g.trimesters.map((n,i)=>`<button class="trimester" data-trimester="${i}"><small>${i+1}º trimestre</small><strong>${n===null||n===""?"—":esc(String(n).replace(".",","))}</strong><span>${n===null||n===""?"Añadir nota":"Editar nota"}</span></button>`).join("")}</div><div class="exam-summary"><strong>Media de exámenes con nota</strong><span>${avg}${avg==="—"?"":" / 10"}</span></div><div class="section-head"><h3>Exámenes registrados</h3><span class="muted">${g.exams.length} exámenes</span></div><div class="stack">${g.exams.length?g.exams.slice().sort((a,b)=>(b.date||"").localeCompare(a.date||"")).map(e=>`<div class="list-row"><div class="task-content"><strong>${esc(e.name)}</strong><small>${e.date?dateFmt(e.date):"Sin fecha"}</small></div><strong class="grade-score">${e.grade===null||e.grade===""?"Pendiente":esc(String(e.grade).replace(".",","))+"/10"}</strong><button class="text-button" data-grade-edit="${e.id}">Editar</button><button class="text-button" data-delete-exam="${e.id}">×</button></div>`).join(""):`<div class="empty">Todavía no has añadido exámenes.</div>`}</div>`;
 const examForm=(e=null)=>openModal(e?"Editar examen":"Añadir examen",field("Nombre del examen","name","text",e?.name||"","required")+field("Fecha del examen","date","date",e?.date||today())+field("Nota (opcional, sobre 10)","grade","number",e?.grade??"",'min="0" max="10" step="0.01"'),v=>{window.__beforeChange=cloneData();const item={id:e?.id||Date.now(),name:v.name,date:v.date,grade:v.grade===""?null:Number(v.grade)};const ex=subjectGrades(selectedSubject).exams;if(e)Object.assign(ex.find(x=>x.id===e.id),item);else ex.push(item);save();offerUndo("Examen guardado")});
 $("#addExam").onclick=()=>examForm();$$('[data-grade-edit]').forEach(b=>b.onclick=()=>examForm(g.exams.find(e=>String(e.id)===b.dataset.gradeEdit)));$$('[data-trimester]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.trimester),current=subjectGrades(selectedSubject).trimesters[i];openModal(`Nota final · ${i+1}º trimestre`,field("Nota final (sobre 10)","grade","number",current??"",'min="0" max="10" step="0.01" required'),v=>{window.__beforeChange=cloneData();subjectGrades(selectedSubject).trimesters[i]=Number(v.grade);save();offerUndo("Nota trimestral guardada")})});$$('[data-delete-exam]').forEach(b=>b.onclick=()=>{if(confirm("¿Eliminar este examen?")){window.__beforeChange=cloneData();const gg=subjectGrades(selectedSubject);gg.exams=gg.exams.filter(e=>String(e.id)!==b.dataset.deleteExam);save();offerUndo("Examen eliminado")}})
}
function renderStudy(){let counts=subjects.map(s=>data.study.filter(t=>t.subject===s&&!t.done).length);$("#subjects").innerHTML=subjects.map((s,i)=>{const g=subjectGrades(s),filled=g.trimesters.filter(n=>n!==null&&n!=="").length;return `<button class="subject ${selectedSubject===s?"selected":""}" data-subject="${esc(s)}"><strong>${esc(s)}</strong><small>${counts[i]} pendientes · ${filled}/3 trimestres</small></button>`}).join("");$$('[data-subject]').forEach(b=>b.onclick=()=>{selectedSubject=selectedSubject===b.dataset.subject?"Todas":b.dataset.subject;renderStudy()});renderGrades();let a=data.study.filter(t=>!t.done&&(selectedSubject==="Todas"||t.subject===selectedSubject));$("#studyList").innerHTML=a.length?a.map(taskHTML).join(""):`<div class="empty">No hay trabajos pendientes${selectedSubject!=="Todas"?" en esta asignatura":""}.</div>`;bindTaskActions()}
function addStudy(){openModal("Añadir trabajo",field("Nombre del trabajo","title","text","","required")+field("Descripción","description")+selectField("Asignatura","subject",subjects,subjects[0])+field("Fecha de entrega","due","date")+selectField("Prioridad","priority",["Normal","Alta","Urgente"],"Normal"),v=>{window.__beforeChange=cloneData();data.study.push({id:Date.now(),title:v.title,description:v.description,subject:v.subject,due:v.due,priority:v.priority,category:"study",done:false});save();offerUndo("Trabajo añadido")})}
$("#addStudyTask").onclick=addStudy;
function renderHome(){
 const all=[...data.tasks,...data.study];
 // El progreso es diario: cuenta las tareas pendientes que vencen hoy (o antes)
 // y las ocurrencias completadas hoy. Así el denominador no cambia al marcar una tarea.
 const pendingToday=all.filter(t=>!t.done&&(!t.due||t.due<=today()));
 const completedToday=data.completed.filter(t=>t.completedAt===today());
 const done=completedToday.length;
 const total=done+pendingToday.length;
 const pct=total?Math.round(done/total*100):0;
 $("#progressText").textContent=pct+"%";
 $("#progressBar").style.width=pct+"%";
 $("#progressCaption").textContent=total?`${done} de ${total} tareas de hoy completadas.`:"No tienes tareas programadas para hoy.";
 const dueToday=pendingToday.slice(0,5);
 $("#todayTasks").innerHTML=dueToday.length?dueToday.map(taskHTML).join(""):`<div class="empty">¡No tienes tareas pendientes para hoy!</div>`;
 bindTaskActions();
 let f=data.foods.filter(x=>x.date===today()).reduce((a,x)=>a+Number(x.calories||0),0);$("#homeCalories").textContent=Math.round(f)+" kcal";$("#homeWater").textContent=(data.water[today()]||0)+" / "+data.settings.waterGoal;$("#homeSteps").textContent=Number(data.steps[today()]||0).toLocaleString("es-ES");$("#homeExercise").textContent=data.exercises.filter(x=>x.date===today()).reduce((a,x)=>a+Number(x.burned||0),0)+" kcal";
 let up=data.study.filter(t=>!t.done&&t.due).sort((a,b)=>a.due.localeCompare(b.due)).slice(0,3);$("#upcoming").innerHTML=up.length?up.map(t=>`<div class="list-row"><div class="task-content"><strong>${esc(t.title)}</strong><small>${esc(t.subject)} · ${dateFmt(t.due)}</small></div><span class="tag">${esc(t.priority||"Normal")}</span></div>`).join(""):`<div class="empty">Todavía no tienes entregas registradas.</div>`
}
function renderCalendar(){let d=new Date(2026,10+monthIndex,1),y=d.getFullYear(),m=d.getMonth(),first=(d.getDay()+6)%7,days=new Date(y,m+1,0).getDate();$("#monthTitle").textContent=d.toLocaleDateString("es-ES",{month:"long",year:"numeric"});let html="";for(let i=0;i<first;i++)html+=`<button class="day other" disabled></button>`;for(let n=1;n<=days;n++){let iso=`${y}-${String(m+1).padStart(2,"0")}-${String(n).padStart(2,"0")}`,has=[...data.tasks,...data.study].some(t=>t.due===iso)||!!data.notes[iso];html+=`<button class="day ${iso===today()?"today":""} ${iso===selectedDay?"selected":""} ${has?"has":""}" data-day="${iso}">${n}</button>`}$("#calendarGrid").innerHTML=html;$$("[data-day]").forEach(b=>b.onclick=()=>{selectedDay=b.dataset.day;renderCalendar();renderDay()});renderDay()}
function renderDay(){let d=selectedDay;$("#selectedDateTitle").textContent=new Date(d+"T12:00:00").toLocaleDateString("es-ES",{weekday:"long",day:"numeric",month:"long"});let tasks=[...data.tasks,...data.study].filter(t=>t.due===d),done=data.completed.filter(t=>t.completedAt===d),note=data.notes[d]||[];let html=tasks.map(t=>`<div class="list-row"><div class="task-content"><strong>${esc(t.title)}</strong><small>${esc(t.subject|| (t.category==="home"?"Hogar":t.category==="self"?"Cuidado personal":"Clase"))}</small></div><span class="tag">${t.done?"Hecha":"Pendiente"}</span></div>`).join("")+done.map(t=>`<div class="list-row"><div class="task-content done"><strong>${esc(t.title)}</strong><small>Completada este día</small></div><span class="tag">✓ Hecha</span></div>`).join("")+note.map((n,i)=>`<div class="list-row"><div class="task-content"><strong>${esc(n.title)}</strong><small>${esc(n.text||"Nota personal")}</small></div><button class="text-button" data-delnote="${i}">×</button></div>`).join("");$("#dayDetails").innerHTML=html||`<div class="empty">No hay nada anotado para este día.</div>`;$$("[data-delnote]").forEach(b=>b.onclick=()=>{data.notes[d].splice(+b.dataset.delnote,1);save()})}
$("#prevMonth").onclick=()=>{if(monthIndex>0){monthIndex--;renderCalendar()}};$("#nextMonth").onclick=()=>{if(monthIndex<7){monthIndex++;renderCalendar()}};$("#addNote").onclick=()=>openModal("Añadir anotación",field("Título","title","text","","required")+`<label class="field">Nota<textarea name="text"></textarea></label>`,v=>{data.notes[selectedDay]??=[];data.notes[selectedDay].push(v);save()});
const meals=["Desayuno","Almuerzo","Comida","Merienda","Cena"];
function renderHealth(){let foods=data.foods.filter(f=>f.date===today()),total=foods.reduce((a,f)=>a+Number(f.calories||0),0),goal=Number(data.profile.goal||0);$("#calorieTotal").textContent=Math.round(total);$("#calorieGoalLabel").textContent=goal?`Objetivo orientativo: ${goal} kcal`:"Configura tus datos para calcular un objetivo";let pct=goal?Math.min(100,Math.round(total/goal*100)):0;$("#caloriePercent").textContent=pct+"%";$("#calorieRing").style.background=`conic-gradient(var(--accent) ${pct*3.6}deg,#e9ece5 0deg)`;$("#mealList").innerHTML=meals.map(m=>{let a=foods.filter(f=>f.meal===m),sum=a.reduce((x,f)=>x+Number(f.calories||0),0);return `<div class="meal"><h4>${m}</h4><p>${Math.round(sum)} kcal · ${a.length} alimentos</p>${a.map(f=>`<div class="food-line"><small>${esc(f.name)} (${f.amount}${esc(f.unit)}) · ${Math.round(f.calories)} kcal</small><span><button class="text-button" data-edit-food="${f.id}">Editar</button><button class="text-button" data-delete-food="${f.id}">×</button></span></div>`).join("")}</div>`}).join("");$$('[data-edit-food]').forEach(b=>b.onclick=()=>editFood(+b.dataset.editFood));$$('[data-delete-food]').forEach(b=>b.onclick=()=>{if(confirm("¿Eliminar este alimento?")){window.__beforeChange=cloneData();data.foods=data.foods.filter(f=>f.id!==+b.dataset.deleteFood);save();offerUndo("Alimento eliminado")}});let w=data.water[today()]||0;$("#waterCount").textContent=`${w} / ${data.settings.waterGoal} vasos`;$("#waterGlasses").innerHTML=Array.from({length:Math.min(20,Number(data.settings.waterGoal))},(_,i)=>`<button class="glass ${i<w?"full":""}" data-glass="${i+1}">▥</button>`).join("");$$('[data-glass]').forEach(b=>b.onclick=()=>{data.water[today()]=+b.dataset.glass;save()});let ex=data.exercises.filter(e=>e.date===today());$("#exerciseList").innerHTML=ex.length?ex.map(e=>`<div class="list-row"><div class="task-content"><strong>${esc(e.type)}</strong><small>${e.duration} min · ${e.burned} kcal aprox. · ${esc(e.intensity||"Moderada")}</small></div><button class="text-button" data-edit-exercise="${e.id}">Editar</button><button class="text-button" data-delete-exercise="${e.id}">×</button></div>`).join(""):`<div class="empty">Aún no has registrado ejercicio hoy.</div>`;$$('[data-edit-exercise]').forEach(b=>b.onclick=()=>editExercise(+b.dataset.editExercise));$$('[data-delete-exercise]').forEach(b=>b.onclick=()=>{if(confirm("¿Eliminar este ejercicio?")){window.__beforeChange=cloneData();data.exercises=data.exercises.filter(e=>e.id!==+b.dataset.deleteExercise);save();offerUndo("Ejercicio eliminado")}});$("#stepsNumber").textContent=Number(data.steps[today()]||0).toLocaleString("es-ES");$("#exerciseMinutes").textContent=ex.reduce((a,e)=>a+Number(e.duration),0)+" min";$("#exerciseBurned").textContent=ex.reduce((a,e)=>a+Number(e.burned),0)+" kcal";let p=data.profile;$("#profileSummary").innerHTML=p.age?`<p><b>${p.weight} kg</b> actuales · Objetivo ${p.targetWeight||"—"} kg</p><p>${p.height} cm · ${p.age} años · ${p.activity}</p><p>Metabolismo basal estimado: <b>${p.bmr||"—"} kcal</b></p><p>Gasto diario estimado: <b>${p.tdee||"—"} kcal</b></p><p>Objetivo orientativo: <b>${p.goal||"—"} kcal/día</b></p>`:`<p class="muted">Añade tus datos para calcular una estimación de tus necesidades energéticas.</p>`}
const commonFoodEstimates={"manzana":52,"platano":89,"plátano":89,"pechuga de pollo":120,"pollo":165,"arroz cocido":130,"arroz":360,"pasta cocida":158,"pasta":350,"huevo":143,"huevos":143,"patata cocida":87,"patata":77,"tomate":18,"lechuga":15,"aguacate":160,"yogur natural":61,"pan":265,"pan integral":247,"salmon":208,"salmón":208,"atun":116,"atún":116,"queso fresco":98,"avena":389,"leche":47,"fresas":32,"naranja":47,"almendras":579,"aceite de oliva":884};
async function lookupFoodNutrition(name){const key=name.trim().toLowerCase();try{const url='https://world.openfoodfacts.org/cgi/search.pl?search_terms='+encodeURIComponent(name)+'&search_simple=1&action=process&json=1&page_size=10&fields=product_name,brands,nutriments';const r=await fetch(url);if(r.ok){const j=await r.json(),products=(j.products||[]).filter(p=>Number(p.nutriments?.['energy-kcal_100g']||p.nutriments?.['energy-kcal_value'])>0);if(products.length){const tokens=key.split(/\s+/).filter(w=>w.length>2),ranked=products.map(p=>({p,score:tokens.filter(t=>(p.product_name||'').toLowerCase().includes(t)||(p.brands||'').toLowerCase().includes(t)).length})).sort((a,b)=>b.score-a.score),best=ranked[0];if(best&&(best.score>=Math.max(1,Math.ceil(tokens.length*.5))||(best.p.product_name||'').toLowerCase()===key)){const exact=best.p,n=Number(exact.nutriments['energy-kcal_100g']||exact.nutriments['energy-kcal_value']);return {kcal:n,source:'Open Food Facts',match:exact.product_name||name}}}}}catch(e){}const match=Object.keys(commonFoodEstimates).sort((a,b)=>b.length-a.length).find(k=>key.includes(k));if(match)return {kcal:commonFoodEstimates[match],source:'estimación orientativa',match:name};return null}
function foodForm(f=null){openModal(f?"Editar alimento":"Añadir alimento",field("Alimento o producto","name","text",f?.name||"","required")+field("Cantidad","amount","number",f?.amount||"100",'min="0.1" step="0.1" required')+selectField("Unidad","unit",["g","ml"],f?.unit||"g")+selectField("Comida","meal",meals,f?.meal||"Desayuno")+`<p class="muted">Organize buscará las calorías automáticamente. Si no encuentra el alimento, te lo indicará.</p>`,async v=>{const btn=document.querySelector('#modalForm button[type="submit"]');let result=await lookupFoodNutrition(v.name);if(!result){alert("No he encontrado información nutricional fiable para este alimento. Prueba con un nombre más concreto o un producto envasado.");return}const factor=Number(v.amount)/100,calories=Math.round(result.kcal*factor);window.__beforeChange=cloneData();const item={id:f?.id||Date.now(),date:f?.date||today(),name:v.name,amount:Number(v.amount),unit:v.unit,meal:v.meal,calories,kcalPer100:result.kcal,source:result.source};if(f)Object.assign(data.foods.find(x=>x.id===f.id),item);else data.foods.push(item);save();offerUndo("Alimento guardado");alert(`${result.match}: aproximadamente ${calories} kcal (${result.source}).`)});}
function editFood(id){const f=data.foods.find(x=>x.id===id);if(f)foodForm(f)}
$("#addFood").onclick=()=>foodForm();
const metValues={"Caminar":3.5,"Correr":8.3,"Gimnasio":5,"Bicicleta":6.8,"Natación":6,"Yoga":2.5,"Pilates":3,"Otro":4};
function estimateExercise(type,duration,intensity){const weight=Number(data.profile.weight)||70,base=metValues[type]||4,factor={"Suave":0.75,"Moderada":1,"Intensa":1.25}[intensity]||1;return Math.round(base*factor*3.5*weight/200*Number(duration))}
function exerciseForm(e=null){openModal(e?"Editar ejercicio":"Registrar ejercicio",selectField("Tipo de ejercicio","type",Object.keys(metValues),e?.type||"Caminar")+field("Duración (minutos)","duration","number",e?.duration||"30",'min="1" required')+selectField("Intensidad","intensity",["Suave","Moderada","Intensa"],e?.intensity||"Moderada")+`<p class="muted">Las calorías se estiman automáticamente según el tipo, duración, intensidad y peso de tu perfil. No sustituyen la medición del Apple Watch.</p>`,v=>{window.__beforeChange=cloneData();const burned=estimateExercise(v.type,v.duration,v.intensity),item={id:e?.id||Date.now(),date:e?.date||today(),...v,burned};if(e)Object.assign(data.exercises.find(x=>x.id===e.id),item);else data.exercises.push(item);save();offerUndo("Ejercicio guardado")})}
function editExercise(id){const e=data.exercises.find(x=>x.id===id);if(e)exerciseForm(e)}
$("#addExercise").onclick=()=>exerciseForm();

function calculateProfile(p){let weight=Number(p.weight),height=Number(p.height),age=Number(p.age);let bmr=Math.round(10*weight+6.25*height-5*age-161),factor={"Sedentaria":1.2,"Ligera":1.375,"Moderada":1.55,"Alta":1.725}[p.activity]||1.2,tdee=Math.round(bmr*factor),deficit={"Lento":200,"Moderado":300,"Más gradual":150}[p.pace]||200;return {...p,bmr,tdee,goal:Math.max(1200,tdee-deficit)}}
function editProfile(){let p=data.profile;openModal("Mis datos",field("Edad","age","number",p.age||"",'min="18" required')+field("Altura (cm)","height","number",p.height||"",'min="100" required')+field("Peso actual (kg)","weight","number",p.weight||"",'min="30" step=".1" required')+field("Peso objetivo (kg)","targetWeight","number",p.targetWeight||"",'min="30" step=".1"')+selectField("Actividad habitual","activity",["Sedentaria","Ligera","Moderada","Alta"],p.activity||"Sedentaria")+selectField("Ritmo deseado","pace",["Más gradual","Lento","Moderado"],p.pace||"Lento"),v=>{data.profile=calculateProfile(v);save()})}
$("#editProfile").onclick=editProfile;
function renderSettings(){let s=data.settings;$("#accent").value=s.accent||"sage";$("#theme").value=s.theme||"light";$("#userName").value=s.userName||"";$("#waterGoal").value=s.waterGoal;$("#glassMl").value=s.glassMl;$("#stepGoal").value=s.stepGoal}
["accent","theme","userName","waterGoal","glassMl","stepGoal"].forEach(id=>$("#"+id).addEventListener("change",()=>{let v=$("#"+id).value;data.settings[id]=["waterGoal","glassMl","stepGoal"].includes(id)?Number(v):v;applySettings();save()}));
function applySettings(){let s=data.settings;document.body.classList.toggle("dark",s.theme==="dark");let colors={sage:"#82947c",blue:"#7895ad",rose:"#b98791"};document.documentElement.style.setProperty("--accent",colors[s.accent]||colors.sage);document.documentElement.style.setProperty("--accent-soft",s.accent==="blue"?"#e7eef4":s.accent==="rose"?"#f4e9eb":"#eaf0e7")}
$("#exportData").onclick=()=>{let blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="organize-backup.json";a.click();URL.revokeObjectURL(a.href)};$("#resetData").onclick=()=>{if(confirm("¿Seguro que quieres borrar todos tus datos? También se borrarán de la nube.")){data={tasks:JSON.parse(JSON.stringify(defaults)),foods:[],exercises:[],notes:{},water:{},steps:{},profile:{},settings:{...DEFAULT_SETTINGS},study:[],completed:[],grades:{}};data.tasks.forEach(t=>{t.due=today();t.recurring=t.frequency!=="Una vez"});persist();render();showPage("home")}};
function render(){applySettings();renderHome();renderTasks();renderStudy();renderCalendar();renderHealth()}
let now=new Date();$("#todayLabel").textContent=now.toLocaleDateString("es-ES",{weekday:"long",day:"numeric",month:"long"}).toUpperCase();$("#dateChip").textContent=now.toLocaleDateString("es-ES",{day:"numeric",month:"short"});$("#dateHeading").textContent="Tu día, a tu ritmo.";$("#greeting").textContent=(data.settings.userName?`Hola, ${data.settings.userName}`:"Hola, hoy es un buen día");
render();if("serviceWorker"in navigator&&location.protocol.startsWith("http"))navigator.serviceWorker.register("./sw.js").catch(()=>{});

/* Sin contraseña: la página entra sola con acceso anónimo de Firebase */
if(!configured){
  setSync("Modo local: falta pegar los datos de Firebase en app.js. Nada se guarda en la nube.",true);
}else{
  onAuthStateChanged(auth,user=>{
    unsubs.forEach(u=>u());unsubs=[];synced=false;inflight=0;failed=false;last={};got={};exists={};remote={};deferred={};
    setSync("Conectando…");
    if(!user){
      signInAnonymously(auth).catch(err=>{const c=err&&err.code;setSync(c==="auth/operation-not-allowed"?"⚠ Falta activar el acceso anónimo en Firebase (Authentication → Método de acceso → Anónimo).":"⚠ No se puede conectar ("+(c||"error")+"). Revisa la conexión.",true)});
      return;
    }
    setTimeout(()=>{if(!synced&&auth.currentUser)setSync("⚠ No se puede conectar con la base de datos. Revisa la conexión.",true)},10000);
    Object.keys(DOCS).forEach(name=>unsubs.push(onSnapshot(refs[name],snap=>onDoc(name,snap),err=>setSync("⚠ No se puede leer la base de datos ("+((err&&err.code)||"error")+").",true))));
  });
}
