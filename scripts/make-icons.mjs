import sharp from "sharp";

const SOURCE = "public/icons/icon-source.svg";

const targets = [
  { path: "public/icons/icon-192.png", size: 192 },
  { path: "public/icons/icon-512.png", size: 512 },
  { path: "public/icons/apple-touch-icon.png", size: 180 },
];

await Promise.all(
  targets.map(({ path, size }) =>
    sharp(SOURCE, { density: 1024 })
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(path)
  )
);
