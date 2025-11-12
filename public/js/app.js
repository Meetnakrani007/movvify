document.addEventListener("DOMContentLoaded", () => {
  const urlInput = document.getElementById("urlInput");
  const preview = document.getElementById("thumbnailPreview");
  const playlistArea = document.getElementById("playlistArea");
  const playlistTitle = document.getElementById("playlistTitle");
  const playlistCount = document.getElementById("playlistCount");
  const playlistItems = document.getElementById("playlistItems");
  const downloadAllBtn = document.getElementById("downloadAllBtn");
  const overallProgress = document.getElementById("overallProgress");
  const progressArea = document.getElementById("progressArea");
  const progressText = document.getElementById("progressText");
  const progressFill = document.getElementById("progressFill");
  const form = document.querySelector(".panel");

  urlInput.addEventListener("input", async () => {
    const url = urlInput.value.trim();
    preview.innerHTML = "";
    playlistArea.style.display = "none";
    playlistItems.innerHTML = "";
    overallProgress.innerText = "";

    if (url.includes("list=")) {
      playlistArea.style.display = "block";
      playlistTitle.innerText = "Fetching playlist info...";

      try {
        const res = await fetch("/download/playlist-info", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        const data = await res.json();

        if (data.ok) {
          playlistTitle.innerText = data.playlist_title || "Playlist";
          playlistCount.innerText = `Total videos: ${data.items.length}`;
          playlistItems.innerHTML = data.items
            .map(
              (v, i) => `
                <div class="playlist-item">
                  <span>${i + 1}. ${v.title}</span>
                </div>`
            )
            .join("");

          downloadAllBtn.onclick = () => downloadSequential(data.items);
        } else {
          playlistTitle.innerText = "Failed to load playlist.";
        }
      } catch (err) {
        playlistTitle.innerText = "Error loading playlist.";
      }
      return;
    }

    const videoId = extractYouTubeID(url);
    if (videoId) {
      const thumbURL = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
      preview.innerHTML = `<img src="${thumbURL}" alt="Thumbnail" class="thumbnail-img" />`;
    }
  });

  function extractYouTubeID(url) {
    const regex =
      /(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
  }

  async function downloadSequential(items) {
    const quality = document.querySelector("select[name='quality']").value;
    overallProgress.innerText = `Starting playlist downloads...`;
    progressArea.style.display = "block";
    progressFill.style.width = "0%";

    for (let i = 0; i < items.length; i++) {
      const v = items[i];
      const percent = Math.round(((i + 1) / items.length) * 100);
      showProgress(i + 1, items.length, percent);

      try {
        progressText.innerText = `Downloading ${i + 1} / ${items.length}...`;

        // Send request to backend for each video
        const response = await fetch("/download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: v.url, quality }),
        });

        if (!response.ok) throw new Error("Download failed for " + v.title);

        // Convert response to blob
        const blob = await response.blob();
        const fileURL = window.URL.createObjectURL(blob);

        // Trigger download automatically
        const a = document.createElement("a");
        a.href = fileURL;
        a.download = `${v.title.replace(/[^\w\s]/gi, "_")}.mp4`;
        document.body.appendChild(a);
        a.click();
        a.remove();

        // Wait a bit before next video
        await waitFor(1500);
      } catch (err) {
        console.error("Error downloading video:", v.title, err);
        progressText.innerText = `❌ Failed: ${v.title}`;
        await waitFor(1000);
      }
    }

    progressFill.style.width = "100%";
    progressText.innerText = "✅ Playlist download complete!";
    setTimeout(() => resetProgress(), 4000);
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const url = urlInput.value.trim();
    const quality = document.querySelector("select[name='quality']").value;
    if (!url) return alert("Please enter a valid YouTube link!");

    // Check if it's a playlist
    if (url.includes("list=")) {
      alert("Please use the 'Download All' button for playlists.");
      return;
    }

    progressArea.style.display = "block";
    progressText.innerText = "Starting...";
    progressFill.style.width = "0%";

    const evtSrc = new EventSource(
      "/download/progress?" + new URLSearchParams({ url, quality })
    );

    let downloadFilename = null;

    evtSrc.onmessage = (e) => {
      const data = e.data;
      
      if (data.startsWith("done:")) {
        // Download complete, trigger file download
        downloadFilename = data.split(":")[1];
        progressText.innerText = "Download complete! Preparing file...";
        progressFill.style.width = "100%";
        
        setTimeout(() => {
          evtSrc.close();
          // Serve the already-downloaded file
          const downloadUrl = `/download/file/${downloadFilename}`;
          window.location.href = downloadUrl;
          setTimeout(() => {
            progressArea.style.display = "none";
          }, 1000);
        }, 500);
        return;
      }
      
      if (data === "error") {
        progressText.innerText = "Download failed. Please try again.";
        evtSrc.close();
        setTimeout(() => {
          progressArea.style.display = "none";
        }, 3000);
        return;
      }
      
      const percent = parseFloat(data);
      if (!isNaN(percent)) {
        progressFill.style.width = percent + "%";
        progressText.innerText = `Downloading... ${percent.toFixed(1)}%`;
      }
    };

    evtSrc.onerror = () => {
      evtSrc.close();
      // Fallback: trigger download directly if progress fails
      progressText.innerText = "Starting download...";
      const downloadUrl = `/download/download-video?url=${encodeURIComponent(url)}&quality=${encodeURIComponent(quality)}`;
      window.location.href = downloadUrl;
    };
  });

  function waitFor(ms) {
    return new Promise((res) => setTimeout(res, ms));
  }

  function showProgress(current, total, percent) {
    progressArea.style.display = "block";
    const calculatedPercent = percent !== undefined ? percent : Math.round((current / total) * 100);
    progressFill.style.width = `${calculatedPercent}%`;
    progressText.innerText = `Downloading ${current} / ${total} (${calculatedPercent}%)`;
  }

  function resetProgress() {
    progressFill.style.width = "0%";
    progressArea.style.display = "none";
  }
});
