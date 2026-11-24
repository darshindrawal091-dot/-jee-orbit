import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCeLTB2i1efnI4tHjAdwUfp7wPwtqt-QPo",
  authDomain: "jee-orbit.firebaseapp.com",
  projectId: "jee-orbit",
  storageBucket: "jee-orbit.firebasestorage.app",
  messagingSenderId: "108702149111",
  appId: "1:108702149111:web:7cd73846f254d159e8e6f2",
  measurementId: "G-PGTMC7JYBH"
};
const firebaseReady = !Object.values(firebaseConfig).some(v => v.startsWith("PASTE_"));

const $ = id => document.getElementById(id);
const today = new Date();
$("today-label").textContent = today.toLocaleDateString(undefined,{weekday:"long",day:"numeric",month:"long",year:"numeric"});
$("video-date").textContent = today.toLocaleDateString(undefined,{weekday:"long",month:"short",day:"numeric"});
const dateKey = today.getFullYear()+"-"+String(today.getMonth()+1).padStart(2,"0")+"-"+String(today.getDate()).padStart(2,"0");
const dayNumber = Math.floor(Date.now()/86400000);
const dailyVideoQueries = [
 "JEE aspirant motivation short discipline",
 "JEE preparation study motivation short",
 "IIT JEE consistency motivation short video",
 "JEE aspirant comeback motivation short",
 "JEE study focus motivation short"
];
$("video-link").href = "https://www.youtube.com/results?search_query=" + encodeURIComponent(dailyVideoQueries[dayNumber % dailyVideoQueries.length]);

const quotes = [
 "You don't need a perfect day. You need to begin, then keep going.",
 "Small, focused sessions become big results over time.",
 "Your future is shaped by what you do consistently, not occasionally.",
 "Don't measure today's effort against someone else's highlight reel.",
 "Start where you are. Use the time you have. Do the next problem."
];
$("quote-text").textContent = quotes[dayNumber % quotes.length];

let app=null, auth=null, db=null, user=null, unsubscribe=null;
let state = {
 duration: 7200,
 endAt: null,
 remaining: 7200,
 running: false,
 tasks: [],
 studyDates: [],
 dailySeconds: {}, // { "YYYY-MM-DD": secondsStudied }
 bestStreak: 0,
 exams: [
   { id: "1", name: "JEE Main", date: "" },
   { id: "2", name: "JEE Advanced", date: "" }
 ],
 marks: [], // { date, scored, max }
 dailyGoalHours: 6
};
let ticker=null, saveTimeout=null, remoteApplying=false;

function toast(message){const t=$("toast");t.textContent=message;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2300)}
function currentRemaining(){return state.running && state.endAt ? Math.max(0,Math.ceil((state.endAt-Date.now())/1000)) : state.remaining}
function fmt(total){const h=Math.floor(total/3600),m=Math.floor(total%3600/60),s=total%60;return [h,m,s].map(x=>String(x).padStart(2,"0")).join(":")}

function dateDaysLeft(dateString){
 if(!dateString)return null;
 const target=new Date(dateString+"T00:00:00");
 if(Number.isNaN(target.getTime()))return null;
 const todayLocal=new Date();todayLocal.setHours(0,0,0,0);
 return Math.ceil((target-todayLocal)/86400000);
}

function streakInfo(){
 const dates=[...new Set(state.studyDates||[])].sort();
 if(!dates.length)return {current:0,best:state.bestStreak||0};
 const set=new Set(dates);
 let best=1,run=1;
 for(let i=1;i<dates.length;i++){
  const prev=new Date(dates[i-1]+"T00:00:00"),cur=new Date(dates[i]+"T00:00:00");
  const diff=Math.round((cur-prev)/86400000);
  run=diff===1?run+1:1;best=Math.max(best,run);
 }
 let current=0;
 const cursor=new Date();cursor.setHours(0,0,0,0);
 const todayStr=cursor.getFullYear()+"-"+String(cursor.getMonth()+1).padStart(2,"0")+"-"+String(cursor.getDate()).padStart(2,"0");
 if(set.has(todayStr)||set.has((()=>{const d=new Date(cursor);d.setDate(d.getDate()-1);return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()-1).padStart(2,"0")})())){
  while(true){
   const key=cursor.getFullYear()+"-"+String(cursor.getMonth()+1).padStart(2,"0")+"-"+String(cursor.getDate()).padStart(2,"0");
   if(!set.has(key))break;
   current++;cursor.setDate(cursor.getDate()-1);
  }
 }
 return {current,best:Math.max(best,state.bestStreak||0)};
}

function drawHoursChart(){
 const canvas=$("hours-chart");if(!canvas)return;
 const ctx=canvas.getContext("2d");
 ctx.clearRect(0,0,canvas.width,canvas.height);
 const days=[];
 for(let i=6;i>=0;i--){
  const d=new Date();d.setDate(d.getDate()-i);
  const k=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
  const label=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()];
  const secs=state.dailySeconds?.[k]||0;
  days.push({label,hours:secs/3600});
 }
 const maxH=Math.max(6,...days.map(d=>d.hours));
 const w=canvas.width,h=canvas.height,pad=24,barW=(w-pad*2)/7-8;
 ctx.fillStyle="#8192a9";ctx.font="9px DM Sans";
 days.forEach((d,i)=>{
  const bx=pad+i*((w-pad*2)/7),bh=(d.hours/maxH)*(h-35);
  const by=h-20-bh;
  ctx.fillStyle=d.hours>= (state.dailyGoalHours||6)?"#72d6ae":"#5799ed";
  ctx.fillRect(bx+2,by,barW,Math.max(3,bh));
  ctx.fillStyle="#8192a9";
  ctx.fillText(d.label,bx+2,h-7);
 });
}

function drawMarksChart(){
 const canvas=$("marks-chart");if(!canvas)return;
 const ctx=canvas.getContext("2d");
 ctx.clearRect(0,0,canvas.width,canvas.height);
 const marks=(state.marks||[]).sort((a,b)=>new Date(a.date)-new Date(b.date));
 if(!marks.length){
  ctx.fillStyle="#8192a9";ctx.font="11px DM Sans";ctx.fillText("No coaching tests recorded yet.",15,35);
  $("marks-list-summary").textContent="Log coaching test scores to track your percentage trend.";
  return;
 }
 const w=canvas.width,h=canvas.height,pad=30;
 const maxScore=100; // percentage
 let prevX=null,prevY=null;
 ctx.strokeStyle="#83baff";ctx.lineWidth=2;ctx.beginPath();
 marks.forEach((m,i)=>{
  const pct=Math.min(100,Math.max(0,(m.scored/m.max)*100));
  const x=pad+i*((w-pad*2)/Math.max(1,marks.length-1));
  const y=h-20-(pct/100)*(h-35);
  if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
  ctx.fillStyle="#83baff";ctx.beginPath();ctx.arc(x,y,3.5,0,Math.PI*2);ctx.fill();
 });
 ctx.stroke();
 const latest=marks[marks.length-1];
 const latestPct=((latest.scored/latest.max)*100).toFixed(1);
 $("marks-list-summary").textContent=`Latest: ${latest.scored}/${latest.max} (${latestPct}%) on ${new Date(latest.date+"T00:00:00").toLocaleDateString()}`;
}

function renderStats(){
 const info=streakInfo();
 $("streak-value").textContent=info.current+" day"+(info.current===1?"":"s");
 $("best-streak").textContent=info.best+" days";
 
 const goalSecs=(state.dailyGoalHours||6)*3600;
 const todaySecs=(state.dailySeconds?.[dateKey]||0);
 const goalPct=Math.min(100,(todaySecs/goalSecs)*100);
 const remSecs=Math.max(0,goalSecs-todaySecs);
 const remH=Math.floor(remSecs/3600),remM=Math.floor((remSecs%3600)/60);
 const curH=Math.floor(todaySecs/3600),curM=Math.floor((todaySecs%3600)/60);

 $("goal-target-label").textContent=(state.dailyGoalHours||6)+"h";
 $("goal-status-text").textContent=`${curH}h ${curM}m studied`;
 $("goal-progress-bar").style.width=goalPct+"%";
 $("goal-left-text").textContent=remSecs===0?"🎉 Daily goal achieved!":`${remH}h ${remM}m remaining to reach goal`;

 const doneToday=(state.studyDates||[]).includes(dateKey);
 $("studied-btn").textContent=doneToday?"Day Completed ✓":"Complete a day";
 $("streak-note").textContent=doneToday?"Today's study logged. Keep the streak!":"Log your study session to build streak.";

 const weekStart=new Date();weekStart.setHours(0,0,0,0);weekStart.setDate(weekStart.getDate()-((weekStart.getDay()+6)%7));
 const labels=["M","T","W","T","F","S","S"];const dates=new Set(state.studyDates||[]);const week=$("week-progress");week.innerHTML="";let weekDone=0;
 for(let i=0;i<7;i++){const d=new Date(weekStart);d.setDate(weekStart.getDate()+i);const key=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");const done=dates.has(key);if(done)weekDone++;const item=document.createElement("div");item.className="week-day"+(done?" done":"");item.innerHTML='<div class="week-dot"></div>'+labels[i];week.append(item)}
 $("week-summary").textContent=weekDone+" of 7 days this week";
 drawHoursChart();
 drawMarksChart();

 // Render multiple exams
 const examContainer=$("exams-container");
 examContainer.innerHTML="";
 if(!state.exams||!state.exams.length){
  examContainer.innerHTML='<div class="stat-note">No exams added yet. Tap "+ Add Exam".</div>';
 }else{
  state.exams.forEach(ex=>{
   const daysLeft=dateDaysLeft(ex.date);
   const daysText=daysLeft===null?"Set date":daysLeft<0?"Passed":daysLeft===0?"Exam day!":daysLeft+" days";
   const div=document.createElement("div");
   div.className="exam-item";
   div.innerHTML=`<div class="exam-item-info"><b>${ex.name}</b><span>${ex.date?new Date(ex.date+"T00:00:00").toLocaleDateString():"No date set"}</span></div><div style="display:flex;align-items:center;gap:10px;"><span class="exam-countdown-val">${daysText}</span><button class="delete-task" data-id="${ex.id}">×</button></div>`;
   div.querySelector("button").addEventListener("click",()=>{
    state.exams=state.exams.filter(e=>e.id!==ex.id);
    scheduleSave();render();toast("Exam removed.");
   });
   examContainer.append(div);
  });
 }
}

function render(){
 const rem=currentRemaining(); 
 const timeStr=fmt(rem);
 $("timer-display").textContent=timeStr;
 if($("pip-time")) $("pip-time").textContent=timeStr;
 
 const pct=state.duration?Math.min(100,Math.max(0,(1-rem/state.duration)*100)):0;
 $("timer-progress-bar").style.width=pct+"%";
 const stateText=rem===0?"Session complete — well done.":state.running?"Timer is running":state.remaining===state.duration?"Ready when you are":"Paused";
 $("timer-state").textContent=stateText;
 if($("pip-status")) $("pip-status").textContent=state.running?"Running":"Paused";

 $("start-btn").disabled=state.running||rem===0; 
 $("pause-btn").disabled=!state.running;
 $("sync-status").textContent=user?"Synced to your account":"Saved on this device";
 renderTasks();
 renderStats();
}

function saveLocal(){localStorage.setItem("jeeOrbitState",JSON.stringify(state))}
function scheduleSave(){saveLocal(); if(user && db && !remoteApplying){clearTimeout(saveTimeout);saveTimeout=setTimeout(saveCloud,450)}}
async function saveCloud(){
 if(!user||!db)return;
 try{state.updatedAt=Date.now();await setDoc(doc(db,"users",user.uid,"appData","main"),{...state},{merge:true});saveLocal()}
 catch(e){console.error(e);toast("Cloud save failed.")}
}

function renderTasks(){
 const list=$("task-list");list.innerHTML="";
 state.tasks.forEach((task,i)=>{
  const li=document.createElement("li");li.className="task-item"+(task.done?" done":"");
  const cb=document.createElement("input");cb.type="checkbox";cb.checked=!!task.done;
  cb.addEventListener("change",()=>{state.tasks[i].done=cb.checked;scheduleSave();render()});
  const span=document.createElement("span");span.textContent=task.text;
  const del=document.createElement("button");del.className="delete-task";del.textContent="×";
  del.addEventListener("click",()=>{state.tasks.splice(i,1);scheduleSave();render()});
  li.append(cb,span,del);list.append(li);
 });
 const done=state.tasks.filter(t=>t.done).length;$("task-count").textContent=done+" of "+state.tasks.length+" completed";
}

function applyDuration(){
 const h=Number($("hours").value),m=Number($("minutes").value),s=Number($("seconds").value);
 if(!Number.isInteger(h)||!Number.isInteger(m)||!Number.isInteger(s)||h<0||h>99||m<0||m>59||s<0||s>59||h*3600+m*60+s<=0){toast("Enter valid duration.");return}
 state.duration=h*3600+m*60+s;state.remaining=state.duration;state.endAt=null;state.running=false;scheduleSave();render();toast("Timer applied.");
}

let reminderTicker=null,lastReminderAt=0;
async function enableReminders(){
 if(!("Notification" in window)){toast("Notifications not supported.");return}
 const permission=await Notification.requestPermission();
 const intervalHours=Number($("reminder-interval-input").value)||2;
 if(permission==="granted"){
  localStorage.setItem("jeeOrbitReminders","on");
  $("reminder-status").textContent=`Enabled: every ${intervalHours}h with goal progress.`;
  $("reminder-btn").textContent="Reminders on";
  toast("Smart reminders enabled.");
 }else{
  $("reminder-status").textContent="Notifications permission denied.";
  toast("Permission not granted.");
 }
}

async function sendStudyReminder(){
 const goalSecs=(state.dailyGoalHours||6)*3600;
 const studiedSecs=state.dailySeconds?.[dateKey]||0;
 const leftSecs=Math.max(0,goalSecs-studiedSecs);
 const h=Math.floor(leftSecs/3600), m=Math.floor((leftSecs%3600)/60);
 const message=`Study check-in! You have studied ${Math.floor(studiedSecs/3600)}h today. ${h}h ${m}m remaining to reach your goal.`;
 try{
  const reg=await navigator.serviceWorker?.getRegistration();
  if(reg)await reg.showNotification("JEE Orbit Goal Reminder",{body:message,icon:"./icon.svg",tag:"jee-orbit-reminder"});
  else new Notification("JEE Orbit Goal Reminder",{body:message});
 }catch(e){console.warn("Notification unavailable",e)}
}

function checkReminder(){
 if(!state.running)return;
 const intervalHours=Number($("reminder-interval-input").value)||2;
 const now=Date.now();
 if(!lastReminderAt)lastReminderAt=now;
 if(now-lastReminderAt>=intervalHours*3600*1000){
  lastReminderAt=now;
  sendStudyReminder();
 }
}

function startReminderClock(){
 if(localStorage.getItem("jeeOrbitReminders")==="on"&&"Notification" in window&&Notification.permission==="granted"){
  if(!lastReminderAt)lastReminderAt=Date.now();
  if(reminderTicker)clearInterval(reminderTicker);
  reminderTicker=setInterval(checkReminder,30000);
 }
}
function stopReminderClock(){if(reminderTicker)clearInterval(reminderTicker);reminderTicker=null}

$("reminder-btn").addEventListener("click",enableReminders);
if(localStorage.getItem("jeeOrbitReminders")==="on"){
 $("reminder-status").textContent="Enabled with goal tracking.";
 $("reminder-btn").textContent="Reminders on";
}

$("apply-btn").addEventListener("click",applyDuration);
$("apply-goal-btn").addEventListener("click",()=>{
 const g=Number($("daily-goal-hours").value);
 if(!g||g<1||g>24){toast("Enter valid daily goal hours (1-24).");return}
 state.dailyGoalHours=g;scheduleSave();render();toast("Daily goal updated!");
});

$("start-btn").addEventListener("click",()=>{
 if(currentRemaining()<=0)return;
 state.remaining=currentRemaining();
 state.endAt=Date.now()+state.remaining*1000;
 state.running=true;
 scheduleSave();render();startTicker();startReminderClock();
});

$("pause-btn").addEventListener("click",()=>{
 const elapsed=state.duration-currentRemaining();
 if(elapsed>0){
  state.dailySeconds=state.dailySeconds||{};
  state.dailySeconds[dateKey]=(state.dailySeconds[dateKey]||0)+elapsed;
 }
 state.remaining=currentRemaining();state.endAt=null;state.running=false;
 scheduleSave();render();stopTicker();stopReminderClock();
});

$("reset-btn").addEventListener("click",()=>{
 const elapsed=state.duration-currentRemaining();
 if(elapsed>0){
  state.dailySeconds=state.dailySeconds||{};
  state.dailySeconds[dateKey]=(state.dailySeconds[dateKey]||0)+elapsed;
 }
 state.running=false;state.endAt=null;state.remaining=state.duration;
 scheduleSave();render();stopTicker();stopReminderClock();toast("Timer reset.");
});

function startTicker(){
 stopTicker();
 ticker=setInterval(()=>{
  const rem=currentRemaining();
  if(rem<=0){
   state.remaining=0;state.endAt=null;state.running=false;
   state.dailySeconds=state.dailySeconds||{};
   state.dailySeconds[dateKey]=(state.dailySeconds[dateKey]||0)+state.duration;
   scheduleSave();stopTicker();toast("Session complete!");
   if(localStorage.getItem("jeeOrbitReminders")==="on"&&Notification.permission==="granted")sendStudyReminder();
   stopReminderClock();
  }
  render();
 },250);
}
function stopTicker(){if(ticker)clearInterval(ticker);ticker=null}

// PiP floating widget triggers
$("pip-btn").addEventListener("click",()=>$("pip-floating-widget").classList.remove("hidden"));
$("pip-close").addEventListener("click",()=>$("pip-floating-widget").classList.add("hidden"));

// Task list
$("task-form").addEventListener("submit",e=>{e.preventDefault();const input=$("task-input"),text=input.value.trim();if(!text)return;state.tasks.push({text,done:false});input.value="";scheduleSave();render()});
$("clear-done").addEventListener("click",()=>{state.tasks=state.tasks.filter(t=>!t.done);scheduleSave();render()});

// Complete a day
$("studied-btn").addEventListener("click",()=>{
 const elapsed=state.running?(state.duration-currentRemaining()):0;
 if(elapsed>0){
  state.dailySeconds=state.dailySeconds||{};
  state.dailySeconds[dateKey]=(state.dailySeconds[dateKey]||0)+elapsed;
  if(state.running){
   state.endAt=Date.now()+state.remaining*1000;
  }
 }
 state.studyDates=[...new Set([...(state.studyDates||[]),dateKey])];
 const info=streakInfo();state.bestStreak=Math.max(state.bestStreak||0,info.best);
 scheduleSave();render();toast("Study day completed & hours logged!");
});

// Exams Modal / Add
$("add-exam-btn").addEventListener("click",()=>$("exam-form-box").classList.remove("hidden"));
$("cancel-exam").addEventListener("click",()=>$("exam-form-box").classList.add("hidden"));
$("save-new-exam").addEventListener("click",()=>{
 const name=$("new-exam-name").value.trim(), date=$("new-exam-date").value;
 if(!name||!date){toast("Provide exam name and date.");return}
 state.exams=state.exams||[];
 state.exams.push({id:Date.now().toString(),name,date});
 $("new-exam-name").value="";$("new-exam-date").value="";
 $("exam-form-box").classList.add("hidden");
 scheduleSave();render();toast("Exam countdown added.");
});

// Coaching Marks form
$("toggle-mark-form").addEventListener("click",()=>$("mark-form-box").classList.toggle("hidden"));
$("test-max").addEventListener("change",e=>{
 if(e.target.value==="custom")$("custom-max-wrap").classList.remove("hidden");
 else $("custom-max-wrap").classList.add("hidden");
});
$("save-mark-btn").addEventListener("click",()=>{
 const date=$("test-date").value, scored=Number($("test-scored").value);
 const maxSelect=$("test-max").value;
 const max=maxSelect==="custom"?Number($("test-max-custom").value):Number(maxSelect);
 if(!date||Number.isNaN(scored)||Number.isNaN(max)||max<=0){toast("Enter valid test details.");return}
 state.marks=state.marks||[];
 state.marks.push({date,scored,max});
 $("mark-form-box").classList.add("hidden");
 scheduleSave();render();toast("Test score logged successfully!");
});

function loadLocal(){try{const saved=JSON.parse(localStorage.getItem("jeeOrbitState"));if(saved)state={...state,...saved};}catch{} if(state.running&&currentRemaining()===0){state.running=false;state.endAt=null;state.remaining=0;}}
loadLocal();render();if(state.running){startTicker();startReminderClock()}

if(firebaseReady){
 try{
  app=initializeApp(firebaseConfig);auth=getAuth(app);db=getFirestore(app);
  onAuthStateChanged(auth,async u=>{
   user=u;
   $("signin-btn").classList.toggle("hidden",!!u);$("signout-btn").classList.toggle("hidden",!u);
   $("account-status").textContent=u?(u.displayName||u.email||"Signed in"):"Not signed in";
   if(unsubscribe){unsubscribe();unsubscribe=null}
   if(!u){render();return}
   const ref=doc(db,"users",u.uid,"appData","main");
   try{
    const snap=await getDoc(ref);
    if(snap.exists()){remoteApplying=true;state={...state,...snap.data()};remoteApplying=false;saveLocal();render();if(state.running)startTicker();}
    else await saveCloud();
    unsubscribe=onSnapshot(ref,snap2=>{if(!snap2.exists())return;const incoming=snap2.data();if((incoming.updatedAt||0)>(state.updatedAt||0)){remoteApplying=true;state={...state,...incoming};remoteApplying=false;saveLocal();render();if(state.running)startTicker();}});
   }catch(e){console.error(e);toast("Could not load cloud data.")}
  });
  $("signin-btn").addEventListener("click",async()=>{try{await signInWithPopup(auth,new GoogleAuthProvider())}catch(e){console.error(e);toast("Google sign-in failed: "+e.message)}});
  $("signout-btn").addEventListener("click",()=>signOut(auth));
 }catch(e){console.error(e);$("account-status").textContent="Firebase setup needed"}
}else{
 $("signin-btn").addEventListener("click",()=>toast("Add your Firebase settings first."));
 $("account-status").textContent="Google login setup needed";
}
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(console.error));
window.addEventListener("beforeunload",()=>{if(state.running)saveLocal()});
