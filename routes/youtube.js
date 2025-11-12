const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
  res.render("youtube.ejs");
});
router.post("/download", (req, res) => {
  return res.status(501).send("download");
});
module.exports = router;
