// Cắt ảnh trong art-src thành ảnh cho game (public/chibi). Chạy trong thư mục doan-tu: node scripts/cat-anh-chibi.cjs
// Cần Edge và playwright-core (D:/tiktok-cache/dev-tools). Xử lý bằng canvas trong Edge ẩn, theo scripts/cat-anh-chibi.page.js.
const { chromium } = require('D:/tiktok-cache/dev-tools/node_modules/playwright-core');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.resolve(__dirname, '..');
  const script = path.join(__dirname, 'cat-anh-chibi.page.js');
  // thay-giam-thi.png không bắt buộc: chưa có thì game vẽ tạm thầy giám thị bằng SVG.
  const images = ['hoc-sinh.png', 'co-giao.png', 'lop-hoc.png', 'thay-giam-thi.png'].map((f) => path.join(root, 'art-src', f)).filter((f, i) => i < 3 || fs.existsSync(f));
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const page = await browser.newPage();
  page.on('console', (m) => console.log('[page]', m.text()));
  await page.setContent('<html><body></body></html>');
  const data = images.map((f) => ({ name: path.basename(f), url: `data:image/png;base64,${fs.readFileSync(f).toString('base64')}` }));
  const code = fs.readFileSync(script, 'utf8');
  const out = await page.evaluate(async ({ code, data }) => {
    const load = (d) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = d.url; });
    const imgs = {};
    for (const d of data) imgs[d.name] = await load(d);
    const fn = new Function('imgs', `${code}\nreturn main(imgs);`);
    return fn(imgs);
  }, { code, data });
  if (out.json !== undefined) console.log(JSON.stringify(out.json, null, 1));
  for (const [name, url] of Object.entries(out.files ?? {})) {
    fs.mkdirSync(path.dirname(name), { recursive: true });
    fs.writeFileSync(name, Buffer.from(url.split(',')[1], 'base64'));
    console.log('wrote', name);
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
