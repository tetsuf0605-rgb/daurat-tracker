import { useState, useEffect, useRef, useCallback } from "react";
import React from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, off } from "firebase/database";
import { getFirestore, collection, addDoc, getDocs, orderBy, query, deleteDoc, doc, updateDoc } from "firebase/firestore";

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBFNeT1I5Eux8kqucN2vqzm9dvrEQxwQHw",
  authDomain: "daurat-b5aef.firebaseapp.com",
  databaseURL: "https://daurat-b5aef-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "daurat-b5aef",
  storageBucket: "daurat-b5aef.firebasestorage.app",
  messagingSenderId: "1046861092853",
  appId: "1:1046861092853:web:06151f3e68ec13f77832bc"
};
const FUNCTION_URL = "https://asia-northeast1-daurat-b5aef.cloudfunctions.net/generateArticle";
const SHARED_SESSION = "daurat-global-session";

const firebaseApp = initializeApp(FIREBASE_CONFIG);
const rtdb = getDatabase(firebaseApp);
const firestore = getFirestore(firebaseApp);

const HOME = "FC Daurat";
const NAVY = "#0E1A3A";
const GOLD = "#D4A017";
const GOLD_L = "#F0C040";
const GOLD_P = "#FBF3DC";

const EV_DEF = {
  goal:     { l:"ゴール！",             i:"⚽" },
  concede:  { l:"失点",                 i:"🥅" },
  nice:     { l:"ナイスプレー",         i:"✨" },
  sub:      { l:"選手交代",             i:"🔄" },
  close:    { l:"惜しい！",             i:"😤" },
  nicepass: { l:"ナイスパス！",         i:"👟" },
  nicedef:  { l:"ナイスディフェンス！", i:"🛡️" },
  nicegk:   { l:"ナイスキーパー！",     i:"🧤" },
};

const MATCH_TYPES = [
  { value:"公式戦",           label:"公式戦",           official:true  },
  { value:"1日大会",          label:"1日大会",          official:false },
  { value:"フレンドリーマッチ", label:"フレンドリーマッチ", official:false },
  { value:"その他",           label:"その他",           official:false },
];

function pad(n) { return String(n).padStart(2,"0"); }
function fmtMs(ms) { return pad(Math.floor(ms/60000))+":"+pad(Math.floor((ms%60000)/1000)); }
function evTime(rms,half,h1ms) {
  const t=rms+(half===2?(h1ms||0):0);
  return (half===1?"前半":"後半")+" "+pad(Math.floor(t/60000)+1)+"分"+pad(Math.floor((t%60000)/1000))+"秒";
}
function plbl(num,pname) { if(!num)return""; return pname?"#"+num+" "+pname:"#"+num; }
function nowStr() {
  const d=new Date();
  return d.toLocaleDateString("ja-JP",{year:"numeric",month:"long",day:"numeric"})+" "+pad(d.getHours())+":"+pad(d.getMinutes());
}
function newMatch() {
  return {phase:"pre",ko:0,half:1,htAt:0,h1ms:0,sH:0,sA:0,evs:[],away:"",matchType:"フレンドリーマッチ",tournamentName:""};
}
function safeMatch(m) {
  if(!m)return newMatch();
  return {...newMatch(),...m,evs:Array.isArray(m.evs)?m.evs:[]};
}
function buildMatchData(m,aw,roster) {
  const evs=Array.isArray(m.evs)?m.evs:[];
  const ph={pre:"試合前",first:"前半進行中",ht:"ハーフタイム",second:"後半進行中",end:"試合終了"}[m.phase]||"";
  const lines=evs.filter(e=>!e.sys).sort((a,b)=>a.ts-b.ts)
    .map(e=>evTime(e.rms,e.half,m.h1ms)+" "+e.l+(e.num?" "+plbl(e.num,e.pname):"")+(e.team?" ("+e.team+")":""))
    .join("\n");
  const rosterTxt=Object.entries(roster).map(([n,nm])=>"#"+n+" "+nm).join(", ")||"未登録";
  const goals=evs.filter(e=>!e.sys&&e.type==="goal").length;
  const concedes=evs.filter(e=>!e.sys&&e.type==="concede").length;
  const nices=evs.filter(e=>!e.sys&&e.type==="nice").length;
  return "【試合】FC Daurat "+m.sH+" - "+m.sA+" "+aw+" ("+(m.matchType||"")+(m.tournamentName?" "+m.tournamentName:"")+")\n【状態】"+ph+"\n【ゴール】Daurat:"+goals+" / 相手:"+concedes+"　ナイスプレー:"+nices+"回\n【イベント詳細】\n"+(lines||"（記録なし）")+"\n【登録選手】"+rosterTxt;
}

function drawNewspaper(canvas,data,matchInfo) {
  const ctx=canvas.getContext("2d");
  const W=canvas.width,H=canvas.height;
  ctx.fillStyle="#FDF8E8";ctx.fillRect(0,0,W,H);
  ctx.fillStyle=NAVY;ctx.fillRect(0,0,W,8);
  ctx.fillStyle=GOLD;ctx.fillRect(0,8,W,4);
  ctx.fillStyle=NAVY;ctx.font="bold "+W*0.09+"px serif";ctx.textAlign="center";
  ctx.fillText("EL DAURAT",W/2,W*0.13);
  ctx.fillRect(W*0.05,W*0.15,W*0.9,2);
  ctx.fillStyle=GOLD;ctx.fillRect(W*0.05,W*0.155,W*0.9,1);
  ctx.fillStyle=NAVY;ctx.fillRect(W*0.05,W*0.16,W*0.9,1);
  ctx.font=W*0.03+"px serif";ctx.fillStyle="#555";
  ctx.textAlign="left";ctx.fillText(matchInfo.dateStr||"",W*0.05,W*0.2);
  ctx.textAlign="right";ctx.fillText("El periódico del fútbol auténtico",W*0.95,W*0.2);
  const sbY=W*0.23,sbH=W*0.18;
  ctx.fillStyle=NAVY;ctx.fillRect(W*0.05,sbY,W*0.9,sbH);
  ctx.fillStyle=GOLD;ctx.fillRect(W*0.05,sbY+sbH-3,W*0.9,3);
  ctx.fillStyle="#fff";ctx.font=W*0.035+"px sans-serif";ctx.textAlign="center";
  ctx.fillText("FC Daurat",W*0.25,sbY+sbH*0.35);
  ctx.fillText(matchInfo.away||"相手チーム",W*0.75,sbY+sbH*0.35);
  ctx.font="bold "+W*0.12+"px sans-serif";ctx.fillStyle=GOLD_L;
  ctx.fillText(matchInfo.sH,W*0.25,sbY+sbH*0.82);
  ctx.fillText(matchInfo.sA,W*0.75,sbY+sbH*0.82);
  ctx.fillStyle="#fff";ctx.font="bold "+W*0.1+"px sans-serif";ctx.fillText(":",W*0.5,sbY+sbH*0.82);
  const rc=data.result==="勝利"?"#27ae60":data.result==="敗戦"?"#c0392b":"#7f8c8d";
  const bY=sbY+sbH+W*0.03,bW=W*0.22,bH=W*0.06;
  ctx.fillStyle=rc;ctx.fillRect(W/2-bW/2,bY,bW,bH);
  ctx.fillStyle="#fff";ctx.font="bold "+W*0.035+"px sans-serif";ctx.textAlign="center";
  ctx.fillText(data.result||"—",W/2,bY+bH*0.72);
  const dY=bY+bH+W*0.03;
  ctx.fillStyle=NAVY;ctx.fillRect(W*0.05,dY,W*0.9,2);
  const hlS=W*0.072;ctx.font="bold "+hlS+"px serif";
  const hl=data.headline||"FC DAURAT 勝利！";
  const mW=W*0.88;let ln="",lns=[];
  for(const ch of hl.split("")){const t=ln+ch;if(ctx.measureText(t).width>mW&&ln){lns.push(ln);ln=ch;}else{ln=t;}}
  if(ln)lns.push(ln);
  lns.forEach((l,i)=>ctx.fillText(l,W/2,dY+W*0.1+i*(hlS*1.2)));
  const hlE=dY+W*0.1+lns.length*(hlS*1.2);
  ctx.fillStyle="#333";ctx.font=W*0.042+"px serif";
  let sln="",slns=[];
  for(const ch of (data.subheadline||"").split("")){const t=sln+ch;if(ctx.measureText(t).width>mW&&sln){slns.push(sln);sln=ch;}else{sln=t;}}
  if(sln)slns.push(sln);
  slns.forEach((l,i)=>ctx.fillText(l,W/2,hlE+W*0.02+i*(W*0.05)));
  const slE=hlE+W*0.02+slns.length*(W*0.05);
  ctx.fillStyle=GOLD;ctx.fillRect(W*0.2,slE+W*0.02,W*0.6,2);
  ctx.fillStyle="#555";ctx.font="italic "+W*0.038+"px serif";
  const cm='"'+(data.comment||"")+'"';let cln="",clns=[];
  for(const ch of cm.split("")){const t=cln+ch;if(ctx.measureText(t).width>mW*0.8&&cln){clns.push(cln);cln=ch;}else{cln=t;}}
  if(cln)clns.push(cln);
  clns.forEach((l,i)=>ctx.fillText(l,W/2,slE+W*0.07+i*(W*0.048)));
  const clE=slE+W*0.07+clns.length*(W*0.048);
  ctx.font=W*0.06+"px sans-serif";ctx.fillStyle=GOLD;
  ctx.fillText("★".repeat(parseInt(data.rating)||5)+"☆".repeat(5-(parseInt(data.rating)||5)),W/2,clE+W*0.07);
  ctx.fillStyle=GOLD;ctx.fillRect(0,H-8,W,4);
  ctx.fillStyle=NAVY;ctx.fillRect(0,H-4,W,4);
}

export default function App() {
  const [tab,setTab]=useState(0);
  const [match,setMatch]=useState(newMatch());
  const [roster,setRoster]=useState({});
  const [history,setHistory]=useState([]);
  const [timer,setTimer]=useState("00:00");
  const [pending,setPending]=useState("");
  const [detTeam,setDetTeam]=useState("home");
  const [detNum,setDetNum]=useState("");
  const [flash,setFlash]=useState(false);
  const [flashWho,setFlashWho]=useState("");
  const [addNum,setAddNum]=useState("");
  const [addName,setAddName]=useState("");
  const [histDetail,setHistDetail]=useState(null);
  const [deleteConfirm,setDeleteConfirm]=useState(null);
  const [histLoading,setHistLoading]=useState(false);
  const [editingEv,setEditingEv]=useState(null);
  const [editEvType,setEditEvType]=useState("goal");
  const [editEvTeam,setEditEvTeam]=useState("home");
  const [editEvNum,setEditEvNum]=useState("");
  const [editEvHalf,setEditEvHalf]=useState(1);
  const [editEvMin,setEditEvMin]=useState(1);
  const [confirmEnd,setConfirmEnd]=useState(false);
  const [editingMeta,setEditingMeta]=useState(false);
  const [metaAway,setMetaAway]=useState("");
  const [metaMatchType,setMetaMatchType]=useState("");
  const [metaTournament,setMetaTournament]=useState("");

  const timerRef=useRef(null);
  const flashRef=useRef(null);
  const mRef=useRef(match);
  const rosterRef=useRef(roster);
  const isLocalUpdate=useRef(false);
  mRef.current=match;
  rosterRef.current=roster;

  const awayName=match.away?match.away.trim()||"相手チーム":"相手チーム";

  const getRawMs=useCallback(()=>{
    const m=mRef.current;
    if(!m.ko)return 0;
    return Math.max(0,m.phase==="ht"?m.htAt-m.ko:Date.now()-m.ko);
  },[]);

  useEffect(()=>{
    if(match.phase==="first"||match.phase==="second"){
      timerRef.current=setInterval(()=>setTimer(fmtMs(getRawMs())),500);
    }else{clearInterval(timerRef.current);}
    return()=>clearInterval(timerRef.current);
  },[match.phase,getRawMs]);

  const syncToRTDB=useCallback((m,ros)=>{
    isLocalUpdate.current=true;
    set(ref(rtdb,"sessions/"+SHARED_SESSION),{match:m,roster:ros,updatedAt:Date.now()}).catch(e=>console.error(e));
  },[]);

  useEffect(()=>{
    const dbRef=ref(rtdb,"sessions/"+SHARED_SESSION);
    onValue(dbRef,(snap)=>{
      if(isLocalUpdate.current){isLocalUpdate.current=false;return;}
      const data=snap.val();if(!data)return;
      setMatch(safeMatch(data.match));
      setRoster(data.roster||{});
    });
    return()=>off(dbRef);
  },[]);

  const loadHistory=useCallback(async()=>{
    setHistLoading(true);
    try{
      const q=query(collection(firestore,"matches"),orderBy("savedAt","desc"));
      const snap=await getDocs(q);
      setHistory(snap.docs.map(d=>({id:d.id,...d.data()})));
    }catch(e){console.error(e);}
    setHistLoading(false);
  },[]);

  useEffect(()=>{if(tab===3)loadHistory();},[tab,loadHistory]);

  const addSysEv=(m,l,i)=>{
    const rms=m.ko?Math.max(0,m.phase==="ht"?m.htAt-m.ko:Date.now()-m.ko):0;
    const evs=Array.isArray(m.evs)?m.evs:[];
    return{...m,evs:[...evs,{sys:true,l,i,rms,half:m.half,ts:Date.now()}]};
  };

  const kickoff=()=>{
    const nm=addSysEv({...match,phase:"first",ko:Date.now(),half:1},"前半キックオフ","🟡");
    setMatch(nm);syncToRTDB(nm,roster);
  };

  const doHalftime=(forceEnd)=>{
    let nm;
    if(match.phase==="first"){
      if(!forceEnd){
        const now=Date.now();
        nm=addSysEv({...match,phase:"ht",htAt:now,h1ms:now-match.ko},"ハーフタイム","🔔");
      }else{
        const rms=Math.max(0,Date.now()-match.ko);
        const evs2=Array.isArray(match.evs)?match.evs:[];
        nm={...match,phase:"end",evs:[...evs2,{sys:true,l:"試合終了",i:"🏁",rms,half:match.half,ts:Date.now()}]};
        saveToFirestore(nm,awayName);
      }
    }else if(match.phase==="ht"){
      const now=Date.now();
      nm=addSysEv({...match,ko:match.ko+(now-match.htAt),phase:"second",half:2},"後半キックオフ","🟡");
    }else if(match.phase==="second"){
      const rms=Math.max(0,Date.now()-match.ko);
      const evs2=Array.isArray(match.evs)?match.evs:[];
      nm={...match,phase:"end",evs:[...evs2,{sys:true,l:"試合終了",i:"🏁",rms,half:match.half,ts:Date.now()}]};
      saveToFirestore(nm,awayName);
    }else return;
    setConfirmEnd(false);
    setMatch(nm);syncToRTDB(nm,roster);
  };

  const saveToFirestore=async(m,aw)=>{
    try{
      await addDoc(collection(firestore,"matches"),{
        match:m,away:aw,sH:m.sH,sA:m.sA,
        matchType:m.matchType||"",tournamentName:m.tournamentName||"",
        savedAt:Date.now(),dateStr:nowStr()
      });
    }catch(e){console.error(e);}
  };

  const startNew=()=>{
    const nm=newMatch();setMatch(nm);setTimer("00:00");setPending("");
    setConfirmEnd(false);syncToRTDB(nm,roster);setTab(0);
  };

  const openDetail=(type)=>{setPending(type);setDetTeam("home");setDetNum("");};

  const commitEv=(type,team,num)=>{
    const def=EV_DEF[type];if(!def)return;
    const rms=getRawMs();
    const pname=num&&roster[num]?roster[num]:null;
    const tname=team==="home"?HOME:team==="away"?awayName:null;
    const curEvs=Array.isArray(match.evs)?match.evs:[];
    const nm={...match};
    if(type==="goal")nm.sH=match.sH+1;
    if(type==="concede")nm.sA=match.sA+1;
    nm.evs=[...curEvs,{sys:false,type,l:def.l,i:def.i,rms,half:match.half,ts:Date.now(),team:tname,num:num||null,pname}];
    setMatch(nm);syncToRTDB(nm,roster);
    if(type==="goal"&&team==="home"){
      const who=num?"#"+num+(roster[num]?" "+roster[num]:""):HOME;
      setFlashWho(who+" が決めた！");setFlash(true);
      clearTimeout(flashRef.current);
      flashRef.current=setTimeout(()=>setFlash(false),3500);
    }
    setPending("");
  };

  const undoLastEv=()=>{
    const curEvs=Array.isArray(match.evs)?match.evs:[];
    if(!curEvs.length)return;
    const last=curEvs[curEvs.length-1];
    const nm={...match,evs:curEvs.slice(0,-1)};
    if(last.type==="goal"&&!last.sys)nm.sH=Math.max(0,match.sH-1);
    if(last.type==="concede"&&!last.sys)nm.sA=Math.max(0,match.sA-1);
    setMatch(nm);syncToRTDB(nm,roster);
  };

  const addPlayer=()=>{
    if(!addNum||!addName){alert("背番号と選手名を入力してください");return;}
    const nr={...roster,[addNum]:addName};
    setRoster(nr);setAddNum("");setAddName("");syncToRTDB(match,nr);
  };
  const delPlayer=(n)=>{const nr={...roster};delete nr[n];setRoster(nr);syncToRTDB(match,nr);};
  const deleteMatch=async(id)=>{
    try{await deleteDoc(doc(firestore,"matches",id));setHistory(h=>h.filter(m=>m.id!==id));setDeleteConfirm(null);setHistDetail(null);}
    catch(e){console.error(e);}
  };

  const recalcScore=(evs)=>{
    let sH=0,sA=0;
    evs.forEach(e=>{
      if(!e.sys&&e.type==="goal"&&e.team===HOME)sH++;
      else if(!e.sys&&e.type==="concede")sA++;
    });
    return{sH,sA};
  };

  const saveHistMatch=async(histIdx,newEvs)=>{
    const h=history[histIdx];
    const{sH,sA}=recalcScore(newEvs);
    const nm2={...h.match,evs:newEvs,sH,sA};
    try{
      await updateDoc(doc(firestore,"matches",h.id),{match:nm2,sH,sA});
      const updated=[...history];updated[histIdx]={...h,match:nm2,sH,sA};
      setHistory(updated);setEditingEv(null);
    }catch(e){console.error(e);}
  };

  const saveHistMeta=async(histIdx,away,matchType,tournamentName)=>{
    const h=history[histIdx];
    try{
      await updateDoc(doc(firestore,"matches",h.id),{away,matchType,tournamentName});
      const updated=[...history];updated[histIdx]={...h,away,matchType,tournamentName};
      setHistory(updated);setEditingMeta(false);
    }catch(e){console.error(e);}
  };

  const deleteHistEv=async(histIdx,evIdx)=>{
    const h=history[histIdx];
    const evs=Array.isArray(h.match.evs)?h.match.evs:[];
    await saveHistMatch(histIdx,evs.filter((_,i)=>i!==evIdx));
  };

  const editHistEv=async(histIdx,evIdx,type,team,num,half,min)=>{
    const h=history[histIdx];
    const evs=[...(Array.isArray(h.match.evs)?h.match.evs:[])];
    const def=EV_DEF[type];if(!def)return;
    const pname=num&&roster[num]?roster[num]:null;
    const tname=team==="home"?HOME:team==="away"?(h.away||"相手チーム"):null;
    const h1ms=h.match.h1ms||0;
    const rms=Math.max(0,((min||1)-1)*60000-(half===2?h1ms:0));
    evs[evIdx]={...evs[evIdx],type,l:def.l,i:def.i,team:tname,num:num||null,pname,half:half||1,rms};
    await saveHistMatch(histIdx,evs);
  };

  const addHistEv=async(histIdx,type,team,num,half,min)=>{
    const h=history[histIdx];
    const def=EV_DEF[type];if(!def)return;
    const evs=[...(Array.isArray(h.match.evs)?h.match.evs:[])];
    const pname=num&&roster[num]?roster[num]:null;
    const tname=team==="home"?HOME:team==="away"?(h.away||"相手チーム"):null;
    const h1ms=h.match.h1ms||0;
    const rms=Math.max(0,((min||1)-1)*60000-(half===2?h1ms:0));
    evs.push({sys:false,type,l:def.l,i:def.i,rms,half:half||1,ts:Date.now(),team:tname,num:num||null,pname});
    await saveHistMatch(histIdx,evs);
  };

  const phaseLabel={pre:"未開始",first:"前半進行中",ht:"ハーフタイム",second:"後半進行中",end:"試合終了"}[match.phase]||"";
  const btnsOn=match.phase==="first"||match.phase==="second";
  const isLive=match.phase==="first"||match.phase==="ht"||match.phase==="second";
  const rosterKeys=Object.keys(roster).sort((a,b)=>Number(a)-Number(b));
  const curEvs=Array.isArray(match.evs)?match.evs:[];

  const htBtnLabel=match.phase==="first"?"ハーフタイム / 試合終了":match.phase==="ht"?"後半開始":match.phase==="second"?"試合終了へ":"—";
  const htBtnDisabled=match.phase==="pre"||match.phase==="end";

  const inp={width:"100%",padding:"8px 10px",fontSize:13,border:"0.5px solid #ccc",borderRadius:8,background:"#fff",boxSizing:"border-box"};
  const inpL={width:"100%",padding:"10px 12px",fontSize:14,border:"0.5px solid #ccc",borderRadius:8,background:"#fff",color:"#333",boxSizing:"border-box"};

  const tlStyle=(cls,isGoalHome)=>{
    const b={display:"flex",alignItems:"baseline",gap:6,padding:"6px 10px",border:"0.5px solid #ddd",background:"#fff",marginBottom:4,fontSize:13,lineHeight:1.4,borderRadius:4};
    if(isGoalHome)return{...b,background:"linear-gradient(90deg,#fff9e6,#fff3cc)",borderColor:GOLD,borderLeft:"4px solid "+GOLD,boxShadow:"0 1px 4px rgba(212,160,23,0.2)"};
    if(cls==="gc")return{...b,background:"#fff5f5",borderColor:"#c0392b"};
    if(cls==="sy")return{...b,background:"#f5f5f5"};
    return b;
  };

  const MatchTimeline=({m,editable,histIdx})=>{
    const srt=[...(Array.isArray(m.evs)?m.evs:[])].sort((a,b)=>a.ts-b.ts);
    if(!srt.length)return <div style={{textAlign:"center",color:"#aaa",fontSize:13,padding:20}}>まだ記録がありません</div>;
    return (
      <>
        {srt.map((e,i)=>{
          const isGoalHome=!e.sys&&e.type==="goal"&&e.team===HOME;
          const cls=e.sys?"sy":e.type==="goal"?"gh":e.type==="concede"?"gc":"";
          return (
            <div key={i} style={tlStyle(cls,isGoalHome)}>
              <span style={{fontVariantNumeric:"tabular-nums",color:e.sys?"#aaa":isGoalHome?NAVY:"#2A3F72",fontWeight:isGoalHome?700:500,whiteSpace:"nowrap",minWidth:90,fontSize:12}}>
                {e.sys?"—":evTime(e.rms,e.half,m.h1ms||0)}
              </span>
              <span style={{fontSize:isGoalHome?18:15}}>{e.i}</span>
              <span style={{flex:1,fontSize:e.sys?11:13,color:e.sys?"#aaa":isGoalHome?"#7a4a00":"#333",fontWeight:isGoalHome?700:400}}>
                {e.sys?e.l:[e.num?plbl(e.num,e.pname):"",e.l,e.team?"("+e.team+")":""].filter(Boolean).join(" ")+(isGoalHome?" 🌟":"")}
              </span>
              {editable&&!e.sys&&(
                <div style={{display:"flex",gap:4,flexShrink:0}}>
                  <button onClick={()=>{
                    setEditEvType(e.type);
                    setEditEvTeam(e.team===HOME?"home":e.team?"away":"");
                    setEditEvNum(e.num||"");
                    const off=e.half===2?(m.h1ms||0):0;
                    setEditEvHalf(e.half||1);
                    setEditEvMin(Math.floor((e.rms+off)/60000)+1);
                    setEditingEv({histIdx,evIdx:i,mode:"edit"});
                  }} style={{background:"none",border:"0.5px solid #ccc",borderRadius:4,color:"#888",cursor:"pointer",fontSize:11,padding:"2px 5px"}}>✏️</button>
                  <button onClick={()=>setEditingEv({histIdx,evIdx:i,mode:"delete"})}
                    style={{background:"none",border:"0.5px solid #e8a0a0",borderRadius:4,color:"#c0392b",cursor:"pointer",fontSize:11,padding:"2px 5px"}}>🗑</button>
                </div>
              )}
            </div>
          );
        })}
      </>
    );
  };

  const ArticleSection=({m,aw})=>{
    const [loading,setLoading]=useState(false);
    const [generated,setGenerated]=useState(false);
    const localRef=useRef(null);
    const handleGenerate=async()=>{
      const canvasEl=localRef.current;if(!canvasEl)return;
      setLoading(true);setGenerated(false);
      try{
        const matchData=buildMatchData(m,aw,rosterRef.current);
        const res=await fetch(FUNCTION_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({matchData})});
        const data=await res.json();
        if(data.error)throw new Error(data.error);
        drawNewspaper(canvasEl,data,{sH:m.sH,sA:m.sA,away:aw,dateStr:m.dateStr||""});
        setGenerated(true);
      }catch(e){alert("記事の生成に失敗しました: "+e.message);}
      setLoading(false);
    };
    return (
      <div style={{marginTop:16}}>
        <button onClick={handleGenerate} disabled={loading}
          style={{display:"block",width:"100%",padding:14,background:loading?"#eee":NAVY,color:loading?"#aaa":GOLD_L,border:"none",borderRadius:12,fontSize:15,fontWeight:500,cursor:loading?"default":"pointer",borderBottom:loading?"none":"2px solid "+GOLD,marginBottom:10}}>
          {loading?"📰 記事を生成中…":"📰 新聞見出しを生成する"}
        </button>
        <canvas ref={localRef} width={600} height={900}
          style={{width:"100%",display:generated?"block":"none",border:"2px solid "+GOLD,marginBottom:10,borderRadius:12}}/>
        {generated&&(
          <button onClick={()=>{const l=document.createElement("a");l.download="el-daurat.png";l.href=localRef.current.toDataURL("image/png");l.click();}}
            style={{display:"block",width:"100%",padding:12,background:"#f0faf3",color:"#1a5c32",border:"0.5px solid #2d8a4e",borderRadius:10,fontSize:14,fontWeight:500,cursor:"pointer"}}>
            💾 画像を保存する
          </button>
        )}
      </div>
    );
  };

  const ebtn=(cls,dis)=>{
    const b={borderRadius:10,border:"0.5px solid #ccc",padding:"14px 6px",fontSize:13,fontWeight:500,cursor:dis?"default":"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:5,opacity:dis?0.3:1};
    if(cls==="g")return{...b,borderColor:GOLD,background:GOLD_P,color:NAVY};
    if(cls==="c")return{...b,borderColor:"#c0392b",background:"#fff5f5",color:"#7b241c"};
    if(cls==="n")return{...b,borderColor:"#ca6f1e",background:"#fef9f0",color:"#784212"};
    if(cls==="s")return{...b,borderColor:"#1f618d",background:"#eaf4fb",color:"#154360"};
    if(cls==="x")return{...b,borderColor:"#8e44ad",background:"#f9f0ff",color:"#6c3483"};
    if(cls==="y")return{...b,borderColor:"#16a085",background:"#f0fdf9",color:"#0e6655"};
    return b;
  };

  const tab_style=(on)=>({flex:1,padding:"10px 4px",fontSize:11,fontWeight:500,border:"none",borderBottom:on?"2px solid "+GOLD:"2px solid transparent",background:on?NAVY:"#162b50",color:on?GOLD_L:"#8899bb",cursor:"pointer"});

  const matchTypeInfo=MATCH_TYPES.find(t=>t.value===match.matchType)||MATCH_TYPES[2];

  return (
    <div style={{width:"100%",maxWidth:480,margin:"0 auto",padding:"0 0 40px",fontFamily:"sans-serif",boxSizing:"border-box"}}>
      <style>{"@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}"}</style>

      {/* ヘッダー */}
      <div style={{background:NAVY,color:"#fff",padding:"12px 14px",borderBottom:"3px solid "+GOLD,marginBottom:0}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <span style={{fontSize:12,color:GOLD_L}}>
            {match.phase==="pre"?"FC Daurat":match.phase==="ht"?"ハーフタイム":match.phase==="end"?"試合終了":HOME+" vs "+awayName}
          </span>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            {match.matchType&&<span style={{fontSize:11,color:matchTypeInfo.official?"#ff9999":GOLD_L,opacity:.9}}>{match.matchType}</span>}
            <span style={{fontSize:11,background:GOLD,color:NAVY,padding:"2px 10px",borderRadius:20,fontWeight:500}}>
              {match.phase==="pre"?"—":match.phase==="first"?"前半":match.phase==="ht"?"HT":match.phase==="second"?"後半":"FT"}
            </span>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{flex:1,textAlign:"center"}}>
            <div style={{fontSize:11,color:GOLD_L,opacity:.8,marginBottom:2}}>FC Daurat</div>
            <div style={{fontSize:48,fontWeight:500,color:"#fff",lineHeight:1}}>{match.sH}</div>
          </div>
          <div style={{fontSize:30,color:GOLD,opacity:.6}}>:</div>
          <div style={{flex:1,textAlign:"center"}}>
            <div style={{fontSize:11,color:GOLD_L,opacity:.8,marginBottom:2}}>{awayName}</div>
            <div style={{fontSize:48,fontWeight:500,color:"#fff",lineHeight:1}}>{match.sA}</div>
          </div>
        </div>
        <div style={{textAlign:"center",fontSize:24,fontWeight:500,color:GOLD_L,letterSpacing:2,marginTop:4,fontVariantNumeric:"tabular-nums"}}>{timer}</div>
      </div>

      {/* タブバー */}
      <div style={{display:"flex",background:"#162b50",marginBottom:12}}>
        {["⚽ 観戦","📡 速報","👥 選手","🗂 履歴"].map((t,i)=>(
          <button key={i} style={tab_style(tab===i)} onClick={()=>setTab(i)}>{t}</button>
        ))}
      </div>

      <div style={{padding:"0 12px"}}>

      {/* ===== 観戦タブ ===== */}
      {tab===0&&(
        <div>
          {flash&&(
            <div style={{background:NAVY,border:"2px solid "+GOLD,borderRadius:14,padding:20,textAlign:"center",marginBottom:12}}>
              <div style={{fontSize:24,letterSpacing:6}}>★ ★ ★ ★ ★</div>
              <div style={{fontSize:28,fontWeight:500,color:GOLD_L,letterSpacing:3}}>GOAL !!!</div>
              <div style={{fontSize:15,color:"#fff",marginTop:6}}>{flashWho}</div>
            </div>
          )}

          {/* 試合設定 */}
          {match.phase==="pre"?(
            <div style={{background:"#f8f8f8",borderRadius:10,padding:"12px 14px",marginBottom:12,borderLeft:"3px solid "+GOLD}}>
              <div style={{marginBottom:10}}>
                <label style={{fontSize:12,color:"#666",display:"block",marginBottom:4}}>試合種別</label>
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {MATCH_TYPES.map(t=>(
                    <button key={t.value} onClick={()=>setMatch(m=>({...m,matchType:t.value}))}
                      style={{padding:"6px 14px",borderRadius:20,fontSize:13,fontWeight:500,cursor:"pointer",
                        border:match.matchType===t.value?"none":"0.5px solid #ccc",
                        background:match.matchType===t.value?(t.official?"#e74c3c":NAVY):"#fff",
                        color:match.matchType===t.value?"#fff":t.official?"#e74c3c":"#333"}}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{marginBottom:10}}>
                <label style={{fontSize:12,color:"#666",display:"block",marginBottom:4}}>大会名・備考（任意）</label>
                <input type="text" value={match.tournamentName||""} onChange={e=>setMatch(m=>({...m,tournamentName:e.target.value}))}
                  placeholder="例: 〇〇カップ、第3節 など" style={inpL}/>
              </div>
              <div>
                <label style={{fontSize:12,color:"#666",display:"block",marginBottom:4}}>相手チーム名</label>
                <input type="text" value={match.away||""} onChange={e=>setMatch(m=>({...m,away:e.target.value}))} placeholder="例: 光が丘FC" style={inpL}/>
              </div>
            </div>
          ):(
            <div style={{background:"#f8f8f8",borderRadius:10,padding:"8px 14px",marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:13,fontWeight:500,color:matchTypeInfo.official?"#e74c3c":NAVY}}>{match.matchType}</span>
                <span style={{fontSize:13,color:"#555"}}>vs {awayName}</span>
              </div>
              {match.tournamentName&&<div style={{fontSize:12,color:"#888",marginTop:2}}>{match.tournamentName}</div>}
            </div>
          )}

          {/* キックオフボタン */}
          <button
            disabled={match.phase!=="pre"}
            onClick={kickoff}
            style={{display:"block",width:"100%",padding:14,background:match.phase!=="pre"?"#eee":NAVY,color:match.phase!=="pre"?"#aaa":GOLD_L,border:"none",fontSize:16,fontWeight:500,cursor:match.phase!=="pre"?"default":"pointer",marginBottom:8,borderBottom:match.phase!=="pre"?"none":"2px solid "+GOLD,borderRadius:12}}>
            {match.phase==="pre"?"▶ キックオフ":"試合中…"}
          </button>

          {/* ハーフタイム/試合終了ボタン */}
          <button
            disabled={htBtnDisabled}
            onClick={()=>{
              if(match.phase==="ht") doHalftime(false);
              else setConfirmEnd(true);
            }}
            style={{display:"block",width:"100%",padding:11,background:"#f5f5f5",color:htBtnDisabled?"#aaa":"#333",border:"0.5px solid #ccc",fontSize:14,fontWeight:500,cursor:htBtnDisabled?"default":"pointer",marginBottom:10,opacity:htBtnDisabled?0.4:1,borderRadius:12}}>
            {htBtnLabel}
          </button>

          {/* 試合終了確認ダイアログ */}
          {confirmEnd&&(
            <div style={{background:"#fff8e1",border:"1.5px solid "+GOLD,borderRadius:12,padding:14,marginBottom:12}}>
              <div style={{fontSize:14,fontWeight:500,color:NAVY,marginBottom:6}}>
                {match.phase==="first"?"前半終了 — どちらへ進みますか？":"試合を終了しますか？"}
              </div>
              {match.phase==="first"&&(
                <div style={{fontSize:12,color:"#666",marginBottom:10}}>一本勝負の場合は「試合終了」を選択してください</div>
              )}
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {match.phase==="first"&&(
                  <button onClick={()=>doHalftime(false)}
                    style={{padding:11,background:NAVY,color:GOLD_L,border:"none",borderRadius:10,fontSize:14,fontWeight:500,cursor:"pointer",borderBottom:"2px solid "+GOLD}}>
                    ⏸ ハーフタイムへ（後半あり）
                  </button>
                )}
                <button onClick={()=>doHalftime(true)}
                  style={{padding:11,background:"#c0392b",color:"#fff",border:"none",borderRadius:10,fontSize:14,fontWeight:500,cursor:"pointer"}}>
                  🏁 {match.phase==="first"?"試合終了（後半なし）":"試合終了"}
                </button>
                <button onClick={()=>setConfirmEnd(false)}
                  style={{padding:9,background:"#f5f5f5",color:"#666",border:"0.5px solid #ccc",borderRadius:10,fontSize:13,cursor:"pointer"}}>
                  キャンセル
                </button>
              </div>
            </div>
          )}

          {/* 試合終了メッセージ */}
          {match.phase==="end"&&(
            <div style={{background:"#f0faf3",border:"0.5px solid #2d8a4e",borderRadius:12,padding:16,marginBottom:12,textAlign:"center"}}>
              <div style={{fontSize:14,color:"#1a5c32",marginBottom:12}}>✅ 試合終了 — 履歴に保存されました</div>
              <button onClick={startNew} style={{padding:"12px 28px",background:NAVY,color:GOLD_L,border:"none",borderRadius:10,fontSize:15,fontWeight:500,cursor:"pointer",borderBottom:"2px solid "+GOLD}}>
                🆕 新しい試合を開始
              </button>
            </div>
          )}

          {/* 取り消しボタン */}
          {btnsOn&&curEvs.filter(e=>!e.sys).length>0&&(
            <button onClick={undoLastEv}
              style={{display:"block",width:"100%",padding:10,background:"#fff8e1",color:"#7d6608",border:"0.5px solid #f0c040",borderRadius:10,fontSize:13,fontWeight:500,cursor:"pointer",marginBottom:10}}>
              ↩ 直前の記録を取り消す（{curEvs.filter(e=>!e.sys).slice(-1)[0]?.l||""}）
            </button>
          )}

          {/* 詳細入力パネル */}
          {pending&&(
            <div style={{background:"#f8f8f8",borderRadius:10,padding:14,marginBottom:12,borderTop:"2px solid "+GOLD}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <span style={{fontSize:15,fontWeight:500}}>{EV_DEF[pending]?.i} {EV_DEF[pending]?.l}</span>
                <button onClick={()=>setPending("")} style={{background:"none",border:"0.5px solid #ccc",borderRadius:6,padding:"4px 10px",fontSize:12,color:"#666",cursor:"pointer"}}>キャンセル</button>
              </div>
              <div style={{display:"flex",gap:10,marginBottom:10}}>
                <div style={{flex:1}}>
                  <label style={{fontSize:12,color:"#666",display:"block",marginBottom:4}}>チーム</label>
                  <select value={detTeam} onChange={e=>setDetTeam(e.target.value)} style={inpL}>
                    <option value="home">FC Daurat</option>
                    <option value="away">{awayName}</option>
                  </select>
                </div>
                <div style={{flex:1}}>
                  <label style={{fontSize:12,color:"#666",display:"block",marginBottom:4}}>背番号（任意）</label>
                  <input type="number" value={detNum} onChange={e=>setDetNum(e.target.value)} placeholder="#" min="1" max="99" style={inpL}/>
                </div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>commitEv(pending,null,null)} style={{flex:1,padding:12,background:"#f5f5f5",color:"#666",border:"0.5px solid #ccc",borderRadius:8,fontSize:14,cursor:"pointer"}}>スキップ</button>
                <button onClick={()=>commitEv(pending,detTeam,detNum||null)} style={{flex:1,padding:12,background:NAVY,color:GOLD_L,border:"none",borderRadius:8,fontSize:14,fontWeight:500,cursor:"pointer"}}>記録する</button>
              </div>
            </div>
          )}

          {/* イベントボタン */}
          {!pending&&(
            <>
              <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:8,marginBottom:8}}>
                {[["goal","g","⚽","ゴール！"],["concede","c","🥅","失点"]].map(([type,cls,ico,lbl])=>(
                  <button key={type} style={ebtn(cls,!btnsOn)} disabled={!btnsOn} onClick={()=>openDetail(type)}>
                    <span style={{fontSize:24}}>{ico}</span>{lbl}
                  </button>
                ))}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:6,marginBottom:8}}>
                {[["nice","n","✨","ナイスプレー"],["sub","s","🔄","選手交代"],["close","x","😤","惜しい！"],["nicepass","y","👟","ナイスパス！"],["nicedef","x","🛡️","ナイスディフェンス！"],["nicegk","y","🧤","ナイスキーパー！"]].map(([type,cls,ico,lbl])=>(
                  <button key={type} style={{...ebtn(cls,!btnsOn),padding:"10px 6px",fontSize:12}} disabled={!btnsOn} onClick={()=>openDetail(type)}>
                    <span style={{fontSize:18}}>{ico}</span>{lbl}
                  </button>
                ))}
              </div>
            </>
          )}
          <div style={{textAlign:"center",fontSize:13,color:"#888",padding:"4px 0 6px"}}>
            {match.phase==="pre"?"試合種別・相手チームを設定してキックオフ":btnsOn?"ボタンでイベントを記録":phaseLabel}
          </div>
        </div>
      )}

      {/* ===== 速報タブ ===== */}
      {tab===1&&(
        <div>
          {!isLive&&match.phase!=="end"?(
            <div style={{textAlign:"center",color:"#aaa",fontSize:14,padding:32}}>試合が始まると速報が表示されます</div>
          ):(
            <>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                {isLive&&<span style={{background:"#e74c3c",color:"#fff",fontSize:11,fontWeight:500,padding:"3px 10px",borderRadius:20,animation:"pulse 1.5s infinite"}}>● LIVE</span>}
                <span style={{fontSize:13,color:"#666"}}>{match.matchType} · vs {awayName}</span>
              </div>
              <MatchTimeline m={match} editable={false}/>
            </>
          )}
        </div>
      )}

      {/* ===== 選手タブ ===== */}
      {tab===2&&(
        <div>
          <div style={{marginBottom:12}}>
            <span style={{background:NAVY,color:GOLD_L,fontSize:12,fontWeight:500,padding:"4px 12px",borderRadius:20}}>FC Daurat 選手登録</span>
          </div>
          <div style={{display:"flex",gap:8,marginBottom:10}}>
            <input type="number" value={addNum} onChange={e=>setAddNum(e.target.value)} placeholder="#" min="1" max="99"
              style={{width:70,padding:"10px 10px",fontSize:14,border:"0.5px solid #ccc",borderRadius:8,background:"#fff"}}/>
            <input type="text" value={addName} onChange={e=>setAddName(e.target.value)} placeholder="選手名"
              style={{flex:1,padding:"10px 12px",fontSize:14,border:"0.5px solid #ccc",borderRadius:8,background:"#fff"}}/>
            <button onClick={addPlayer} style={{padding:"10px 14px",background:NAVY,color:GOLD_L,border:"none",borderRadius:8,fontSize:14,cursor:"pointer",whiteSpace:"nowrap"}}>追加</button>
          </div>
          {rosterKeys.length===0?(
            <div style={{textAlign:"center",color:"#aaa",fontSize:14,padding:28}}>選手を登録してください</div>
          ):(
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:14}}>
              <thead><tr>{["#","選手名",""].map((h,i)=><th key={i} style={{textAlign:"left",fontSize:12,color:"#888",padding:"6px 8px",borderBottom:"0.5px solid #ddd"}}>{h}</th>)}</tr></thead>
              <tbody>
                {rosterKeys.map(n=>(
                  <tr key={n}>
                    <td style={{padding:8,borderBottom:"0.5px solid #eee",fontWeight:500,color:"#2A3F72"}}>#{n}</td>
                    <td style={{padding:8,borderBottom:"0.5px solid #eee"}}>{roster[n]}</td>
                    <td style={{padding:8,borderBottom:"0.5px solid #eee"}}>
                      <button onClick={()=>delPlayer(n)} style={{background:"none",border:"none",color:"#aaa",cursor:"pointer",fontSize:18}}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ===== 履歴タブ ===== */}
      {tab===3&&(
        <div>
          {/* イベント編集パネル */}
          {editingEv&&(()=>{
            const h=history[editingEv.histIdx];
            const hEvs=Array.isArray(h?.match?.evs)?h.match.evs:[];
            const targetEv=editingEv.mode!=="add"?hEvs[editingEv.evIdx]:null;
            const hAway=h?.away||"相手チーム";
            return (
              <div style={{background:"#f8f8f8",border:"1.5px solid "+GOLD,borderRadius:12,padding:14,marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <span style={{fontSize:14,fontWeight:500,color:NAVY}}>
                    {editingEv.mode==="add"?"➕ イベントを追加":editingEv.mode==="edit"?"✏️ イベントを編集":"🗑 イベントを削除"}
                  </span>
                  <button onClick={()=>setEditingEv(null)} style={{background:"none",border:"0.5px solid #ccc",borderRadius:6,padding:"3px 10px",fontSize:12,color:"#666",cursor:"pointer"}}>✕</button>
                </div>
                {editingEv.mode==="delete"?(
                  <>
                    <div style={{fontSize:13,color:"#555",marginBottom:10}}>
                      「<strong>{targetEv?.l}</strong>」を削除しますか？<br/>
                      <span style={{fontSize:11,color:"#aaa"}}>スコアも自動で再計算されます</span>
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={()=>setEditingEv(null)} style={{flex:1,padding:10,background:"#f5f5f5",border:"0.5px solid #ccc",borderRadius:8,fontSize:13,cursor:"pointer"}}>キャンセル</button>
                      <button onClick={()=>deleteHistEv(editingEv.histIdx,editingEv.evIdx)} style={{flex:1,padding:10,background:"#c0392b",color:"#fff",border:"none",borderRadius:8,fontSize:13,fontWeight:500,cursor:"pointer"}}>削除する</button>
                    </div>
                  </>
                ):(
                  <>
                    <div style={{marginBottom:8}}>
                      <label style={{fontSize:12,color:"#666",display:"block",marginBottom:4}}>イベント種類</label>
                      <select value={editEvType} onChange={e=>setEditEvType(e.target.value)} style={inp}>
                        {Object.entries(EV_DEF).map(([k,v])=><option key={k} value={k}>{v.i} {v.l}</option>)}
                      </select>
                    </div>
                    <div style={{display:"flex",gap:8,marginBottom:8}}>
                      <div style={{flex:1}}>
                        <label style={{fontSize:12,color:"#666",display:"block",marginBottom:4}}>前半/後半</label>
                        <select value={editEvHalf} onChange={e=>setEditEvHalf(Number(e.target.value))} style={inp}>
                          <option value={1}>前半</option>
                          <option value={2}>後半</option>
                        </select>
                      </div>
                      <div style={{flex:1}}>
                        <label style={{fontSize:12,color:"#666",display:"block",marginBottom:4}}>分数</label>
                        <input type="number" value={editEvMin} onChange={e=>setEditEvMin(Number(e.target.value))}
                          placeholder="例: 5" min="1" max="90" style={inp}/>
                      </div>
                    </div>
                    <div style={{display:"flex",gap:8,marginBottom:10}}>
                      <div style={{flex:1}}>
                        <label style={{fontSize:12,color:"#666",display:"block",marginBottom:4}}>チーム</label>
                        <select value={editEvTeam} onChange={e=>setEditEvTeam(e.target.value)} style={inp}>
                          <option value="home">FC Daurat</option>
                          <option value="away">{hAway}</option>
                          <option value="">なし</option>
                        </select>
                      </div>
                      <div style={{flex:1}}>
                        <label style={{fontSize:12,color:"#666",display:"block",marginBottom:4}}>背番号（任意）</label>
                        <input type="number" value={editEvNum} onChange={e=>setEditEvNum(e.target.value)}
                          placeholder="#" min="1" max="99" style={inp}/>
                      </div>
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={()=>setEditingEv(null)} style={{flex:1,padding:10,background:"#f5f5f5",border:"0.5px solid #ccc",borderRadius:8,fontSize:13,cursor:"pointer"}}>キャンセル</button>
                      <button onClick={()=>{
                        if(editingEv.mode==="edit")editHistEv(editingEv.histIdx,editingEv.evIdx,editEvType,editEvTeam,editEvNum||null,editEvHalf,editEvMin);
                        else addHistEv(editingEv.histIdx,editEvType,editEvTeam,editEvNum||null,editEvHalf,editEvMin);
                      }} style={{flex:1,padding:10,background:NAVY,color:GOLD_L,border:"none",borderRadius:8,fontSize:13,fontWeight:500,cursor:"pointer"}}>
                        {editingEv.mode==="edit"?"保存する":"追加する"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })()}

          {/* 削除確認 */}
          {deleteConfirm&&(
            <div style={{background:"#fff0f0",border:"0.5px solid #e8a0a0",borderRadius:12,padding:16,marginBottom:12,textAlign:"center"}}>
              <div style={{fontSize:14,color:"#c0392b",marginBottom:12}}>この試合の記録を削除しますか？</div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>setDeleteConfirm(null)} style={{flex:1,padding:12,background:"#f5f5f5",border:"0.5px solid #ccc",borderRadius:8,fontSize:14,cursor:"pointer"}}>キャンセル</button>
                <button onClick={()=>deleteMatch(deleteConfirm)} style={{flex:1,padding:12,background:"#c0392b",color:"#fff",border:"none",borderRadius:8,fontSize:14,fontWeight:500,cursor:"pointer"}}>削除する</button>
              </div>
            </div>
          )}

          {histDetail!==null?(
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <button onClick={()=>{setHistDetail(null);setEditingEv(null);setEditingMeta(false);}}
                  style={{padding:"8px 16px",background:"#f5f5f5",border:"0.5px solid #ccc",borderRadius:8,fontSize:13,cursor:"pointer"}}>← 一覧に戻る</button>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>{
                    const h=history[histDetail];
                    setMetaAway(h.away||"");
                    setMetaMatchType(h.matchType||"フレンドリーマッチ");
                    setMetaTournament(h.tournamentName||"");
                    setEditingMeta(true);
                  }} style={{padding:"8px 14px",background:"#f0f7ff",border:"0.5px solid #3498db",borderRadius:8,fontSize:13,color:"#1a5276",cursor:"pointer"}}>✏️ 試合情報</button>
                  <button onClick={()=>setDeleteConfirm(history[histDetail].id)}
                    style={{padding:"8px 14px",background:"#fff0f0",border:"0.5px solid #e8a0a0",borderRadius:8,fontSize:13,color:"#c0392b",cursor:"pointer"}}>🗑 削除</button>
                </div>
              </div>

              {/* 試合情報編集パネル */}
              {editingMeta&&(
                <div style={{background:"#f8f8f8",border:"1.5px solid "+GOLD,borderRadius:12,padding:14,marginBottom:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                    <span style={{fontSize:14,fontWeight:500,color:NAVY}}>✏️ 試合情報を編集</span>
                    <button onClick={()=>setEditingMeta(false)} style={{background:"none",border:"0.5px solid #ccc",borderRadius:6,padding:"3px 10px",fontSize:12,color:"#666",cursor:"pointer"}}>✕</button>
                  </div>
                  <div style={{marginBottom:8}}>
                    <label style={{fontSize:12,color:"#666",display:"block",marginBottom:4}}>試合種別</label>
                    <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                      {MATCH_TYPES.map(t=>(
                        <button key={t.value} onClick={()=>setMetaMatchType(t.value)}
                          style={{padding:"6px 14px",borderRadius:20,fontSize:12,fontWeight:500,cursor:"pointer",
                            border:metaMatchType===t.value?"none":"0.5px solid #ccc",
                            background:metaMatchType===t.value?(t.official?"#e74c3c":NAVY):"#fff",
                            color:metaMatchType===t.value?"#fff":t.official?"#e74c3c":"#333"}}>
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{marginBottom:8}}>
                    <label style={{fontSize:12,color:"#666",display:"block",marginBottom:4}}>大会名・備考（任意）</label>
                    <input type="text" value={metaTournament} onChange={e=>setMetaTournament(e.target.value)}
                      placeholder="例: 〇〇カップ" style={inp}/>
                  </div>
                  <div style={{marginBottom:12}}>
                    <label style={{fontSize:12,color:"#666",display:"block",marginBottom:4}}>相手チーム名</label>
                    <input type="text" value={metaAway} onChange={e=>setMetaAway(e.target.value)}
                      placeholder="例: 光が丘FC" style={inp}/>
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>setEditingMeta(false)} style={{flex:1,padding:10,background:"#f5f5f5",border:"0.5px solid #ccc",borderRadius:8,fontSize:13,cursor:"pointer"}}>キャンセル</button>
                    <button onClick={()=>saveHistMeta(histDetail,metaAway,metaMatchType,metaTournament)}
                      style={{flex:1,padding:10,background:NAVY,color:GOLD_L,border:"none",borderRadius:8,fontSize:13,fontWeight:500,cursor:"pointer"}}>保存する</button>
                  </div>
                </div>
              )}

              {/* スコアカード */}
              <div style={{background:NAVY,padding:"12px 14px",marginBottom:10,borderBottom:"2px solid "+GOLD,borderRadius:12}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:6}}>
                  <div style={{flex:1,textAlign:"center"}}>
                    <div style={{fontSize:12,color:GOLD_L,opacity:.8,marginBottom:2}}>FC Daurat</div>
                    <div style={{fontSize:44,fontWeight:500,color:"#fff",lineHeight:1}}>{history[histDetail].sH}</div>
                  </div>
                  <div style={{fontSize:28,color:GOLD,opacity:.5}}>:</div>
                  <div style={{flex:1,textAlign:"center"}}>
                    <div style={{fontSize:12,color:GOLD_L,opacity:.8,marginBottom:2}}>{history[histDetail].away}</div>
                    <div style={{fontSize:44,fontWeight:500,color:"#fff",lineHeight:1}}>{history[histDetail].sA}</div>
                  </div>
                </div>
                <div style={{textAlign:"center",fontSize:11,marginTop:4}}>
                  <span style={{color:MATCH_TYPES.find(t=>t.value===history[histDetail].matchType)?.official?"#ff9999":GOLD_L,opacity:.8}}>
                    {history[histDetail].matchType||""}
                  </span>
                  {history[histDetail].tournamentName&&<span style={{color:GOLD_L,opacity:.5}}> · {history[histDetail].tournamentName}</span>}
                  <span style={{color:GOLD_L,opacity:.5}}> · {history[histDetail].dateStr}</span>
                </div>
              </div>

              <div style={{fontSize:11,color:"#aaa",marginBottom:6}}>✏️ 各イベントの ✏️🗑 で編集・削除できます</div>
              <MatchTimeline m={safeMatch(history[histDetail].match)} editable={true} histIdx={histDetail}/>
              <button onClick={()=>{
                setEditEvType("goal");setEditEvTeam("home");setEditEvNum("");
                setEditEvHalf(1);setEditEvMin(1);
                setEditingEv({histIdx:histDetail,evIdx:-1,mode:"add"});
              }} style={{display:"block",width:"100%",padding:10,background:"#f0faf3",color:"#1a5c32",border:"0.5px solid #2d8a4e",borderRadius:10,fontSize:13,fontWeight:500,cursor:"pointer",marginTop:8,marginBottom:4}}>
                ➕ イベントを追加する
              </button>
              <ArticleSection m={{...safeMatch(history[histDetail].match),dateStr:history[histDetail].dateStr}} aw={history[histDetail].away}/>
            </div>
          ):(
            <>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <span style={{background:NAVY,color:GOLD_L,fontSize:12,fontWeight:500,padding:"4px 12px",borderRadius:20}}>試合履歴</span>
                <button onClick={loadHistory} style={{fontSize:12,padding:"6px 12px",background:"#f5f5f5",border:"0.5px solid #ccc",borderRadius:8,cursor:"pointer"}}>🔄 更新</button>
              </div>
              {histLoading?(
                <div style={{textAlign:"center",color:"#aaa",fontSize:14,padding:28}}>読み込み中…</div>
              ):history.length===0?(
                <div style={{textAlign:"center",color:"#aaa",fontSize:14,padding:28}}>まだ履歴がありません。<br/>試合終了時に自動で保存されます。</div>
              ):(
                history.map((h,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                    <button onClick={()=>setHistDetail(i)} style={{flex:1,textAlign:"left",background:"#fff",border:"0.5px solid #ddd",borderRadius:12,padding:"12px 14px",cursor:"pointer"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                        <span style={{fontSize:13,fontWeight:500,color:"#333"}}>vs {h.away}</span>
                        <span style={{fontSize:11,color:"#aaa"}}>{h.dateStr}</span>
                      </div>
                      {(h.matchType||h.tournamentName)&&(
                        <div style={{fontSize:11,marginBottom:4}}>
                          <span style={{color:MATCH_TYPES.find(t=>t.value===h.matchType)?.official?"#e74c3c":"#888",fontWeight:MATCH_TYPES.find(t=>t.value===h.matchType)?.official?600:400}}>
                            {h.matchType}
                          </span>
                          {h.tournamentName&&<span style={{color:"#aaa"}}> · {h.tournamentName}</span>}
                        </div>
                      )}
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontSize:26,fontWeight:500,color:NAVY}}>{h.sH}</span>
                        <span style={{fontSize:16,color:"#aaa"}}>:</span>
                        <span style={{fontSize:26,fontWeight:500,color:"#c0392b"}}>{h.sA}</span>
                        <span style={{fontSize:12,marginLeft:6,padding:"2px 8px",borderRadius:20,
                          background:h.sH>h.sA?"#f0faf3":h.sH<h.sA?"#fff5f5":"#f5f5f5",
                          color:h.sH>h.sA?"#1a5c32":h.sH<h.sA?"#922b21":"#666"}}>
                          {h.sH>h.sA?"勝利":h.sH<h.sA?"敗戦":"引き分け"}
                        </span>
                      </div>
                    </button>
                    <button onClick={()=>setDeleteConfirm(h.id)}
                      style={{padding:"12px 10px",background:"#fff0f0",border:"0.5px solid #e8a0a0",borderRadius:10,color:"#c0392b",cursor:"pointer",fontSize:18,flexShrink:0}}>
                      🗑
                    </button>
                  </div>
                ))
              )}
            </>
          )}
        </div>
      )}

      </div>
    </div>
  );
}
