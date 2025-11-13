const express = require("express");
const { spawn } = require("child_process");
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

// Helper to build format selector with graceful fallbacks
function buildFormatSelector(quality) {
  if (!quality || quality === "best") {
    return "bestvideo*+bestaudio/best";
  }

  const qInt = parseInt(quality, 10);
  if (Number.isNaN(qInt)) {
    return "bestvideo*+bestaudio/best";
  }

  return [
    `bv*[height=${qInt}]+ba`,
    `bv*[height<=${qInt}]+ba`,
    `bestvideo[height<=${qInt}]+bestaudio`,
    "bestvideo*+bestaudio",
    "best",
  ].join("/");
}

// Helper to run yt-dlp safely using spawn
function runYtDlp(args, options = {}) {
  return new Promise((resolve, reject) => {
    const yt = spawn("yt-dlp", args, {
      shell: false,
      ...options,
    });

    let stdout = "";
    let stderr = "";

    yt.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    yt.stderr.on("data", (data) => {
      const text = data.toString();
      stderr += text;
      console.error(text.trim());
    });

    yt.on("error", (err) => {
      err.stdout = stdout;
      err.stderr = stderr;
      reject(err);
    });

    yt.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const error = new Error(
          `yt-dlp exited with code ${code}${stderr ? `: ${stderr}` : ""}`
        );
        error.code = code;
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      }
    });
  });
}

function sanitizeTitleForFilename(title) {
  if (!title || typeof title !== "string") return "video";
  let sanitized = title
    .normalize("NFKD")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!sanitized) sanitized = "video";

  // Limit length to avoid extremely long filenames
  if (sanitized.length > 80) {
    sanitized = sanitized.slice(0, 80).trim();
  }

  return sanitized;
}

function ensureUniqueFilepath(filepath) {
  if (!fs.existsSync(filepath)) return filepath;

  const dir = path.dirname(filepath);
  const ext = path.extname(filepath);
  const base = path.basename(filepath, ext);

  let counter = 1;
  let candidate = path.join(dir, `${base} (${counter})${ext}`);

  while (fs.existsSync(candidate)) {
    counter += 1;
    candidate = path.join(dir, `${base} (${counter})${ext}`);
  }

  return candidate;
}

async function fetchVideoTitle(url) {
  try {
    const args = [
      ...getCookieArgs(),
      ...getAntiDetectionArgs(),
      "--no-playlist",
      "--skip-download",
      "--print",
      "title",
      url,
    ];

    const { stdout } = await runYtDlp(args, { timeout: 20000 });
    const lines = stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    return lines.pop() || null;
  } catch (error) {
    console.error("Title fetch error:", error.stderr || error.message);
    return null;
  }
}

async function prepareDownloadPath(url, providedTitle) {
  const title = providedTitle || (await fetchVideoTitle(url)) || "video";
  const sanitized = sanitizeTitleForFilename(title);
  const baseFilename = `movvify_${sanitized}.mp4`;
  const desiredPath = path.join(downloadsDir, baseFilename);
  const filepath = ensureUniqueFilepath(desiredPath);

  return {
    filepath,
    filename: path.basename(filepath),
  };
}

router.post("/", async (req, res) => {
  const { url, quality } = req.body;

  if (!url || (!url.includes("youtube.com") && !url.includes("youtu.be"))) {
    return res.status(400).send("<h3>Please enter a valid YouTube URL.</h3>");
  }

  const safeUrl = url.trim();

  let downloadInfo;
  try {
    downloadInfo = await prepareDownloadPath(safeUrl, req.body?.title);
  } catch (error) {
    console.error("Failed to resolve filename:", error);
    const fallbackName = `movvify_video_${Date.now()}.mp4`;
    const fallbackPath = ensureUniqueFilepath(
      path.join(downloadsDir, fallbackName)
    );
    downloadInfo = {
      filepath: fallbackPath,
      filename: path.basename(fallbackPath),
    };
  }

  const { filepath, filename } = downloadInfo;

  const format = buildFormatSelector(quality);

  const args = [
    ...getCookieArgs(),
    ...getAntiDetectionArgs(),
    "--no-check-certificate",
    "-f",
    format,
    "--merge-output-format",
    "mp4",
    "-o",
    filepath,
    safeUrl,
  ];

  console.log(`Starting download for single video: ${safeUrl}`);

  try {
    await runYtDlp(args, { timeout: 300000 });
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
  } catch (error) {
    const stderr = error.stderr || "";
    console.error("Download error:", stderr || error.message);

    if (isBotDetectionError(stderr)) {
      return res
        .status(429)
        .send(
          "<h3>YouTube rate limit detected. Please wait a few minutes and try again, or update your cookies file.</h3>"
        );
    }

    res
      .status(500)
      .send("<h3>Download failed. Please check your link or try again.</h3>");

    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }
  }
});

router.post("/playlist-info", (req, res) => {
  const { url } = req.body;
  if (!url || !url.includes("list=")) {
    return res
      .status(400)
      .json({ ok: false, message: "Please enter a valid playlist URL." });
  }

  console.log(`Fetching playlist info for: ${url}`);

  const args = [
    ...getCookieArgs(),
    ...getAntiDetectionArgs(),
    "--flat-playlist",
    "-J",
    url,
  ];

  runYtDlp(args, { timeout: 60000 })
    .then(({ stdout }) => {
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
    })
    .catch((error) => {
      console.error("Playlist fetch error:", error.stderr || error.message);
      res
        .status(500)
        .json({ ok: false, message: "Failed to fetch playlist info." });
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

router.get("/download-video", async (req, res) => {
  const videoUrl = req.query.url;
  const quality = req.query.quality || "best";

  if (!videoUrl) return res.status(400).send("Missing video URL.");

  const safeUrl = videoUrl.trim();

  let downloadInfo;
  try {
    downloadInfo = await prepareDownloadPath(safeUrl, req.query?.title);
  } catch (error) {
    console.error("Failed to resolve filename:", error);
    const fallbackName = `movvify_video_${Date.now()}.mp4`;
    const fallbackPath = ensureUniqueFilepath(
      path.join(downloadsDir, fallbackName)
    );
    downloadInfo = {
      filepath: fallbackPath,
      filename: path.basename(fallbackPath),
    };
  }

  const { filepath, filename } = downloadInfo;

  const format = buildFormatSelector(quality);

  const args = [
    ...getCookieArgs(),
    ...getAntiDetectionArgs(),
    "--no-check-certificate",
    "-f",
    format,
    "--merge-output-format",
    "mp4",
    "-o",
    filepath,
    safeUrl,
  ];

  console.log(`Starting download for: ${safeUrl}`);

  try {
    await runYtDlp(args, { timeout: 300000 });
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
  } catch (error) {
    const stderr = error.stderr || "";
    console.error("Error downloading video:", stderr || error.message);

    if (isBotDetectionError(stderr)) {
      return res
        .status(429)
        .send("YouTube rate limit detected. Please wait a few minutes and try again.");
    }

    res.status(500).send("Download failed.");

    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }
  }
});

router.get("/progress", async (req, res) => {
  const { url, quality } = req.query;
  if (!url) return res.status(400).end();

  const safeUrl = url.trim();
  const format = buildFormatSelector(quality);

  const cookiesArg = getCookieArgs();
  const antiDetectionArgs = getAntiDetectionArgs();

  let downloadInfo;
  try {
    downloadInfo = await prepareDownloadPath(safeUrl, req.query?.title);
  } catch (error) {
    console.error("Failed to resolve filename:", error);
    const fallbackName = `movvify_video_${Date.now()}.mp4`;
    const fallbackPath = ensureUniqueFilepath(
      path.join(downloadsDir, fallbackName)
    );
    downloadInfo = {
      filepath: fallbackPath,
      filename: path.basename(fallbackPath),
    };
  }

  const { filepath, filename } = downloadInfo;

  const args = [
    "--newline",
    "-f",
    format,
    "--no-playlist",
    "--no-check-certificate",
    "--merge-output-format",
    "mp4",
    "-o",
    filepath,
    safeUrl,
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
