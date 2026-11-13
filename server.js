const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const SERPAPI_API_KEY = process.env.SERPAPI_API_KEY;

if (!GOOGLE_API_KEY) {
  throw new Error("GOOGLE_API_KEY ist nicht konfiguriert.");
}

// Millisekunden in eine lesbare Zeitangabe umwandeln.
function formatTimestamp(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// Video-ID aus verschiedenen YouTube-Linkformaten auslesen.
function extractVideoId(url) {
  try {
    const u = new URL(url);

    if (u.hostname === "youtube.com" || u.hostname.endsWith(".youtube.com")) {
      return u.searchParams.get("v");
    }

    if (u.hostname === "youtu.be" || u.hostname.endsWith(".youtu.be")) {
      return u.pathname.slice(1).split("/")[0];
    }

    return null;
  } catch {
    return null;
  }
}

// Kommentare abrufen.
async function getComments(videoId) {
  let allComments = [];
  let nextPageToken = "";

  try {
    do {
      const url = "https://www.googleapis.com/youtube/v3/commentThreads";
      const res = await axios.get(url, {
        params: {
          part: "snippet",
          videoId,
          maxResults: 100,
          pageToken: nextPageToken || undefined,
          key: GOOGLE_API_KEY
        }
      });

      const items = res.data.items || [];

      allComments.push(
        ...items.map(item => ({
          author: item.snippet.topLevelComment.snippet.authorDisplayName,
          text: item.snippet.topLevelComment.snippet.textDisplay
        }))
      );

      nextPageToken = res.data.nextPageToken;

      // Begrenzung auf maximal 200 Kommentare.
      if (allComments.length >= 200) break;

    } while (nextPageToken);

  } catch (e) {
    console.log("Kommentar Fehler:", e.message);
  }

  return allComments;
}

// Transkript inklusive Zeitstempeln von SerpApi abrufen.
async function getTranscript(videoId) {
  if (!SERPAPI_API_KEY) {
    console.error("SERPAPI_API_KEY ist nicht konfiguriert.");
    return [];
  }

  try {
    const res = await axios.get("https://serpapi.com/search", {
      params: {
        engine: "youtube_video_transcript",
        v: videoId,
        api_key: SERPAPI_API_KEY
      }
    });

    if (!Array.isArray(res.data?.transcript)) {
      return [];
    }

    return res.data.transcript
      .map(item => {
        const text = typeof item.snippet === "string" ? item.snippet.trim() : "";
        const hasStartMs = item.start_ms !== null && item.start_ms !== undefined && item.start_ms !== "";
        const parsedStartMs = hasStartMs ? Number(item.start_ms) : NaN;
        const startMs = Number.isFinite(parsedStartMs) ? parsedStartMs : null;
        const hasEndMs = item.end_ms !== null && item.end_ms !== undefined && item.end_ms !== "";
        const parsedEndMs = hasEndMs ? Number(item.end_ms) : NaN;
        const endMs = Number.isFinite(parsedEndMs) ? parsedEndMs : null;

        return {
          text,
          startMs,
          endMs,
          startTimeText:
            typeof item.start_time_text === "string" && item.start_time_text.trim()
              ? item.start_time_text.trim()
              : startMs !== null
                ? formatTimestamp(startMs)
                : ""
        };
      })
      .filter(item => item.text.length > 0);

  } catch (e) {
    console.log("SerpApi Fehler:", e.message);
    return [];
  }
}

// API für Frontend.
app.post("/api", async (req, res) => {
  const videoId = extractVideoId(req.body?.url);

  if (!videoId) {
    return res.status(400).json({ error: "Ungültige YouTube-URL." });
  }

  const [comments, transcript] = await Promise.all([
    getComments(videoId),
    getTranscript(videoId)
  ]);

  res.json({ comments, transcript, videoId });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`läuft auf Port ${PORT}`));
