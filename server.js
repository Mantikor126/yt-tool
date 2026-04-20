const express = require("express");
const axios = require("axios");
const cors = require("cors");
const { exec } = require("child_process");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const API_KEY = "AIzaSyCbSr5NyKYiuenW6fJbGW3v3VV4mIxmm48";

// Video-ID
function extractVideoId(url) {
  try {
    const u = new URL(url);

    // normaler YouTube Link
    if (u.hostname.includes("youtube.com")) {
      return u.searchParams.get("v");
    }

    // short link (youtu.be)
    if (u.hostname.includes("youtu.be")) {
      return u.pathname.slice(1);
    }

    return null;
  } catch {
    return null;
  }
}

// Kommentare
async function getComments(videoId) {
  const url = `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&maxResults=20&key=${API_KEY}`;
  const res = await axios.get(url);

  return res.data.items.map(item => ({
    author: item.snippet.topLevelComment.snippet.authorDisplayName,
    text: item.snippet.topLevelComment.snippet.textDisplay
  }));
}

// Transkript (SERPAPI)
async function getTranscript(videoId) {
  try {
    const res = await axios.get(
      `https://serpapi.com/search?engine=youtube_video_transcript&v=${videoId}&api_key=598fc85481e544e7f7fa06e51de56588881ba981b44ba7378389dcbaf522f2ea`
    );

    if (!res.data || !res.data.transcript) {
      return "Kein Transkript verfügbar";
    }

    const cleaned = res.data.transcript
      .map(t => t.snippet?.trim())
      .filter(t => t && t.length > 0);

    return cleaned.join(" ");

  } catch (e) {
    console.log("SerpApi Fehler:", e.message);
    return "Kein Transkript verfügbar";
  }
}

// API
app.post("/api", async (req, res) => {
   const videoId = extractVideoId(req.body.url);
  if (!videoId) return res.send("Ungültige URL");

  const comments = await getComments(videoId);
  const transcript = await getTranscript(videoId);

  res.json({ comments, transcript });
});

app.listen(3000, () => console.log("läuft auf http://localhost:3000"));