import { useState, useEffect, useRef, useCallback } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, off } from "firebase/database";
import { getFirestore, collection, addDoc, getDocs, orderBy, query } from "firebase/firestore";

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBFNeT1I5Eux8kqucN2vqzm9dvrEQxwQHw",
  authDomain: "daurat-b5aef.firebaseapp.com",
  databaseURL: "https://daurat-b5aef-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "daurat-b5aef",
  storageBucket: "daurat-b5aef.firebasestorage.app",
  messagingSenderId: "1046861092853",
  appId: "1:1046861092853:web:06151f3e68ec13f77832bc"
};

const firebaseApp = initializeApp(FIREBASE_CONFIG);
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
function fmtMs(ms) {
  return `${pad(Math.floor(ms / 60000))}:${pad(Math.floor((ms % 60000) / 1000))}`;
}
function evTime(rms, half, h1ms) {
  const off = half === 2 ? h1ms : 0;
  const t = rms + off;
  return `${half === 1 ? "前半" : "後半"} ${pad(Math.floor(t / 60000) + 1)}分${pad(Math.floor((t % 60000) / 1000))}秒`;
}
function plbl(num, pname) {
  if (!num) return "";
  return pname ? `#${num} ${pname}` : `#${num}`;
}
function todayStr() {
  return new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });
}
function newMatch() {
  return { phase: "pre", ko: 0, half: 1, htAt: 0, h1ms: 0, sH: 0, sA: 0, evs: [], away: "" };
}
function genCode() {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += c[Math.floor(Math.random() * c.length)];
  return code;
}
function buildArticleText(m, aw, roster) {
  const ph = { pre: "試合前", first: "前半進行中", ht: "ハーフタイム", second: "後半進行中", end: "試合終了" }[m.phase] || "";
  const lines = m.evs.filter(e => !e.sys).sort((a, b) => a.ts - b.ts)
    .map(e => `${evTime(e.rms, e.half, m.h1ms)} ${e.l}${e.num ? " " + plbl(e.num, e.pname) : ""}${e.team ? " (" + e.team + ")" : ""}`)
    .join("\n");
  const rosterTxt = Object.entries(roster).map(([n, nm]) => `#${n} ${nm}`).join(", ") || "未登録";
  const goals = m.evs.filter(e => !e.sys && e.type === "goal").length;
  const concedes = m.evs.filter(e => !e.sys && e.type === "concede").length;
  const nices = m.evs.filter(e => !e.sys && e.type === "nice").length;
  return `以下の試合データでEL DAURAT風の記事を書いてください。\n\n【試合】FC Daurat ${m.sH} - ${m.sA} ${aw}\n【状態】${ph}\n【ゴール】Daurat:${goals} / 相手:${concedes}　ナイスプレー:${nices}回\n【イベント詳細】\n${lines || "（記録なし）"}\n【登録選手】${rosterTxt}`;
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
  const [copyText, setCopyText] = useState("");
  const [copied, setCopied] = useState(false);
  const [shareCode, setShareCode] = useState("");
  const [joinInput, setJoinInput] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState("");
  const [histLoading, setHistLoading] = useState(false);

  const timerRef = useRef(null);
  const flashRef = useRef(null);
  const mRef = useRef(match);
  const rtdbListenerRef = useRef(null);
  const shareCodeRef = useRef(shareCode);
  mRef.current = match;
  shareCodeRef.current = shareCode;

  const awayName = match.away.trim() || "相手チーム";

  const getRawMs = useCallback(() => {
    const m = mRef.current;
    if (!m.ko) return 0;
    const ms = m.phase === "ht" ? m.htAt - m.ko : Date.now() - m.ko;
    return Math.max(0, ms);
  }, []);

  useEffect(() => {
    if (match.phase === "first" || match.phase === "second") {
      timerRef.current = setInterval(() => setTimer(fmtMs(getRawMs())), 500);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [match.phase, getRawMs]);

  // Firestoreから履歴を読み込む
  const loadHistory = useCallback(async () => {
    setHistLoading(true);
    try {
      const q = query(collection(firestore, "matches"), orderBy("savedAt", "desc"));
      const snap = await getDocs(q);
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setHistory(items);
    } catch (e) {
      console.error("履歴読み込みエラー:", e);
    }
    setHistLoading(false);
  }, []);

  useEffect(() => {
    if (tab === 3) loadHistory();
  }, [tab, loadHistory]);

  // Realtime DBへリアルタイム同期
  const syncToRTDB = useCallback((m, ros) => {
    const code = shareCodeRef.current;
    if (!code) return;
    const dbRef = ref(rtdb, `sessions/${code}`);
    set(dbRef, {
      match: m,
      roster: ros,
      updatedAt: Date.now(),
    }).catch(e => console.error("RTDB書き込みエラー:", e));
  }, []);

  // セッションに参加（リスナー登録）
  const joinSession = useCallback((code) => {
    if (rtdbListenerRef.current) {
      off(rtdbListenerRef.current);
    }
    const dbRef = ref(rtdb, `sessions/${code}`);
    rtdbListenerRef.current = dbRef;
    setSyncing(true);
    setSyncStatus("接続中…");
    onValue(dbRef, (snap) => {
      const data = snap.val();
      if (!data) { setSyncStatus("データなし"); return; }
      setSyncStatus("同期済み ✅");
      setMatch(data.match || newMatch());
      setRoster(data.roster || {});
      if (data.match?.away) {
        // awayInputも更新
      }
    }, (err) => {
      setSyncStatus("接続エラー ❌");
      console.error(err);
    });
  }, []);

  const addSysEv = (m, l, i) => {
    const rms = (() => {
      if (!m.ko) return 0;
      const ms = m.phase === "ht" ? m.htAt - m.ko : Date.now() - m.ko;
      return Math.max(0, ms);
    })();
    return { ...m, evs: [...m.evs, { sys: true, l, i, rms, half: m.half, ts: Date.now() }] };
  };

  const kickoff = () => {
    const now = Date.now();
    const nm = addSysEv({ ...match, phase: "first", ko: now, half: 1 }, "前半キックオフ", "🟡");
    setMatch(nm);
    syncToRTDB(nm, roster);
  };

  const halftime = () => {
    let nm;
    if (match.phase === "first") {
      const now = Date.now();
      nm = addSysEv({ ...match, phase: "ht", htAt: now, h1ms: now - match.ko }, "ハーフタイム", "🔔");
    } else if (match.phase === "ht") {
      const now = Date.now();
      nm = addSysEv({ ...match, ko: match.ko + (now - match.htAt), phase: "second", half: 2 }, "後半キックオフ", "🟡");
    } else if (match.phase === "second") {
      const rms = Math.max(0, Date.now() - match.ko);
      nm = { ...match, phase: "end", evs: [...match.evs, { sys: true, l: "試合終了", i: "🏁", rms, half: match.half, ts: Date.now() }] };
      // Firestoreに保存
      saveMatchToFirestore(nm, awayName);
    } else return;
    setMatch(nm);
    syncToRTDB(nm, roster);
  };

  const saveMatchToFirestore = async (m, aw) => {
    try {
      await addDoc(collection(firestore, "matches"), {
        match: m,
        away: aw,
        sH: m.sH,
        sA: m.sA,
        savedAt: Date.now(),
        dateStr: todayStr(),
      });
      setSyncStatus("履歴保存済み ✅");
    } catch (e) {
      console.error("Firestore保存エラー:", e);
    }
  };

  const startNew = () => {
    const nm = newMatch();
    setMatch(nm);
    setTimer("00:00");
    setPending("");
    setCopyText("");
    setCopied(false);
    syncToRTDB(nm, roster);
    setTab(0);
  };

  const openDetail = (type) => { setPending(type); setDetTeam("home"); setDetNum(""); };

  const commitEv = (type, team, num) => {
    const def = EV_DEF[type]; if (!def) return;
    const rms = getRawMs();
    const pname = num && roster[num] ? roster[num] : null;
    const tname = team === "home" ? HOME : team === "away" ? awayName : null;
    const nm = { ...match };
    if (type === "goal") nm.sH = match.sH + 1;
    if (type === "concede") nm.sA = match.sA + 1;
    nm.evs = [...match.evs, { sys: false, type, l: def.l, i: def.i, rms, half: match.half, ts: Date.now(), team: tname, num: num || null, pname }];
    setMatch(nm);
    syncToRTDB(nm, roster);
    if (type === "goal" && team === "home") {
      const who = num ? `#${num}${roster[num] ? " " + roster[num] : ""}` : HOME;
      setFlashWho(who + " が決めた！");
      setFlash(true);
      clearTimeout(flashRef.current);
      flashRef.current = setTimeout(() => setFlash(false), 3500);
    }
    setPending("");
  };

  const addPlayer = () => {
    if (!addNum || !addName) { alert("背番号と選手名を入力してください"); return; }
    const nr = { ...roster, [addNum]: addName };
    setRoster(nr);
    setAddNum(""); setAddName("");
    syncToRTDB(match, nr);
  };
  const delPlayer = (n) => {
    const nr = { ...roster }; delete nr[n];
    setRoster(nr);
    syncToRTDB(match, nr);
  };

  const handleGenCode = () => {
    const code = genCode();
    setShareCode(code);
    shareCodeRef.current = code;
    setSyncing(true);
    setSyncStatus("ホストとして接続中…");
    syncToRTDB(match, roster);
    joinSession(code);
  };

  const handleJoin = () => {
    const code = joinInput.trim().toUpperCase();
    if (code.length < 4) { alert("正しいコードを入力してください"); return; }
    setShareCode(code);
    shareCodeRef.current = code;
    joinSession(code);
  };

  const showArticlePanel = (m, aw) => {
    const txt = buildArticleText(m, aw, roster);
    setCopyText(txt);
    setCopied(false);
  };

  const doCopy = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(copyText).then(() => setCopied(true));
    } else {
      const ta = document.createElement("textarea");
      ta.value = copyText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
    }
  };

  const phaseLabel = { pre: "未開始", first: "前半進行中", ht: "ハーフタイム", second: "後半進行中", end: "試合終了" }[match.phase] || "";
  const htLabel = match.phase === "first" ? "ハーフタイム" : match.phase === "ht" ? "後半開始" : match.phase === "second" ? "試合終了" : "—";
  const btnsOn = match.phase === "first" || match.phase === "second";
  const rosterKeys = Object.keys(roster).sort((a, b) => Number(a) - Number(b));

  const C = {
    tab: (on) => ({ flex: 1, padding: "8px 4px", fontSize: 12, fontWeight: 500, borderRadius: 8, border: "0.5px solid #ccc", background: on ? NAVY : "transparent", color: on ? GOLD_L : "#666", cursor: "pointer" }),
    btnP: (dis) => ({ display: "block", width: "100%", padding: 12, background: dis ? "#eee" : NAVY, color: dis ? "#aaa" : GOLD_L, border: "none", borderRadius: 12, fontSize: 14, fontWeight: 500, cursor: dis ? "default" : "pointer", marginBottom: 7, borderBottom: dis ? "none" : `2px solid ${GOLD}` }),
    btnS: (dis) => ({ display: "block", width: "100%", padding: 9, background: "#f5f5f5", color: dis ? "#aaa" : "#333", border: "0.5px solid #ccc", borderRadius: 12, fontSize: 13, fontWeight: 500, cursor: dis ? "default" : "pointer", marginBottom: 10, opacity: dis ? .4 : 1 }),
    ebtn: (cls, dis) => {
      const b = { borderRadius: 8, border: "0.5px solid #ccc", padding: "14px 8px", fontSize: 13, fontWeight: 500, cursor: dis ? "default" : "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 5, opacity: dis ? .3 : 1 };
      if (cls === "g") return { ...b, borderColor: GOLD, background: GOLD_P, color: NAVY };
      if (cls === "c") return { ...b, borderColor: "#c0392b", background: "#fff5f5", color: "#7b241c" };
      if (cls === "n") return { ...b, borderColor: "#ca6f1e", background: "#fef9f0", color: "#784212" };
      if (cls === "s") return { ...b, borderColor: "#1f618d", background: "#eaf4fb", color: "#154360" };
      return b;
    },
    tl: (cls) => {
      const b = { display: "flex", alignItems: "baseline", gap: 6, padding: "5px 8px", borderRadius: 8, border: "0.5px solid #ddd", background: "#fff", marginBottom: 4, fontSize: 12, lineHeight: 1.4 };
      if (cls === "gh") return { ...b, background: GOLD_P, borderColor: GOLD, borderLeft: `3px solid ${GOLD}`, borderRadius: "0 8px 8px 0" };
      if (cls === "gc") return { ...b, background: "#fff5f5", borderColor: "#c0392b" };
      if (cls === "sy") return { ...b, background: "#f5f5f5" };
      return b;
    },
    scCard: { background: NAVY, borderRadius: 12, padding: "12px 14px", marginBottom: 10, borderBottom: `2px solid ${GOLD}` },
    sechd: { fontSize: 11, fontWeight: 500, color: "#888", letterSpacing: .4, margin: "10px 0 5px", paddingBottom: 3, borderBottom: "0.5px solid #ddd" },
    input: { width: "100%", padding: "8px 10px", fontSize: 13, border: "0.5px solid #ccc", borderRadius: 8, background: "#fff", color: "#333" },
  };

  const ScoreCard = ({ m, aw }) => {
    const ph = { pre: "未開始", first: "前半進行中", ht: "ハーフタイム", second: "後半進行中", end: "試合終了" }[m.phase] || "";
    return (
      <div style={C.scCard}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 12, color: GOLD_L, opacity: .8, marginBottom: 2 }}>FC Daurat</div>
            <div style={{ fontSize: 38, fontWeight: 500, color: "#fff", lineHeight: 1 }}>{m.sH}</div>
          </div>
          <div style={{ fontSize: 26, color: GOLD, opacity: .5 }}>:</div>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 12, color: GOLD_L, opacity: .8, marginBottom: 2 }}>{aw}</div>
            <div style={{ fontSize: 38, fontWeight: 500, color: "#fff", lineHeight: 1 }}>{m.sA}</div>
          </div>
        </div>
        <div style={{ textAlign: "center", fontSize: 11, color: GOLD_L, opacity: .5, marginTop: 4 }}>{ph}</div>
      </div>
    );
  };

  const MatchTimeline = ({ m }) => {
    const sc = m.evs.filter(e => !e.sys && (e.type === "goal" || e.type === "concede"));
    const srt = [...m.evs].sort((a, b) => a.ts - b.ts);
    return (
      <>
        {sc.length > 0 && (
          <>
            <div style={C.sechd}>⚽ 得点</div>
            {sc.map((e, i) => (
              <div key={i} style={C.tl(e.type === "goal" ? "gh" : "gc")}>
                <span style={{ fontVariantNumeric: "tabular-nums", color: e.type === "goal" ? NAVY : "#7b241c", fontWeight: 500, whiteSpace: "nowrap", minWidth: 80, fontSize: 12 }}>{evTime(e.rms, e.half, m.h1ms)}</span>
                <span style={{ fontSize: 14 }}>{e.i}</span>
                <span style={{ flex: 1, fontSize: 12 }}>{e.num ? plbl(e.num, e.pname) + " " : ""}{e.l}{e.team ? ` (${e.team})` : ""}</span>
              </div>
            ))}
          </>
        )}
        <div style={C.sechd}>タイムライン</div>
        {srt.map((e, i) => {
          const cls = e.sys ? "sy" : e.type === "goal" ? "gh" : e.type === "concede" ? "gc" : "";
          return (
            <div key={i} style={C.tl(cls)}>
              <span style={{ fontVariantNumeric: "tabular-nums", color: e.sys ? "#aaa" : "#2A3F72", fontWeight: 500, whiteSpace: "nowrap", minWidth: 80, fontSize: 12 }}>
                {e.sys ? "—" : evTime(e.rms, e.half, m.h1ms)}
              </span>
              <span style={{ fontSize: 14 }}>{e.i}</span>
              <span style={{ flex: 1, fontSize: e.sys ? 11 : 12, color: e.sys ? "#aaa" : "#333" }}>
                {e.sys ? e.l : [e.num ? plbl(e.num, e.pname) : "", e.l, e.team ? `(${e.team})` : ""].filter(Boolean).join(" ")}
              </span>
            </div>
          );
        })}
      </>
    );
  };

  const ArticlePanel = ({ m, aw }) => (
    <div style={{ marginTop: 14 }}>
      <button onClick={() => showArticlePanel(m, aw)}
        style={{ display: "block", width: "100%", padding: 12, background: NAVY, color: GOLD_L, border: "none", borderRadius: 12, fontSize: 14, fontWeight: 500, cursor: "pointer", borderBottom: `2px solid ${GOLD}` }}>
        📰 試合記事を生成する
      </button>
      {copyText && (
        <div style={{ marginTop: 10, background: "#f8f8f8", borderRadius: 12, padding: 12, border: "0.5px solid #ddd" }}>
          <div style={{ fontSize: 12, color: "#555", marginBottom: 8, lineHeight: 1.6 }}>
            ① 下のボタンでコピー　② このチャットに貼り付けて送信
          </div>
          <pre style={{ fontSize: 11, color: "#444", background: "#fff", border: "0.5px solid #ddd", borderRadius: 8, padding: 10, whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: 140, overflowY: "auto", marginBottom: 8 }}>{copyText}</pre>
          <button onClick={doCopy} style={{ display: "block", width: "100%", padding: 10, background: copied ? "#f0faf3" : NAVY, color: copied ? "#1a5c32" : GOLD_L, border: copied ? "0.5px solid #2d8a4e" : "none", borderRadius: 10, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
            {copied ? "✅ コピーしました！" : "📋 テキストをコピー"}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div style={{ maxWidth: 380, margin: "0 auto", padding: "0 0 2rem", fontFamily: "sans-serif" }}>

      <div style={{ background: NAVY, color: "#fff", padding: "12px 14px", borderRadius: 12, marginBottom: 10, borderBottom: `3px solid ${GOLD}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: GOLD_L }}>
            {match.phase === "pre" ? "FC Daurat — 試合未開始" : match.phase === "ht" ? "ハーフタイム" : match.phase === "end" ? "試合終了" : `${HOME} vs ${awayName}`}
          </span>
          <span style={{ fontSize: 11, background: GOLD, color: NAVY, padding: "2px 10px", borderRadius: 20, fontWeight: 500 }}>
            {match.phase === "pre" ? "—" : match.phase === "first" ? "前半" : match.phase === "ht" ? "HT" : match.phase === "second" ? "後半" : "FT"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 11, color: GOLD_L, opacity: .8, marginBottom: 2 }}>FC Daurat</div>
            <div style={{ fontSize: 38, fontWeight: 500, color: "#fff", lineHeight: 1 }}>{match.sH}</div>
          </div>
          <div style={{ fontSize: 26, color: GOLD, opacity: .6 }}>:</div>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 11, color: GOLD_L, opacity: .8, marginBottom: 2 }}>{awayName}</div>
            <div style={{ fontSize: 38, fontWeight: 500, color: "#fff", lineHeight: 1 }}>{match.sA}</div>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
          <div style={{ fontSize: 22, fontWeight: 500, color: GOLD_L, letterSpacing: 2, fontVariantNumeric: "tabular-nums", flex: 1, textAlign: "center" }}>{timer}</div>
          {syncing && <div style={{ fontSize: 10, color: GOLD_L, opacity: .7 }}>📡 {syncStatus}</div>}
        </div>
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        {["⚽ 観戦", "👥 選手", "📋 記録", "🗂 履歴", "📡 共有"].map((t, i) => (
          <button key={i} style={{ ...C.tab(tab === i), fontSize: 11 }} onClick={() => setTab(i)}>{t}</button>
        ))}
      </div>

      {tab === 0 && (
        <div>
          {flash && (
            <div style={{ background: NAVY, border: `2px solid ${GOLD}`, borderRadius: 12, padding: 16, textAlign: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 22, letterSpacing: 5 }}>★ ★ ★ ★ ★</div>
              <div style={{ fontSize: 26, fontWeight: 500, color: GOLD_L, letterSpacing: 2 }}>GOAL !!!</div>
              <div style={{ fontSize: 13, color: "#fff", marginTop: 4 }}>{flashWho}</div>
            </div>
          )}
          <div style={{ background: "#f8f8f8", borderRadius: 8, padding: "10px 12px", marginBottom: 10, borderLeft: `3px solid ${GOLD}` }}>
            <label style={{ fontSize: 11, color: "#666", display: "block", marginBottom: 3 }}>相手チーム名</label>
            <input type="text" value={match.away} onChange={e => setMatch(m => ({ ...m, away: e.target.value }))}
              placeholder="例: 光が丘FC" style={C.input} disabled={match.phase !== "pre"} />
          </div>
          <button style={C.btnP(match.phase !== "pre")} disabled={match.phase !== "pre"} onClick={kickoff}>
            {match.phase === "pre" ? "▶ キックオフ" : "試合中…"}
          </button>
          <button style={C.btnS(match.phase === "pre" || match.phase === "end")} disabled={match.phase === "pre" || match.phase === "end"} onClick={halftime}>
            {htLabel}
          </button>
          {match.phase === "end" && (
            <div style={{ background: "#f0faf3", border: "0.5px solid #2d8a4e", borderRadius: 12, padding: 14, marginBottom: 10, textAlign: "center" }}>
              <div style={{ fontSize: 13, color: "#1a5c32", marginBottom: 10 }}>✅ 試合終了 — Firestoreに保存されました</div>
              <button onClick={startNew} style={{ padding: "10px 24px", background: NAVY, color: GOLD_L, border: "none", borderRadius: 10, fontSize: 14, fontWeight: 500, cursor: "pointer", borderBottom: `2px solid ${GOLD}` }}>
                🆕 新しい試合を開始
              </button>
            </div>
          )}
          {pending && (
            <div style={{ background: "#f8f8f8", borderRadius: 8, padding: 12, marginBottom: 10, borderTop: `2px solid ${GOLD}` }}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>{EV_DEF[pending]?.i} {EV_DEF[pending]?.l}</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: "#666", display: "block", marginBottom: 3 }}>チーム</label>
                  <select value={detTeam} onChange={e => setDetTeam(e.target.value)} style={C.input}>
                    <option value="home">FC Daurat</option>
                    <option value="away">{awayName}</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: "#666", display: "block", marginBottom: 3 }}>背番号（任意）</label>
                  <input type="number" value={detNum} onChange={e => setDetNum(e.target.value)} placeholder="#" min="1" max="99" style={C.input} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 7 }}>
                <button onClick={() => commitEv(pending, null, null)} style={{ flex: 1, padding: 9, background: "#f5f5f5", color: "#666", border: "0.5px solid #ccc", borderRadius: 8, fontSize: 12, cursor: "pointer" }}>スキップ</button>
                <button onClick={() => commitEv(pending, detTeam, detNum || null)} style={{ flex: 1, padding: 9, background: NAVY, color: GOLD_L, border: "none", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>記録する</button>
              </div>
            </div>
          )}
          {!pending && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 7, marginBottom: 10 }}>
              {[["goal","g","⚽","ゴール！"],["concede","c","🥅","失点"],["nice","n","✨","ナイスプレー"],["sub","s","🔄","選手交代"]].map(([type,cls,ico,lbl]) => (
                <button key={type} style={C.ebtn(cls, !btnsOn)} disabled={!btnsOn} onClick={() => openDetail(type)}>
                  <span style={{ fontSize: 20 }}>{ico}</span>{lbl}
                </button>
              ))}
            </div>
          )}
          <div style={{ textAlign: "center", fontSize: 12, color: "#888", padding: "4px 0 8px" }}>
            {match.phase === "pre" ? "相手チームを入力してキックオフ" : btnsOn ? "ボタンでイベントを記録" : phaseLabel}
          </div>
        </div>
      )}

      {tab === 1 && (
        <div>
          <div style={{ marginBottom: 10 }}>
            <span style={{ background: NAVY, color: GOLD_L, fontSize: 11, fontWeight: 500, padding: "3px 10px", borderRadius: 20 }}>FC Daurat 選手登録</span>
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <input type="number" value={addNum} onChange={e => setAddNum(e.target.value)} placeholder="#" min="1" max="99"
              style={{ width: 64, padding: "8px 10px", fontSize: 13, border: "0.5px solid #ccc", borderRadius: 8, background: "#fff" }} />
            <input type="text" value={addName} onChange={e => setAddName(e.target.value)} placeholder="選手名"
              style={{ flex: 1, padding: "8px 10px", fontSize: 13, border: "0.5px solid #ccc", borderRadius: 8, background: "#fff" }} />
            <button onClick={addPlayer} style={{ padding: "8px 12px", background: NAVY, color: GOLD_L, border: "none", borderRadius: 8, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>追加</button>
          </div>
          {rosterKeys.length === 0 ? (
            <div style={{ textAlign: "center", color: "#aaa", fontSize: 13, padding: 24 }}>選手を登録してください</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr>
                {["#","選手名",""].map((h, i) => <th key={i} style={{ textAlign: "left", fontSize: 11, color: "#888", padding: "4px 6px", borderBottom: "0.5px solid #ddd" }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {rosterKeys.map(n => (
                  <tr key={n}>
                    <td style={{ padding: 6, borderBottom: "0.5px solid #eee", fontWeight: 500, color: "#2A3F72" }}>#{n}</td>
                    <td style={{ padding: 6, borderBottom: "0.5px solid #eee" }}>{roster[n]}</td>
                    <td style={{ padding: 6, borderBottom: "0.5px solid #eee" }}>
                      <button onClick={() => delPlayer(n)} style={{ background: "none", border: "none", color: "#aaa", cursor: "pointer", fontSize: 14 }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 2 && (
        <div>
          {match.evs.length === 0 ? (
            <div style={{ textAlign: "center", color: "#aaa", fontSize: 13, padding: 24 }}>まだ記録がありません</div>
          ) : (
            <>
              <ScoreCard m={match} aw={awayName} />
              <MatchTimeline m={match} />
              <ArticlePanel m={match} aw={awayName} />
            </>
          )}
        </div>
      )}

      {tab === 3 && (
        <div>
          {histDetail !== null ? (
            <div>
              <button onClick={() => { setHistDetail(null); setCopyText(""); setCopied(false); }}
                style={{ marginBottom: 10, padding: "7px 14px", background: "#f5f5f5", border: "0.5px solid #ccc", borderRadius: 8, fontSize: 12, cursor: "pointer" }}>← 一覧に戻る</button>
              <ScoreCard m={history[histDetail].match} aw={history[histDetail].away} />
              <div style={{ fontSize: 11, color: "#aaa", marginBottom: 8 }}>{history[histDetail].dateStr}</div>
              <MatchTimeline m={history[histDetail].match} />
              <ArticlePanel m={history[histDetail].match} aw={history[histDetail].away} />
            </div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ background: NAVY, color: GOLD_L, fontSize: 11, fontWeight: 500, padding: "3px 10px", borderRadius: 20 }}>試合履歴（Firestore）</span>
                <button onClick={loadHistory} style={{ fontSize: 11, padding: "4px 10px", background: "#f5f5f5", border: "0.5px solid #ccc", borderRadius: 8, cursor: "pointer" }}>🔄 更新</button>
              </div>
              {histLoading ? (
                <div style={{ textAlign: "center", color: "#aaa", fontSize: 13, padding: 24 }}>読み込み中…</div>
              ) : history.length === 0 ? (
                <div style={{ textAlign: "center", color: "#aaa", fontSize: 13, padding: 24 }}>まだ履歴がありません。<br />試合終了時に自動で保存されます。</div>
              ) : (
                history.map((h, i) => (
                  <button key={i} onClick={() => setHistDetail(i)} style={{ display: "block", width: "100%", textAlign: "left", background: "#fff", border: "0.5px solid #ddd", borderRadius: 12, padding: "12px 14px", marginBottom: 8, cursor: "pointer" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: "#333" }}>vs {h.away}</span>
                      <span style={{ fontSize: 11, color: "#aaa" }}>{h.dateStr}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 24, fontWeight: 500, color: NAVY }}>{h.sH}</span>
                      <span style={{ fontSize: 16, color: "#aaa" }}>:</span>
                      <span style={{ fontSize: 24, fontWeight: 500, color: "#c0392b" }}>{h.sA}</span>
                      <span style={{ fontSize: 12, marginLeft: 6, padding: "2px 8px", borderRadius: 20,
                        background: h.sH > h.sA ? "#f0faf3" : h.sH < h.sA ? "#fff5f5" : "#f5f5f5",
                        color: h.sH > h.sA ? "#1a5c32" : h.sH < h.sA ? "#922b21" : "#666" }}>
                        {h.sH > h.sA ? "勝利" : h.sH < h.sA ? "敗戦" : "引き分け"}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </>
          )}
        </div>
      )}

      {tab === 4 && (
        <div>
          <div style={{ background: "#f8f8f8", borderRadius: 12, padding: 14, marginBottom: 12, borderLeft: `3px solid ${GOLD}` }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: "#333", marginBottom: 8 }}>📡 ホストとして共有</div>
            <div style={{ fontFamily: "monospace", fontSize: 24, fontWeight: 500, color: NAVY, textAlign: "center", letterSpacing: 4, margin: "8px 0" }}>
              {shareCode || "—"}
            </div>
            <div style={{ fontSize: 11, color: "#aaa", textAlign: "center", marginBottom: 8 }}>このコードを仲間に伝えてください</div>
            <button onClick={handleGenCode} style={{ display: "block", width: "100%", padding: 10, background: NAVY, color: GOLD_L, border: "none", borderRadius: 10, fontSize: 13, fontWeight: 500, cursor: "pointer", borderBottom: `2px solid ${GOLD}` }}>
              🔄 新しいコードを生成
            </button>
          </div>
          <div style={{ background: "#f8f8f8", borderRadius: 12, padding: 14, marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: "#333", marginBottom: 8 }}>🔗 コードで参加</div>
            <input type="text" value={joinInput} onChange={e => setJoinInput(e.target.value.toUpperCase())}
              placeholder="XXXXXX" maxLength={6}
              style={{ ...C.input, textAlign: "center", letterSpacing: 4, fontFamily: "monospace", fontSize: 18, marginBottom: 8 }} />
            <button onClick={handleJoin} style={{ display: "block", width: "100%", padding: 10, background: NAVY, color: GOLD_L, border: "none", borderRadius: 10, fontSize: 13, fontWeight: 500, cursor: "pointer", borderBottom: `2px solid ${GOLD}` }}>
              参加する
            </button>
          </div>
          {syncing && (
            <div style={{ textAlign: "center", padding: 10, background: "#f0faf3", borderRadius: 10, fontSize: 12, color: "#1a5c32" }}>
              {syncStatus}
            </div>
          )}
          <div style={{ marginTop: 10, background: "#fffde7", borderRadius: 10, padding: 10, fontSize: 12, color: "#7d6608", lineHeight: 1.6 }}>
            💡 ホスト側がコードを生成 → 仲間がそのコードで参加するとリアルタイムで同期されます。イベント記録・スコアが即座に全端末に反映されます。
          </div>
        </div>
      )}
    </div>
  );
}
