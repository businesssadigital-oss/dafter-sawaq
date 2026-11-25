// Generate installable app icons from the Souhail Delivery brand mark.
const sharp = require("sharp");
const path = require("path");
const www = path.join(__dirname, "..", "www");
(async () => {
  for (const size of [192, 512]) {
    await sharp(path.join(www, "logo.svg"))
      .resize(size, size, { fit: "contain", background: "#ffffff" })
      .png().toFile(path.join(www, `icon-${size}.png`));
  }
  console.log("Souhail Delivery icons generated");
})();
