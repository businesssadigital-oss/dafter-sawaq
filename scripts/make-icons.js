// يولّد أيقونات PNG من icon.svg. يشتغل في GitHub Actions قبل النشر والبناء.
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const www = path.join(__dirname, "..", "www");
const svg = fs.readFileSync(path.join(www, "icon.svg"));

(async () => {
  for (const s of [192, 512]) {
    await sharp(svg, { density: 300 }).resize(s, s).png().toFile(path.join(www, `icon-${s}.png`));
  }
  console.log("icons done");
})();
