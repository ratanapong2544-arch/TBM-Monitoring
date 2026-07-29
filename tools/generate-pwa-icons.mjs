import sharp from "sharp";
import fs from "node:fs/promises";

await fs.mkdir("public/icons", { recursive: true });
const source = "public/favicon.svg";
for (const size of [180, 192, 512]) {
  await sharp(source)
    .resize(size, size, { fit: "contain", background: "#0C2C65" })
    .png()
    .toFile(`public/icons/icon-${size}.png`);
}
await sharp(source)
  .resize(320, 320, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .extend({ top: 96, bottom: 96, left: 96, right: 96, background: "#0C2C65" })
  .png()
  .toFile("public/icons/icon-maskable-512.png");
