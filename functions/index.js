const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const https = require("https");

setGlobalOptions({ region: "asia-northeast1" });

exports.generateArticle = onRequest((req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const { matchData } = req.body;
  if (!matchData) {
    res.status(400).send("matchData is required");
    return;
  }

  const apiKey = process.env.ANTHROPIC_KEY;

  const prompt = `あなたはFC Dauratの熱狂的サポーターでもあるスペイン系サッカー専門紙「EL DAURAT」の記者です。以下の試合データをもとに、FC Dauratを徹底的に贔屓した新聞の見出し・サブ見出し・一言コメントを生成してください。

${matchData}

以下のJSON形式のみで返してください。説明や余計なテキストは不要です：
{
  "headline": "大きな見出し（20文字以内、インパクト重視）",
  "subheadline": "サブ見出し（30文字以内）",
  "comment": "記者の一言コメント（40文字以内、スペイン語感嘆詞を含む）",
  "rating": 5,
  "result": "勝利"
}`;

  const body = JSON.stringify({
    model: "claude-sonnet-4-6",
    max_tokens: 500,
    messages: [{ role: "user", content: prompt }],
  });

  const options = {
    hostname: "api.anthropic.com",
    path: "/v1/messages",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
  };

  const apiReq = https.request(options, (apiRes) => {
    let data = "";
    apiRes.on("data", (chunk) => { data += chunk; });
    apiRes.on("end", () => {
      try {
        const parsed = JSON.parse(data);
        const text = parsed.content[0].text;
        const clean = text.replace(/```json|```/g, "").trim();
        const result = JSON.parse(clean);
        res.status(200).json(result);
      } catch (e) {
        res.status(500).json({ error: "Parse error", detail: e.message });
      }
    });
  });

  apiReq.on("error", (e) => {
    res.status(500).json({ error: e.message });
  });

  apiReq.write(body);
  apiReq.end();
});// updated 
