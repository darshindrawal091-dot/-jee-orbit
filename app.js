import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/*
  OPTIONAL CLOUD SETUP:
  1. Create a Firebase project at https://console.firebase.google.com/
  2. Add a Web app and paste its config below.
  3. Enable Authentication > Google.
  4. Create Firestore Database.
  5. See README.md for starter security rules.
*/
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
let state = {duration:7200, endAt:null, remaining:7200, running:false, tasks:[], studyDates:[], bestStreak:0, mainExamDate:"", advancedExamDate:""};
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
 if(set.has(todayStr)||set.has((()=>{const d=new Date(cursor);d.setDate(d.getDate()-1);return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")})())){
  while(true){
   const key=cursor.getFullYear()+"-"+String(cursor.getMonth()+1).padStart(2,"0")+"-"+String(cursor.getDate()).padStart(2,"0");
   if(!set.has(key))break;
   current++;cursor.setDate(cursor.getDate()-1);
  }
 }
 return {current,best:Math.max(best,state.bestStreak||0)};
}
function renderStats(){
 const info=streakInfo();
 $("streak-value").textContent=info.current+" day"+(info.current===1?"":"s");
 $("best-streak").textContent=info.best+" days";
 const todayKeyLocal=(()=>{const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")})();
 const doneToday=(state.studyDates||[]).includes(todayKeyLocal);
 $("studied-btn").disabled=doneToday;
 $("studied-btn").textContent=doneToday?"Studied today ✓":"Mark studied today";
 $("streak-note").textContent=doneToday?"Today's study logged. Keep it going!":"Log a study day to build your streak.";
 const weekStart=new Date();weekStart.setHours(0,0,0,0);weekStart.setDate(weekStart.getDate()-((weekStart.getDay()+6)%7));
 const labels=["M","T","W","T","F","S","S"];const dates=new Set(state.studyDates||[]);const week=$("week-progress");week.innerHTML="";let weekDone=0;
 for(let i=0;i<7;i++){const d=new Date(weekStart);d.setDate(weekStart.getDate()+i);const key=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");const done=dates.has(key);if(done)weekDone++;const item=document.createElement("div");item.className="week-day"+(done?" done":"");item.innerHTML='<div class="week-dot"></div>'+labels[i];week.append(item)}
 $("week-summary").textContent=weekDone+" of 7 days this week";
 const main=dateDaysLeft(state.mainExamDate),adv=dateDaysLeft(state.advancedExamDate);
 $("main-countdown").textContent=main===null?"Set exam date":main<0?"Date passed":main===0?"Exam day!":main+" days";
 $("advanced-countdown").textContent=adv===null?"Set exam date":adv<0?"Date passed":adv===0?"Exam day!":adv+" days";
 $("main-date-label").textContent=state.mainExamDate?"Target: "+new Date(state.mainExamDate+"T00:00:00").toLocaleDateString():"Choose your target date below";
 $("advanced-date-label").textContent=state.advancedExamDate?"Target: "+new Date(state.advancedExamDate+"T00:00:00").toLocaleDateString():"Choose your target date below";
 $("main-date").value=state.mainExamDate||"";
 $("advanced-date").value=state.advancedExamDate||"";
}
function render(){
 const rem=currentRemaining(); $("timer-display").textContent=fmt(rem);
 const pct=state.duration?Math.min(100,Math.max(0,(1-rem/state.duration)*100)):0;
 $("timer-progress-bar").style.width=pct+"%";
 $("timer-state").textContent=rem===0?"Session complete — well done.":state.running?"Timer is running":state.remaining===state.duration?"Ready when you are":"Paused";
 $("start-btn").disabled=state.running||rem===0; $("pause-btn").disabled=!state.running;
 $("sync-status").textContent=user?"Synced to your account":"Saved on this device";
 renderTasks();
 renderStats();
}
function saveLocal(){localStorage.setItem("jeeOrbitState",JSON.stringify(state))}
function scheduleSave(){saveLocal(); if(user && db && !remoteApplying){clearTimeout(saveTimeout);saveTimeout=setTimeout(saveCloud,450)}}
async function saveCloud(){
 if(!user||!db)return;
 try{state.updatedAt=Date.now();await setDoc(doc(db,"users",user.uid,"appData","main"),{...state},{merge:true});saveLocal()}
 catch(e){console.error(e);toast("Cloud save failed. Check your connection.")}
}
function renderTasks(){
 const list=$("task-list");list.innerHTML="";
 state.tasks.forEach((task,i)=>{
  const li=document.createElement("li");li.className="task-item"+(task.done?" done":"");
  const cb=document.createElement("input");cb.type="checkbox";cb.checked=!!task.done;cb.setAttribute("aria-label","Mark task complete");
  cb.addEventListener("change",()=>{state.tasks[i].done=cb.checked;scheduleSave();render()});
  const span=document.createElement("span");span.textContent=task.text;
  const del=document.createElement("button");del.className="delete-task";del.textContent="×";del.setAttribute("aria-label","Delete task");
  del.addEventListener("click",()=>{state.tasks.splice(i,1);scheduleSave();render()});
  li.append(cb,span,del);list.append(li);
 });
 const done=state.tasks.filter(t=>t.done).length;$("task-count").textContent=done+" of "+state.tasks.length+" completed";
}
function applyDuration(){
 const h=Number($("hours").value),m=Number($("minutes").value),s=Number($("seconds").value);
 if(!Number.isInteger(h)||!Number.isInteger(m)||!Number.isInteger(s)||h<0||h>999||m<0||m>59||s<0||s>59||h*3600+m*60+s<=0){toast("Enter a valid duration.");return}
 state.duration=h*3600+m*60+s;state.remaining=state.duration;state.endAt=null;state.running=false;scheduleSave();render();toast("Custom timer applied.");
}
let reminderTicker=null,lastReminderAt=0;
async function enableReminders(){
 if(!("Notification" in window)){toast("This browser does not support notifications.");return}
 const permission=await Notification.requestPermission();
 if(permission==="granted"){localStorage.setItem("jeeOrbitReminders","on");$("reminder-status").textContent="Enabled: every 2 hours while the study timer runs.";$("reminder-btn").textContent="Reminders on";toast("Study reminders enabled.")}
 else{$("reminder-status").textContent="Notifications were not allowed. Enable them in browser settings.";toast("Notification permission not granted.")}
}
async function sendStudyReminder(){
 const message="You've been studying for 2 hours. Take a short break, then decide your next study block.";
 try{const reg=await navigator.serviceWorker?.getRegistration();if(reg)await reg.showNotification("JEE Orbit — Study check-in",{body:message,icon:"./icon.svg",tag:"jee-orbit-study-reminder"});else new Notification("JEE Orbit — Study check-in",{body:message});}catch(e){console.warn("Notification unavailable",e)}
}
function checkReminder(){if(!state.running)return;const now=Date.now();if(!lastReminderAt)lastReminderAt=now;if(now-lastReminderAt>=2*60*60*1000){lastReminderAt=now;sendStudyReminder();}}
function startReminderClock(){if(localStorage.getItem("jeeOrbitReminders")==="on"&&"Notification" in window&&Notification.permission==="granted"){if(!lastReminderAt)lastReminderAt=Date.now();if(reminderTicker)clearInterval(reminderTicker);reminderTicker=setInterval(checkReminder,30000)}}
function stopReminderClock(){if(reminderTicker)clearInterval(reminderTicker);reminderTicker=null}
$("reminder-btn").addEventListener("click",enableReminders);
if(localStorage.getItem("jeeOrbitReminders")==="on"){$("reminder-status").textContent="Enabled: every 2 hours while the study timer runs.";$("reminder-btn").textContent="Reminders on"}
$("apply-btn").addEventListener("click",applyDuration);
$("start-btn").addEventListener("click",()=>{if(currentRemaining()<=0)return;state.remaining=currentRemaining();state.endAt=Date.now()+state.remaining*1000;state.running=true;scheduleSave();render();startTicker();startReminderClock()});
$("pause-btn").addEventListener("click",()=>{state.remaining=currentRemaining();state.endAt=null;state.running=false;scheduleSave();render();stopTicker();stopReminderClock()});
$("reset-btn").addEventListener("click",()=>{state.running=false;state.endAt=null;state.remaining=state.duration;scheduleSave();render();stopTicker();stopReminderClock();toast("Timer reset.")});
function startTicker(){stopTicker();ticker=setInterval(()=>{if(currentRemaining()<=0){state.remaining=0;state.endAt=null;state.running=false;scheduleSave();stopTicker();toast("Countdown complete!");if(state.duration>=7200 && localStorage.getItem("jeeOrbitReminders")==="on" && Notification.permission==="granted")sendStudyReminder();stopReminderClock();}render()},250)}
function stopTicker(){if(ticker)clearInterval(ticker);ticker=null}
$("task-form").addEventListener("submit",e=>{e.preventDefault();const input=$("task-input"),text=input.value.trim();if(!text)return;state.tasks.push({text,done:false});input.value="";scheduleSave();render()});
$("clear-done").addEventListener("click",()=>{state.tasks=state.tasks.filter(t=>!t.done);scheduleSave();render()});
$("studied-btn").addEventListener("click",()=>{
 const d=new Date(),key=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
 state.studyDates=[...new Set([...(state.studyDates||[]),key])];
 const info=streakInfo();state.bestStreak=Math.max(state.bestStreak||0,info.best);
 scheduleSave();render();toast("Study day recorded. Nice work!");
});
$("save-exam-dates").addEventListener("click",()=>{
 state.mainExamDate=$("main-date").value;
 state.advancedExamDate=$("advanced-date").value;
 scheduleSave();render();toast("Exam countdown dates saved.");
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
 $("signin-btn").addEventListener("click",()=>toast("Add your Firebase settings first — see README."));
 $("account-status").textContent="Google login setup needed";
}
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(console.error));
window.addEventListener("beforeunload",()=>{if(state.running)saveLocal()});
