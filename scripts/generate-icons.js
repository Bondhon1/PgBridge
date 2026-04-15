const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pngToIco = require('png-to-ico').default;

async function main() {
  const rootDir = path.join(__dirname, '..');
  const sourceSvg = path.join(rootDir, 'Untitled design.svg');
  const assetsDir = path.join(rootDir, 'assets');
  const pngPath = path.join(assetsDir, 'icon.png');
  const icoPath = path.join(assetsDir, 'icon.ico');

  if (!fs.existsSync(sourceSvg)) {
    throw new Error(`Missing source SVG: ${sourceSvg}`);
  }

  fs.mkdirSync(assetsDir, { recursive: true });

  const svgBuffer = fs.readFileSync(sourceSvg);

  await sharp(svgBuffer)
    .resize(512, 512, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toFile(pngPath);

  const icoBuffer = await pngToIco(pngPath);
  fs.writeFileSync(icoPath, icoBuffer);

  console.log(`Created ${pngPath}`);
  console.log(`Created ${icoPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});