// Draws public/tip-qr.svg: a QR code for the X Money pay link in the tip card (scripts/tip.js), so the card never
// depends on a third-party QR service. Manual step like scripts/og.js; the Vercel build only links the committed file.
// Needs the qrcode package outside the repo:
//   NODE_PATH=/workspace/bot-hub-test/node_modules node scripts/tip-qr.js
const fs = require("fs"), path = require("path");
const QR = require("qrcode");
const { TIP_URL } = require("./tip");
QR.toString(TIP_URL, { type: "svg", errorCorrectionLevel: "M", margin: 2, color: { dark: "#000000", light: "#ffffff" } }).then((svg) => {
  fs.writeFileSync(path.join(__dirname, "..", "public", "tip-qr.svg"), svg.replace("<svg ", '<svg role="img" aria-label="QR code for ' + TIP_URL + '" ') + "\n");
  console.log("wrote public/tip-qr.svg for " + TIP_URL);
});
