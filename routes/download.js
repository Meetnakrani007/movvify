const express = require("express");
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");

const router = express.Router();
const downloadsDir = path.join(process.cwd(), "downloads");
const cookiesPath = path.join(process.cwd(), "cookies.txt");

if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir);

// Helper function to get cookie arguments with fallback
function getCookieArgs() {
  if (fs.existsSync(cookiesPath)) {
    // Check if cookies file is valid (not empty and recent)
    const stats = fs.statSync(cookiesPath);
    const fileSize = stats.size;
    const ageInHours = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60);
    
    // If cookies file exists, is not empty, and is less than 7 days old, use it
    if (fileSize > 100 && ageInHours < 168) {
      return [`--cookies`, cookiesPath];
    }
  }
  // Fallback to browser cookies
  return ["--cookies-from-browser", "chrome"];
}

// Helper function to get cookie args as string (for exec commands)
function getCookieArgsString() {
  if (fs.existsSync(cookiesPath)) {
    const stats = fs.statSync(cookiesPath);
    const fileSize = stats.size;
    const ageInHours = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60);
    
    if (fileSize > 100 && ageInHours < 168) {
      return `--cookies "${cookiesPath}"`;
    }
  }
  return "--cookies-from-browser chrome";
}

// Helper function to detect bot detection errors
function isBotDetectionError(stderr) {
  if (!stderr) return false;
  const errorLower = stderr.toLowerCase();
  return (
    errorLower.includes("sign in to confirm") ||
    errorLower.includes("not a bot") ||
    errorLower.includes("bot detection") ||
    errorLower.includes("please sign in")
  );
}

// Helper function to add additional yt-dlp options to avoid detection
function getAntiDetectionArgs() {
  return [
    "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "--extractor-args", "youtube:player_client=web",
    "--throttled-rate", "1M",
  ];
}

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

  const cookiesArg = getCookieArgsString();
  const antiDetectionArgs = getAntiDetectionArgs().join(" ");
  const command = `yt-dlp ${cookiesArg} ${antiDetectionArgs} --no-check-certificate -f "${format}" --merge-output-format mp4 -o "${filepath}" "${safeUrl}"`;

  console.log(`Starting download for single video: ${safeUrl}`);

  exec(command, { timeout: 300000 }, (error, stdout, stderr) => {
    if (error) {
      console.error("Download error:", stderr);
      
      if (isBotDetectionError(stderr)) {
        return res
          .status(429)
          .send("<h3>YouTube rate limit detected. Please wait a few minutes and try again, or update your cookies file.</h3>");
      }
      
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

  const cookiesArg = getCookieArgsString();
  const antiDetectionArgs = getAntiDetectionArgs().join(" ");
  const command = `yt-dlp ${cookiesArg} ${antiDetectionArgs} --flat-playlist -J "${url}"`;

  exec(command, { maxBuffer: 1024 * 1024 * 10, timeout: 60000 }, (error, stdout, stderr) => {
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

router.get("/file/:filename", (req, res) => {
  const filename = req.params.filename;
  const filepath = path.join(downloadsDir, filename);
  
  if (!fs.existsSync(filepath)) {
    return res.status(404).send("File not found.");
  }
  
  res.download(filepath, filename, (err) => {
    if (err) console.error("Download error:", err);
    setTimeout(() => {
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
        console.log("Cleaned up file:", filename);
      }
    }, 3000);
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
  const cookiesArg = getCookieArgsString();
  const antiDetectionArgs = getAntiDetectionArgs().join(" ");
  const command = `yt-dlp ${cookiesArg} ${antiDetectionArgs} -f "${format}" --merge-output-format mp4 -o "${filepath}" "${safeUrl}"`;

  console.log(`Starting download for: ${safeUrl}`);

  exec(command, { timeout: 300000 }, (error, stdout, stderr) => {
    if (error) {
      console.error("Error downloading video:", stderr);
      
      if (isBotDetectionError(stderr)) {
        return res.status(429).send("YouTube rate limit detected. Please wait a few minutes and try again.");
      }
      
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

  const cookiesArg = getCookieArgs();
  const antiDetectionArgs = getAntiDetectionArgs();

  const timestamp = Date.now();
  const filename = `movvify_${timestamp}.mp4`;
  const filepath = path.join(downloadsDir, filename);

  const args = [
    "--newline",
    "-f",
    format,
    "--no-playlist",
    "--merge-output-format",
    "mp4",
    "-o",
    filepath,
    url,
    ...cookiesArg,
    ...antiDetectionArgs,
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

  yt.on("close", (code) => {
    if (code === 0) {
      res.write(`data: 100\n\n`);
      res.write(`data: done:${filename}\n\n`);
    } else {
      res.write(`data: error\n\n`);
    }
    res.end();
  });

  yt.stderr.on("data", (err) => {
    const text = err.toString();
    console.error(text);
    
    // Check for bot detection errors
    if (isBotDetectionError(text)) {
      res.write(`data: error:rate_limit\n\n`);
      res.end();
      return;
    }
    
    // Also check stderr for progress (yt-dlp sometimes outputs progress to stderr)
    const match = text.match(/\[download\]\s+(\d+\.\d+)%/);
    if (match) {
      res.write(`data: ${match[1]}\n\n`);
    }
  });
});

module.exports = router;
