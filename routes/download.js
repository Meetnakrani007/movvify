const express = require("express");
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const router = express.Router();

router.post("/", (req, res) => {
  const { url, quality } = req.body;
  const filename = `movvify_${Date.now()}.mp4`;

  if (!url || (!url.includes("youtube.com") && !url.includes("youtu.be"))) {
    return res.status(400).send("<h3> Please enter a valid YouTube URL.</h3>");
  }
  const downloadsDir = path.join(process.cwd(), "downloads");
  if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir);
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
      : "bv*+ba/best";

  const safeUrl = url.trim();
  const command = `yt-dlp -f "${format}" --merge-output-format mp4 -o "${filepath}" "${safeUrl}"`;
  console.log(` Running yt-dlp for: ${url}`);
  console.log(`⚙️ Command: ${command}`);

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error("Error:", stderr);
      return res
        .status(500)
        .send("<h3>Download failed. Please check your link or try again.</h3>");
    }
    console.log("Download complete!");

    // Send the video file to the browser
    res.download(filepath, (err) => {
      if (err) {
        console.error("Download error:", err);
      }
      // Delete the file after sending
      setTimeout(() => {
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
          console.log("Temporary File cleaned up after download.", filepath);
        }
      }, 3000);
    });
  });
});
module.exports = router;
