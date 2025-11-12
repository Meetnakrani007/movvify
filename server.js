const express = require("express");
const path = require("path");
const indexRoute = require("./routes/index.js");
const youtubeRoute = require("./routes/youtube.js");
const spotifyRoute = require("./routes/spotify.js");
const downloadRoute = require("./routes/download.js");

const app = express();

//middleware

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

//setup ejs
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use("/", indexRoute);
app.use("/yt", youtubeRoute);
app.use("/spotify", spotifyRoute);
app.use("/download", downloadRoute);

const PORT = process.env.PORT || 6464;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
