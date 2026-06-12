import { useState, useEffect, useRef, useCallback } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, off } from "firebase/database";
import { getFirestore, collection, addDoc, getDocs, orderBy, query, deleteDoc, doc } from "firebase/firestore";

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBFNeT1I5Eux8kqucN2vqzm9dvrEQxwQHw",
  authDomain: "daurat-b5aef.firebaseapp.com",
  databaseURL: "https://daurat-b5aef-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "daurat-b5aef",
  storageBucket: "daurat-b5aef.firebasestorage.app",
  messagingSenderId: "1046861092853",
  appId: "1:1046861092853:web:06151f3e68ec13f77832bc"
};

const FUNCTION_URL = "https://asia-northeast1-daurat-b5aef.cloudfunctions.net/generateArticle";const firebaseApp = initializeApp(FIREBASE_CONFIG);
const rtdb = getDatabase(firebaseApp);
const firestore = getFirestore(firebaseApp);

const HOME = "FC Daurat";
const NAVY = "#0E1A3A";
const GOLD = "#D4A017";
const GOLD_L = "#F0C040";
const GOLD_P = "#FBF3DC";

const EV_DEF = {
  goal:    { l: "ゴール！",     i: "⚽" },
  concede: { l: "失点",         i: "🥅" },
  nice:    { l: "ナイスプレー", i: "✨" },
  sub:     { l: "選手交代",     i: "🔄" },
};

function pad(n) { return String(n).padStart(2, "0"); }
function fmtMs(ms) { return `${pad(Math.floor(ms/60000))}:${pad(Math.floor((ms%60000)/1000))}`; }
function evTime(rms, half, h1ms) {
  const t = rms + (half === 2 ? h1ms : 0);
  return `${half===1?"前半":"後半"} ${pad(Math.floor(t/60000)+1)}分${pad(Math.floor((t%60000)/1000))}秒`;
}
function plbl(num, pname) { if (!num) return ""; return pname ? `#${num} ${pname}` : `#${num}`; }
function todayStr() { return new Date().toLocaleDateString("ja-JP",{year:"numeric",month:"long",day:"numeric"}); }
function newMatch() { return {phase:"pre",ko:0,half:1,htAt:0,h1ms:0,sH:0,sA:0,evs:[],away:""}; }
function genCode() {
  const c="ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let code="";
  for(let i=0;i<6;i++) code+=c[Math.floor(Math.random()*c.length)]; return code;
}
function buildMatchData(m, aw, roster) {
  const ph={pre:"試合前",first:"前半進行中",ht:"ハーフタイム",second:"後半進行中",end:"試合終了"}[m.phase]||"";
  const lines=m.evs.filter(e=>!e.sys).sort((a,b)=>a.ts-b.ts)
    .map(e=>`${evTime(e.rms,e.half,m.h1ms)} ${e.l}${e.num?" "+plbl(e.num,e.pname):""}${e.team?" ("+e.team+")":""}`)
    .join("\n");
  const rosterTxt=Object.entries(roster).map(([n,nm])=>`#${n} ${nm}`).join(", ")||"未登録";
  const goals=m.evs.filter(e=>!e.sys&&e.type==="goal").length;
  const concedes=m.evs.filter(e=>!e.sys&&e.type==="concede").length;
  const nices=m.evs.filter(e=>!e.sys&&e.type==="nice").length;
  return `【試合】FC Daurat ${m.sH} - ${m.sA} ${aw}\n【状態】${ph}\n【ゴール】Daurat:${goals} / 相手:${concedes}　ナイスプレー:${nices}回\n【イベント詳細】\n${lines||"（記録なし）"}\n【登録選手】${rosterTxt}`;
}

// Canvas で新聞風見出し画像を生成
function drawNewspaper(canvas, data, matchInfo) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;

  // 背景
  ctx.fillStyle = "#FDF8E8";
  ctx.fillRect(0, 0, W, H);

  // 上部ボーダー
  ctx.fillStyle = NAVY;
  ctx.fillRect(0, 0, W, 8);
  ctx.fillStyle = GOLD;
  ctx.fillRect(0, 8, W, 4);

  // 新聞名
  ctx.fillStyle = NAVY;
  ctx.font = `bold ${W*0.09}px serif`;
  ctx.textAlign = "center";
  ctx.fillText("EL DAURAT", W/2, W*0.13);

  // 新聞名下ライン
  ctx.fillStyle = NAVY;
  ctx.fillRect(W*0.05, W*0.15, W*0.9, 2);
  ctx.fillStyle = GOLD;
  ctx.fillRect(W*0.05, W*0.155, W*0.9, 1);
  ctx.fillStyle = NAVY;
  ctx.fillRect(W*0.05, W*0.16, W*0.9, 1);

  // 日付・スローガン
  ctx.font = `${W*0.03}px serif`;
  ctx.fillStyle = "#555";
  ctx.textAlign = "left";
  ctx.fillText(todayStr(), W*0.05, W*0.2);
  ctx.textAlign = "right";
  ctx.fillText("El periódico del fútbol auténtico", W*0.95, W*0.2);

  // スコアボックス
  const sbY = W*0.23;
  const sbH = W*0.18;
  ctx.fillStyle = NAVY;
  ctx.fillRect(W*0.05, sbY, W*0.9, sbH);
  ctx.fillStyle = GOLD;
  ctx.fillRect(W*0.05, sbY+sbH-3, W*0.9, 3);

  ctx.fillStyle = "#fff";
  ctx.font = `${W*0.035}px sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("FC Daurat", W*0.25, sbY+sbH*0.35);
  ctx.fillText(matchInfo.away || "相手チーム", W*0.75, sbY+sbH*0.35);

  ctx.font = `bold ${W*0.12}px sans-serif`;
  ctx.fillStyle = GOLD_L;
  ctx.fillText(matchInfo.sH, W*0.25, sbY+sbH*0.82);
  ctx.fillText(matchInfo.sA, W*0.75, sbY+sbH*0.82);
  ctx.fillStyle = "#fff";
  ctx.font = `bold ${W*0.1}px sans-serif`;
  ctx.fillText(":", W*0.5, sbY+sbH*0.82);

  // 結果バッジ
  const resultColor = data.result==="勝利"?"#27ae60":data.result==="敗戦"?"#c0392b":"#7f8c8d";
  ctx.fillStyle = resultColor;
  const badgeY = sbY + sbH + W*0.03;
  const badgeW = W*0.22;
  const badgeH = W*0.06;
  ctx.beginPath();
  ctx.roundRect(W/2-badgeW/2, badgeY, badgeW, badgeH, 4);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = `bold ${W*0.035}px sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(data.result||"—", W/2, badgeY+badgeH*0.72);

  // 区切り線
  const divY = badgeY + badgeH + W*0.03;
  ctx.fillStyle = NAVY;
  ctx.fillRect(W*0.05, divY, W*0.9, 2);

  // 大見出し
  ctx.fillStyle = NAVY;
  ctx.textAlign = "center";
  const hlFontSize = W*0.075;
  ctx.font = `bold ${hlFontSize}px serif`;
  const headline = data.headline || "FC DAURAT 勝利！";
  // 折り返し処理
  const maxW = W*0.88;
  const words = headline.split("");
  let line = "", lines = [];
  for (let ch of words) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line); line = ch;
    } else { line = test; }
  }
  if (line) lines.push(line);
  lines.forEach((l, i) => {
    ctx.fillText(l, W/2, divY + W*0.1 + i*(hlFontSize*1.2));
  });

  const hlEndY = divY + W*0.1 + lines.length*(hlFontSize*1.2);

  // サブ見出し
  ctx.fillStyle = "#333";
  ctx.font = `${W*0.042}px serif`;
  const subheadline = data.subheadline || "";
  const subWords = subheadline.split("");
  let subLine = "", subLines = [];
  for (let ch of subWords) {
    const test = subLine + ch;
    if (ctx.measureText(test).width > maxW && subLine) {
      subLines.push(subLine); subLine = ch;
    } else { subLine = test; }
  }
  if (subLine) subLines.push(subLine);
  subLines.forEach((l, i) => {
    ctx.fillText(l, W/2, hlEndY + W*0.02 + i*(W*0.05));
  });

  const subEndY = hlEndY + W*0.02 + subLines.length*(W*0.05);

  // 区切り線
  ctx.fillStyle = GOLD;
  ctx.fillRect(W*0.2, subEndY+W*0.02, W*0.6, 2);

  // 記者コメント
  ctx.fillStyle = "#555";
  ctx.font = `italic ${W*0.038}px serif`;
  const comment = `"${data.comment||""}"`;
  const cmWords = comment.split("");
  let cmLine = "", cmLines = [];
  for (let ch of cmWords) {
    const test = cmLine + ch;
    if (ctx.measureText(test).width > maxW*0.8 && cmLine) {
      cmLines.push(cmLine); cmLine = ch;
    } else { cmLine = test; }
  }
  if (cmLine) cmLines.push(cmLine);
  cmLines.forEach((l, i) => {
    ctx.fillText(l, W/2, subEndY+W*0.07+i*(W*0.048));
  });

  const cmEndY = subEndY+W*0.07+cmLines.length*(W*0.048);

  // 星評価
  const stars = parseInt(data.rating)||5;
  ctx.font = `${W*0.06}px sans-serif`;
  ctx.fillStyle = GOLD;
  const starStr = "★".repeat(stars) + "☆".repeat(5-stars);
  ctx.fillText(starStr, W/2, cmEndY+W*0.07);

  // 下部ボーダー
  ctx.fillStyle = GOLD;
  ctx.fillRect(0, H-8, W, 4);
  ctx.fillStyle = NAVY;
  ctx.fillRect(0, H-4, W, 4);
}

export default function App() {
  const [tab, setTab] = useState(0);
  const [match, setMatch] = useState(newMatch());
  const [roster, setRoster] = useState({});
  const [history, setHistory] = useState([]);
  const [timer, setTimer] = useState("00:00");
  const [pending, setPending] = useState("");
  const [detTeam, setDetTeam] = useState("home");
  const [detNum, setDetNum] = useState("");
  const [flash, setFlash] = useState(false);
  const [flashWho, setFlashWho] = useState("");
  const [addNum, setAddNum] = useState("");
  const [addName, setAddName] = useState("");
  const [histDetail, setHistDetail] = useState(null);
  const [shareCode, setShareCode] = useState("");
  const [joinInput, setJoinInput] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState("");
  const [histLoading, setHistLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [artLoading, setArtLoading] = useState(false);
  const [artGenerated, setArtGenerated] = useState(false);

  const timerRef = useRef(null);
  const flashRef = useRef(null);
  const mRef = useRef(match);
  const rtdbListenerRef = useRef(null);
  const shareCodeRef = useRef(shareCode);
  const canvasRef = useRef(null);
  const histCanvasRef = useRef(null);
  mRef.current = match;
  shareCodeRef.current = shareCode;

  const awayName = match.away.trim() || "相手チーム";

  const getRawMs = useCallback(() => {
    const m = mRef.current;
    if (!m.ko) return 0;
    return Math.max(0, m.phase==="ht" ? m.htAt-m.ko : Date.now()-m.ko);
  }, []);

  useEffect(() => {
    if (match.phase==="first"||match.phase==="second") {
      timerRef.current = setInterval(()=>setTimer(fmtMs(getRawMs())),500);
    } else { clearInterval(timerRef.current); }
    return ()=>clearInterval(timerRef.current);
  }, [match.phase, getRawMs]);

  const loadHistory = useCallback(async () => {
    setHistLoading(true);
    try {
      const q = query(collection(firestore,"matches"),orderBy("savedAt","desc"));
      const snap = await getDocs(q);
      setHistory(snap.docs.map(d=>({id:d.id,...d.data()})));
    } catch(e) { console.error(e); }
    setHistLoading(false);
  }, []);

  useEffect(() => { if(tab===3) loadHistory(); }, [tab, loadHistory]);

  const syncToRTDB = useCallback((m, ros) => {
    const code = shareCodeRef.current;
    if (!code) return;
    set(ref(rtdb,`sessions/${code}`),{match:m,roster:ros,updatedAt:Date.now()}).catch(e=>console.error(e));
  }, []);

  const joinSession = useCallback((code) => {
    if (rtdbListenerRef.current) off(rtdbListenerRef.current);
    const dbRef = ref(rtdb,`sessions/${code}`);
    rtdbListenerRef.current = dbRef;
    setSyncing(true); setSyncStatus("接続中…");
    onValue(dbRef,(snap)=>{
      const data = snap.val();
      if (!data){setSyncStatus("データなし");return;}
      setSyncStatus("同期済み ✅");
      setMatch(data.match||newMatch());
      setRoster(data.roster||{});
    },(err)=>{setSyncStatus("接続エラー ❌");console.error(err);});
  }, []);

  const addSysEv = (m, l, i) => {
    const rms = m.ko ? Math.max(0,m.phase==="ht"?m.htAt-m.ko:Date.now()-m.ko) : 0;
    return {...m, evs:[...m.evs,{sys:true,l,i,rms,half:m.half,ts:Date.now()}]};
  };

  const kickoff = () => {
    const nm = addSysEv({...match,phase:"first",ko:Date.now(),half:1},"前半キックオフ","🟡");
    setMatch(nm); syncToRTDB(nm,roster);
  };

  const halftime = () => {
    let nm;
    if (match.phase==="first") {
      const now=Date.now();
      nm=addSysEv({...match,phase:"ht",htAt:now,h1ms:now-match.ko},"ハーフタイム","🔔");
    } else if (match.phase==="ht") {
      const now=Date.now();
      nm=addSysEv({...match,ko:match.ko+(now-match.htAt),phase:"second",half:2},"後半キックオフ","🟡");
    } else if (match.phase==="second") {
      const rms=Math.max(0,Date.now()-match.ko);
      nm={...match,phase:"end",evs:[...match.evs,{sys:true,l:"試合終了",i:"🏁",rms,half:match.half,ts:Date.now()}]};
      saveMatchToFirestore(nm,awayName);
    } else return;
    setMatch(nm); syncToRTDB(nm,roster);
  };

  const saveMatchToFirestore = async (m, aw) => {
    try {
      await addDoc(collection(firestore,"matches"),{match:m,away:aw,sH:m.sH,sA:m.sA,savedAt:Date.now(),dateStr:todayStr()});
    } catch(e) { console.error(e); }
  };

  const deleteMatch = async (id) => {
    try {
      await deleteDoc(doc(firestore,"matches",id));
      setHistory(h=>h.filter(m=>m.id!==id));
      setDeleteConfirm(null); setHistDetail(null);
    } catch(e) { console.error(e); }
  };

  const startNew = () => {
    const nm=newMatch();
    setMatch(nm); setTimer("00:00"); setPending("");
    setArtGenerated(false); syncToRTDB(nm,roster); setTab(0);
  };

  const openDetail = (type) => { setPending(type); setDetTeam("home"); setDetNum(""); };

  const commitEv = (type,team,num) => {
    const def=EV_DEF[type]; if(!def) return;
    const rms=getRawMs();
    const pname=num&&roster[num]?roster[num]:null;
    const tname=team==="home"?HOME:team==="away"?awayName:null;
    const nm={...match};
    if(type==="goal") nm.sH=match.sH+1;
    if(type==="concede") nm.sA=match.sA+1;
    nm.evs=[...match.evs,{sys:false,type,l:def.l,i:def.i,rms,half:match.half,ts:Date.now(),team:tname,num:num||null,pname}];
    setMatch(nm); syncToRTDB(nm,roster);
    if(type==="goal"&&team==="home"){
      const who=num?`#${num}${roster[num]?" "+roster[num]:""}`:HOME;
      setFlashWho(who+" が決めた！"); setFlash(true);
      clearTimeout(flashRef.current);
      flashRef.current=setTimeout(()=>setFlash(false),3500);
    }
    setPending("");
  };

  const addPlayer = () => {
    if(!addNum||!addName){alert("背番号と選手名を入力してください");return;}
    const nr={...roster,[addNum]:addName};
    setRoster(nr); setAddNum(""); setAddName(""); syncToRTDB(match,nr);
  };
  const delPlayer = (n) => { const nr={...roster};delete nr[n];setRoster(nr);syncToRTDB(match,nr); };

  const handleGenCode = () => {
    const code=genCode(); setShareCode(code); shareCodeRef.current=code;
    setSyncing(true); setSyncStatus("ホストとして接続中…");
    syncToRTDB(match,roster); joinSession(code);
  };
  const handleJoin = () => {
    const code=joinInput.trim().toUpperCase();
    if(code.length<4){alert("正しいコードを入力してください");return;}
    setShareCode(code); shareCodeRef.current=code; joinSession(code);
  };

  const generateArticleImage = async (m, aw, canvasEl) => {
    if (!canvasEl) return;
    setArtLoading(true); setArtGenerated(false);
    try {
      const matchData = buildMatchData(m, aw, roster);
      const res = await fetch(FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchData }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      drawNewspaper(canvasEl, data, { sH: m.sH, sA: m.sA, away: aw });
      setArtGenerated(true);
    } catch(e) {
      console.error(e);
      alert("記事の生成に失敗しました: " + e.message);
    }
    setArtLoading(false);
  };

  const downloadCanvas = (canvasEl) => {
    if (!canvasEl) return;
    const link = document.createElement("a");
    link.download = "el-daurat.png";
    link.href = canvasEl.toDataURL("image/png");
    link.click();
  };

  const phaseLabel={pre:"未開始",first:"前半進行中",ht:"ハーフタイム",second:"後半進行中",end:"試合終了"}[match.phase]||"";
  const htLabel=match.phase==="first"?"ハーフタイム":match.phase==="ht"?"後半開始":match.phase==="second"?"試合終了":"—";
  const btnsOn=match.phase==="first"||match.phase==="second";
  const rosterKeys=Object.keys(roster).sort((a,b)=>Number(a)-Number(b));

  const C = {
    tab:(on)=>({flex:1,padding:"10px 2px",fontSize:11,fontWeight:500,borderRadius:8,border:"0.5px solid #ccc",background:on?NAVY:"transparent",color:on?GOLD_L:"#666",cursor:"pointer"}),
    btnP:(dis)=>({display:"block",width:"100%",padding:14,background:dis?"#eee":NAVY,color:dis?"#aaa":GOLD_L,border:"none",borderRadius:12,fontSize:16,fontWeight:500,cursor:dis?"default":"pointer",marginBottom:8,borderBottom:dis?"none":`2px solid ${GOLD}`}),
    btnS:(dis)=>({display:"block",width:"100%",padding:11,background:"#f5f5f5",color:dis?"#aaa":"#333",border:"0.5px solid #ccc",borderRadius:12,fontSize:14,fontWeight:500,cursor:dis?"default":"pointer",marginBottom:10,opacity:dis?.4:1}),
    ebtn:(cls,dis)=>{
      const b={borderRadius:10,border:"0.5px solid #ccc",padding:"18px 8px",fontSize:15,fontWeight:500,cursor:dis?"default":"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:6,opacity:dis?.3:1};
      if(cls==="g") return{...b,borderColor:GOLD,background:GOLD_P,color:NAVY};
      if(cls==="c") return{...b,borderColor:"#c0392b",background:"#fff5f5",color:"#7b241c"};
      if(cls==="n") return{...b,borderColor:"#ca6f1e",background:"#fef9f0",color:"#784212"};
      if(cls==="s") return{...b,borderColor:"#1f618d",background:"#eaf4fb",color:"#154360"};
      return b;
    },
    tl:(cls)=>{
      const b={display:"flex",alignItems:"baseline",gap:6,padding:"7px 10px",borderRadius:8,border:"0.5px solid #ddd",background:"#fff",marginBottom:5,fontSize:13,lineHeight:1.4};
      if(cls==="gh") return{...b,background:GOLD_P,borderColor:GOLD,borderLeft:`3px solid ${GOLD}`,borderRadius:"0 8px 8px 0"};
      if(cls==="gc") return{...b,background:"#fff5f5",borderColor:"#c0392b"};
      if(cls==="sy") return{...b,background:"#f5f5f5"};
      return b;
    },
    scCard:{background:NAVY,borderRadius:12,padding:"14px 16px",marginBottom:12,borderBottom:`2px solid ${GOLD}`},
    sechd:{fontSize:12,fontWeight:500,color:"#888",letterSpacing:.4,margin:"12px 0 6px",paddingBottom:4,borderBottom:"0.5px solid #ddd"},
    input:{width:"100%",padding:"10px 12px",fontSize:14,border:"0.5px solid #ccc",borderRadius:8,background:"#fff",color:"#333"},
  };

  const ScoreCard = ({m,aw}) => {
    const ph={pre:"未開始",first:"前半進行中",ht:"ハーフタイム",second:"後半進行中",end:"試合終了"}[m.phase]||"";
    return (
      <div style={C.scCard}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
          <div style={{flex:1,textAlign:"center"}}>
            <div style={{fontSize:13,color:GOLD_L,opacity:.8,marginBottom:3}}>FC Daurat</div>
            <div style={{fontSize:44,fontWeight:500,color:"#fff",lineHeight:1}}>{m.sH}</div>
          </div>
          <div style={{fontSize:30,color:GOLD,opacity:.5}}>:</div>
          <div style={{flex:1,textAlign:"center"}}>
            <div style={{fontSize:13,color:GOLD_L,opacity:.8,marginBottom:3}}>{aw}</div>
            <div style={{fontSize:44,fontWeight:500,color:"#fff",lineHeight:1}}>{m.sA}</div>
          </div>
        </div>
        <div style={{textAlign:"center",fontSize:12,color:GOLD_L,opacity:.5,marginTop:6}}>{ph}</div>
      </div>
    );
  };

  const MatchTimeline = ({m}) => {
    const sc=m.evs.filter(e=>!e.sys&&(e.type==="goal"||e.type==="concede"));
    const srt=[...m.evs].sort((a,b)=>a.ts-b.ts);
    return (
      <>
        {sc.length>0&&(<>
          <div style={C.sechd}>⚽ 得点</div>
          {sc.map((e,i)=>(
            <div key={i} style={C.tl(e.type==="goal"?"gh":"gc")}>
              <span style={{fontVariantNumeric:"tabular-nums",color:e.type==="goal"?NAVY:"#7b241c",fontWeight:500,whiteSpace:"nowrap",minWidth:90,fontSize:13}}>{evTime(e.rms,e.half,m.h1ms)}</span>
              <span style={{fontSize:16}}>{e.i}</span>
              <span style={{flex:1,fontSize:13}}>{e.num?plbl(e.num,e.pname)+" ":""}{e.l}{e.team?` (${e.team})`:""}</span>
            </div>
          ))}
        </>)}
        <div style={C.sechd}>タイムライン</div>
        {srt.map((e,i)=>{
          const cls=e.sys?"sy":e.type==="goal"?"gh":e.type==="concede"?"gc":"";
          return (
            <div key={i} style={C.tl(cls)}>
              <span style={{fontVariantNumeric:"tabular-nums",color:e.sys?"#aaa":"#2A3F72",fontWeight:500,whiteSpace:"nowrap",minWidth:90,fontSize:13}}>
                {e.sys?"—":evTime(e.rms,e.half,m.h1ms)}
              </span>
              <span style={{fontSize:16}}>{e.i}</span>
              <span style={{flex:1,fontSize:e.sys?12:13,color:e.sys?"#aaa":"#333"}}>
                {e.sys?e.l:[e.num?plbl(e.num,e.pname):"",e.l,e.team?`(${e.team})`:""].filter(Boolean).join(" ")}
              </span>
            </div>
          );
        })}
      </>
    );
  };

  const ArticleSection = ({m, aw, cRef}) => (
    <div style={{marginTop:16}}>
      <button
        onClick={()=>generateArticleImage(m,aw,cRef.current)}
        disabled={artLoading}
        style={{display:"block",width:"100%",padding:14,background:artLoading?"#eee":NAVY,color:artLoading?"#aaa":GOLD_L,border:"none",borderRadius:12,fontSize:15,fontWeight:500,cursor:artLoading?"default":"pointer",borderBottom:artLoading?"none":`2px solid ${GOLD}`,marginBottom:10}}>
        {artLoading?"📰 記事を生成中…":"📰 新聞見出しを生成する"}
      </button>
      <canvas ref={cRef} width={600} height={900}
        style={{width:"100%",borderRadius:12,display:artGenerated?"block":"none",border:`2px solid ${GOLD}`,marginBottom:10}} />
      {artGenerated&&(
        <button onClick={()=>downloadCanvas(cRef.current)}
          style={{display:"block",width:"100%",padding:12,background:"#f0faf3",color:"#1a5c32",border:"0.5px solid #2d8a4e",borderRadius:10,fontSize:14,fontWeight:500,cursor:"pointer"}}>
          💾 画像を保存する
        </button>
      )}
    </div>
  );

  return (
    <div style={{maxWidth:480,margin:"0 auto",padding:"0 16px 40px",fontFamily:"sans-serif"}}>
      <div style={{background:NAVY,color:"#fff",padding:"14px 16px",borderRadius:14,marginBottom:12,borderBottom:`3px solid ${GOLD}`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <span style={{fontSize:13,color:GOLD_L}}>
            {match.phase==="pre"?"FC Daurat — 試合未開始":match.phase==="ht"?"ハーフタイム":match.phase==="end"?"試合終了":`${HOME} vs ${awayName}`}
          </span>
          <span style={{fontSize:12,background:GOLD,color:NAVY,padding:"3px 12px",borderRadius:20,fontWeight:500}}>
            {match.phase==="pre"?"—":match.phase==="first"?"前半":match.phase==="ht"?"HT":match.phase==="second"?"後半":"FT"}
          </span>
        </div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{flex:1,textAlign:"center"}}>
            <div style={{fontSize:12,color:GOLD_L,opacity:.8,marginBottom:3}}>FC Daurat</div>
            <div style={{fontSize:52,fontWeight:500,color:"#fff",lineHeight:1}}>{match.sH}</div>
          </div>
          <div style={{fontSize:32,color:GOLD,opacity:.6}}>:</div>
          <div style={{flex:1,textAlign:"center"}}>
            <div style={{fontSize:12,color:GOLD_L,opacity:.8,marginBottom:3}}>{awayName}</div>
            <div style={{fontSize:52,fontWeight:500,color:"#fff",lineHeight:1}}>{match.sA}</div>
          </div>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:6}}>
          <div style={{fontSize:26,fontWeight:500,color:GOLD_L,letterSpacing:2,flex:1,textAlign:"center",fontVariantNumeric:"tabular-nums"}}>{timer}</div>
          {syncing&&<div style={{fontSize:11,color:GOLD_L,opacity:.7}}>📡 {syncStatus}</div>}
        </div>
      </div>

      <div style={{display:"flex",gap:5,marginBottom:14}}>
        {["⚽ 観戦","👥 選手","📋 記録","🗂 履歴","📡 共有"].map((t,i)=>(
          <button key={i} style={C.tab(tab===i)} onClick={()=>setTab(i)}>{t}</button>
        ))}
      </div>

      {tab===0&&(
        <div>
          {flash&&(
            <div style={{background:NAVY,border:`2px solid ${GOLD}`,borderRadius:14,padding:20,textAlign:"center",marginBottom:12}}>
              <div style={{fontSize:26,letterSpacing:6}}>★ ★ ★ ★ ★</div>
              <div style={{fontSize:30,fontWeight:500,color:GOLD_L,letterSpacing:3}}>GOAL !!!</div>
              <div style={{fontSize:15,color:"#fff",marginTop:6}}>{flashWho}</div>
            </div>
          )}
          <div style={{background:"#f8f8f8",borderRadius:10,padding:"12px 14px",marginBottom:12,borderLeft:`3px solid ${GOLD}`}}>
            <label style={{fontSize:12,color:"#666",display:"block",marginBottom:5}}>相手チーム名</label>
            <input type="text" value={match.away} onChange={e=>setMatch(m=>({...m,away:e.target.value}))}
              placeholder="例: 光が丘FC" style={C.input} disabled={match.phase!=="pre"} />
          </div>
          <button style={C.btnP(match.phase!=="pre")} disabled={match.phase!=="pre"} onClick={kickoff}>
            {match.phase==="pre"?"▶ キックオフ":"試合中…"}
          </button>
          <button style={C.btnS(match.phase==="pre"||match.phase==="end")} disabled={match.phase==="pre"||match.phase==="end"} onClick={halftime}>
            {htLabel}
          </button>
          {match.phase==="end"&&(
            <div style={{background:"#f0faf3",border:"0.5px solid #2d8a4e",borderRadius:12,padding:16,marginBottom:12,textAlign:"center"}}>
              <div style={{fontSize:14,color:"#1a5c32",marginBottom:12}}>✅ 試合終了 — Firestoreに保存されました</div>
              <button onClick={startNew} style={{padding:"12px 28px",background:NAVY,color:GOLD_L,border:"none",borderRadius:10,fontSize:15,fontWeight:500,cursor:"pointer",borderBottom:`2px solid ${GOLD}`}}>
                🆕 新しい試合を開始
              </button>
            </div>
          )}
          {pending&&(
            <div style={{background:"#f8f8f8",borderRadius:10,padding:14,marginBottom:12,borderTop:`2px solid ${GOLD}`}}>
              <div style={{fontSize:15,fontWeight:500,marginBottom:12}}>{EV_DEF[pending]?.i} {EV_DEF[pending]?.l}</div>
              <div style={{display:"flex",gap:10,marginBottom:10}}>
                <div style={{flex:1}}>
                  <label style={{fontSize:12,color:"#666",display:"block",marginBottom:5}}>チーム</label>
                  <select value={detTeam} onChange={e=>setDetTeam(e.target.value)} style={C.input}>
                    <option value="home">FC Daurat</option>
                    <option value="away">{awayName}</option>
                  </select>
                </div>
                <div style={{flex:1}}>
                  <label style={{fontSize:12,color:"#666",display:"block",marginBottom:5}}>背番号（任意）</label>
                  <input type="number" value={detNum} onChange={e=>setDetNum(e.target.value)} placeholder="#" min="1" max="99" style={C.input} />
                </div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>commitEv(pending,null,null)} style={{flex:1,padding:12,background:"#f5f5f5",color:"#666",border:"0.5px solid #ccc",borderRadius:8,fontSize:14,cursor:"pointer"}}>スキップ</button>
                <button onClick={()=>commitEv(pending,detTeam,detNum||null)} style={{flex:1,padding:12,background:NAVY,color:GOLD_L,border:"none",borderRadius:8,fontSize:14,fontWeight:500,cursor:"pointer"}}>記録する</button>
              </div>
            </div>
          )}
          {!pending&&(
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:8,marginBottom:12}}>
              {[["goal","g","⚽","ゴール！"],["concede","c","🥅","失点"],["nice","n","✨","ナイスプレー"],["sub","s","🔄","選手交代"]].map(([type,cls,ico,lbl])=>(
                <button key={type} style={C.ebtn(cls,!btnsOn)} disabled={!btnsOn} onClick={()=>openDetail(type)}>
                  <span style={{fontSize:24}}>{ico}</span>{lbl}
                </button>
              ))}
            </div>
          )}
          <div style={{textAlign:"center",fontSize:13,color:"#888",padding:"4px 0 10px"}}>
            {match.phase==="pre"?"相手チームを入力してキックオフ":btnsOn?"ボタンでイベントを記録":phaseLabel}
          </div>
        </div>
      )}

      {tab===1&&(
        <div>
          <div style={{marginBottom:12}}>
            <span style={{background:NAVY,color:GOLD_L,fontSize:12,fontWeight:500,padding:"4px 12px",borderRadius:20}}>FC Daurat 選手登録</span>
          </div>
          <div style={{display:"flex",gap:8,marginBottom:10}}>
            <input type="number" value={addNum} onChange={e=>setAddNum(e.target.value)} placeholder="#" min="1" max="99"
              style={{width:72,padding:"10px 10px",fontSize:14,border:"0.5px solid #ccc",borderRadius:8,background:"#fff"}} />
            <input type="text" value={addName} onChange={e=>setAddName(e.target.value)} placeholder="選手名"
              style={{flex:1,padding:"10px 12px",fontSize:14,border:"0.5px solid #ccc",borderRadius:8,background:"#fff"}} />
            <button onClick={addPlayer} style={{padding:"10px 14px",background:NAVY,color:GOLD_L,border:"none",borderRadius:8,fontSize:14,cursor:"pointer",whiteSpace:"nowrap"}}>追加</button>
          </div>
          {rosterKeys.length===0?(
            <div style={{textAlign:"center",color:"#aaa",fontSize:14,padding:28}}>選手を登録してください</div>
          ):(
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:14}}>
              <thead><tr>
                {["#","選手名",""].map((h,i)=><th key={i} style={{textAlign:"left",fontSize:12,color:"#888",padding:"6px 8px",borderBottom:"0.5px solid #ddd"}}>{h}</th>)}
              </tr></thead>
              <tbody>
                {rosterKeys.map(n=>(
                  <tr key={n}>
                    <td style={{padding:8,borderBottom:"0.5px solid #eee",fontWeight:500,color:"#2A3F72"}}>#{n}</td>
                    <td style={{padding:8,borderBottom:"0.5px solid #eee"}}>{roster[n]}</td>
                    <td style={{padding:8,borderBottom:"0.5px solid #eee"}}>
                      <button onClick={()=>delPlayer(n)} style={{background:"none",border:"none",color:"#aaa",cursor:"pointer",fontSize:18,padding:"2px 6px"}}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab===2&&(
        <div>
          {match.evs.length===0?(
            <div style={{textAlign:"center",color:"#aaa",fontSize:14,padding:28}}>まだ記録がありません</div>
          ):(
            <>
              <ScoreCard m={match} aw={awayName} />
              <MatchTimeline m={match} />
              <ArticleSection m={match} aw={awayName} cRef={canvasRef} />
            </>
          )}
        </div>
      )}

      {tab===3&&(
        <div>
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
                <button onClick={()=>{setHistDetail(null);setArtGenerated(false);}}
                  style={{padding:"8px 16px",background:"#f5f5f5",border:"0.5px solid #ccc",borderRadius:8,fontSize:13,cursor:"pointer"}}>← 一覧に戻る</button>
                <button onClick={()=>setDeleteConfirm(history[histDetail].id)}
                  style={{padding:"8px 16px",background:"#fff0f0",border:"0.5px solid #e8a0a0",borderRadius:8,fontSize:13,color:"#c0392b",cursor:"pointer"}}>🗑 削除</button>
              </div>
              <ScoreCard m={history[histDetail].match} aw={history[histDetail].away} />
              <div style={{fontSize:12,color:"#aaa",marginBottom:10}}>{history[histDetail].dateStr}</div>
              <MatchTimeline m={history[histDetail].match} />
              <ArticleSection m={history[histDetail].match} aw={history[histDetail].away} cRef={histCanvasRef} />
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
                <div style={{textAlign:"center",color:"#aaa",fontSize:14,padding:28}}>まだ履歴がありません。<br />試合終了時に自動で保存されます。</div>
              ):(
                history.map((h,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                    <button onClick={()=>{setHistDetail(i);setArtGenerated(false);}} style={{flex:1,textAlign:"left",background:"#fff",border:"0.5px solid #ddd",borderRadius:12,padding:"14px 16px",cursor:"pointer"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                        <span style={{fontSize:14,fontWeight:500,color:"#333"}}>vs {h.away}</span>
                        <span style={{fontSize:12,color:"#aaa"}}>{h.dateStr}</span>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <span style={{fontSize:28,fontWeight:500,color:NAVY}}>{h.sH}</span>
                        <span style={{fontSize:18,color:"#aaa"}}>:</span>
                        <span style={{fontSize:28,fontWeight:500,color:"#c0392b"}}>{h.sA}</span>
                        <span style={{fontSize:13,marginLeft:6,padding:"3px 10px",borderRadius:20,
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

      {tab===4&&(
        <div>
          <div style={{background:"#f8f8f8",borderRadius:12,padding:16,marginBottom:14,borderLeft:`3px solid ${GOLD}`}}>
            <div style={{fontSize:13,fontWeight:500,color:"#333",marginBottom:10}}>📡 ホストとして共有</div>
            <div style={{fontFamily:"monospace",fontSize:28,fontWeight:500,color:NAVY,textAlign:"center",letterSpacing:5,margin:"10px 0"}}>
              {shareCode||"—"}
            </div>
            <div style={{fontSize:12,color:"#aaa",textAlign:"center",marginBottom:10}}>このコードを仲間に伝えてください</div>
            <button onClick={handleGenCode} style={{display:"block",width:"100%",padding:12,background:NAVY,color:GOLD_L,border:"none",borderRadius:10,fontSize:14,fontWeight:500,cursor:"pointer",borderBottom:`2px solid ${GOLD}`}}>
              🔄 新しいコードを生成
            </button>
          </div>
          <div style={{background:"#f8f8f8",borderRadius:12,padding:16,marginBottom:14}}>
            <div style={{fontSize:13,fontWeight:500,color:"#333",marginBottom:10}}>🔗 コードで参加</div>
            <input type="text" value={joinInput} onChange={e=>setJoinInput(e.target.value.toUpperCase())}
              placeholder="XXXXXX" maxLength={6}
              style={{...C.input,textAlign:"center",letterSpacing:5,fontFamily:"monospace",fontSize:22,marginBottom:10}} />
            <button onClick={handleJoin} style={{display:"block",width:"100%",padding:12,background:NAVY,color:GOLD_L,border:"none",borderRadius:10,fontSize:14,fontWeight:500,cursor:"pointer",borderBottom:`2px solid ${GOLD}`}}>
              参加する
            </button>
          </div>
          {syncing&&(
            <div style={{textAlign:"center",padding:12,background:"#f0faf3",borderRadius:10,fontSize:13,color:"#1a5c32"}}>
              {syncStatus}
            </div>
          )}
          <div style={{marginTop:12,background:"#fffde7",borderRadius:10,padding:12,fontSize:13,color:"#7d6608",lineHeight:1.7}}>
            💡 ホスト側がコードを生成 → 仲間がそのコードで参加するとリアルタイムで同期されます。
          </div>
        </div>
      )}
    </div>
  );
}
