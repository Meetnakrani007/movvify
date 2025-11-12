const express = require("express");
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");

const router = express.Router();
const downloadsDir = path.join(process.cwd(), "downloads");
const cookiesPath = path.join(process.cwd(), "cookies.txt");

if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir);

router.post("/", (req, res) => {
  const { url, quality } = req.body;

  if (!url || (!url.includes("youtube.com") && !url.includes("youtu.be"))) {
    return res.status(400).send("<h3>Please enter a valid YouTube URL.</h3>");
  }

  const timestamp = Date.now();
  const filename = `movvify_${timestamp}.mp4`;
  const filepath = path.join(downloadsDir, filename);

  const format =
    quality === "144"
      ? "bv*[height=144]+ba"
      : quality === "240"
      ? "bv*[height=240]+ba"
      : quality === "360"
      ? "bv*[height=360]+ba"
      : quality === "480"
      ? "bv*[height=480]+ba"
      : quality === "720"
      ? "bv*[height=720]+ba"
      : quality === "1080"
      ? "bv*[height=1080]+ba"
      : quality === "1440"
      ? "bv*[height=1440]+ba"
      : quality === "2160"
      ? "bv*[height=2160]+ba"
      : "bv*+ba/best";

  const safeUrl = url.trim();

  const cookiesArg = fs.existsSync(cookiesPath)
    ? `--cookies "${cookiesPath}"`
    : "";
  const command = `yt-dlp --cookies-from-browser chrome --no-check-certificate -f "${format}" --merge-output-format mp4 -o "${filepath}" "${safeUrl}"`;

  console.log(`Starting download for single video: ${safeUrl}`);
  console.log(`Command: ${command}`);

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error("Download error:", stderr);
      return res
        .status(500)
        .send("<h3>Download failed. Please check your link or try again.</h3>");
    }

    console.log("Single video download complete:", filename);

    res.download(filepath, filename, (err) => {
      if (err) console.error("Download stream error:", err);
      setTimeout(() => {
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
          console.log("Cleaned up file:", filename);
        }
      }, 3000);
    });
  });
});

router.post("/playlist-info", (req, res) => {
  const { url } = req.body;
  if (!url || !url.includes("list=")) {
    return res
      .status(400)
      .json({ ok: false, message: "Please enter a valid playlist URL." });
  }

  console.log(`Fetching playlist info for: ${url}`);

  const cookiesArg = fs.existsSync(cookiesPath)
    ? `--cookies "${cookiesPath}"`
    : "";
  const command = `yt-dlp ${cookiesArg} --flat-playlist -J "${url}"`;

  exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
    if (error) {
      console.error("Playlist fetch error:", stderr);
      return res
        .status(500)
        .json({ ok: false, message: "Failed to fetch playlist info." });
    }

    try {
      const json = JSON.parse(stdout);
      const items = (json.entries || []).map((e) => ({
        id: e.id,
        title: e.title || "Untitled Video",
        url: `https://www.youtube.com/watch?v=${e.id}`,
      }));

      res.json({
        ok: true,
        playlist_title: json.title || "YouTube Playlist",
        items,
      });
    } catch (err) {
      console.error("JSON parse error:", err);
      res
        .status(500)
        .json({ ok: false, message: "Error parsing playlist data." });
    }
  });
});

router.get("/download-video", (req, res) => {
  const videoUrl = req.query.url;
  const quality = req.query.quality || "best";

  if (!videoUrl) return res.status(400).send("Missing video URL.");

  const timestamp = Date.now();
  const filename = `movvify_${timestamp}.mp4`;
  const filepath = path.join(downloadsDir, filename);

  const format =
    quality === "144"
      ? "bv*[height=144]+ba"
      : quality === "240"
      ? "bv*[height=240]+ba"
      : quality === "360"
      ? "bv*[height=360]+ba"
      : quality === "480"
      ? "bv*[height=480]+ba"
      : quality === "720"
      ? "bv*[height=720]+ba"
      : quality === "1080"
      ? "bv*[height=1080]+ba"
      : quality === "1440"
      ? "bv*[height=1440]+ba"
      : quality === "2160"
      ? "bv*[height=2160]+ba"
      : "bv*+ba/best";

  const safeUrl = videoUrl.trim();
  const cookiesArg = fs.existsSync(cookiesPath)
    ? `--cookies "${cookiesPath}"`
    : "";
  const command = `yt-dlp ${cookiesArg} -f "${format}" --merge-output-format mp4 -o "${filepath}" "${safeUrl}"`;

  console.log(`Starting download for: ${safeUrl}`);
  console.log(`Command: ${command}`);

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error("Error downloading video:", stderr);
      return res.status(500).send("Download failed.");
    }

    console.log("Video download complete:", filename);

    res.download(filepath, filename, (err) => {
      if (err) console.error("Download error:", err);
      setTimeout(() => {
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
          console.log("Cleaned up:", filename);
        }
      }, 3000);
    });
  });
});

const { spawn } = require("child_process");

router.get("/progress", (req, res) => {
  const { url, quality } = req.query;
  if (!url) return res.status(400).end();

  const format =
    quality === "144"
      ? "bv*[height=144]+ba"
      : quality === "240"
      ? "bv*[height=240]+ba"
      : quality === "360"
      ? "bv*[height=360]+ba"
      : quality === "480"
      ? "bv*[height=480]+ba"
      : quality === "720"
      ? "bv*[height=720]+ba"
      : quality === "1080"
      ? "bv*[height=1080]+ba"
      : quality === "1440"
      ? "bv*[height=1440]+ba"
      : quality === "2160"
      ? "bv*[height=2160]+ba"
      : "bv*+ba/best";

  const cookiesArg = fs.existsSync(cookiesPath)
    ? [`--cookies`, cookiesPath]
    : [];

  const args = [
    "--newline",
    "-f",
    format,
    "--no-playlist",
    "-o",
    "-",
    url,
    ...cookiesArg,
  ];

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const yt = spawn("yt-dlp", args);

  yt.stdout.on("data", (data) => {
    const text = data.toString();
    const match = text.match(/\[download\]\s+(\d+\.\d+)%/);
    if (match) {
      res.write(`data: ${match[1]}\n\n`);
    }
  });

  yt.on("close", () => {
    res.write("data: 100\n\n");
    res.end();
  });

  yt.stderr.on("data", (err) => {
    console.error(err.toString());
  });
});

module.exports = router;
