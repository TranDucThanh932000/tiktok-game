const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');

const TITLES = {
  'san-khau-co-duyen-game': 'San Khau Co Duyen - server - dong cua so nay de tat game',
  'co-duyen-characters': 'Co Duyen nhan vat - server - dong cua so nay de tat',
};
const shell = () => process.env.ComSpec || 'cmd.exe';

async function probe(url, expected, version) {
  let response;
  try { response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(1800) }); }
  catch (error) {
    if (error.cause?.code === 'ECONNREFUSED') return false;
    throw new Error(`Khong kiem tra duoc cong: ${error.message}`);
  }
  let health;
  try { health = await response.json(); }
  catch { throw new Error('Cong dang duoc ung dung khac su dung, khong tu dong dung tien trinh do.'); }
  if (!response.ok || (health.app ?? health.preview) !== expected || (version && health.version !== version)) {
    throw new Error('Cong dang chay ung dung/ban server khac. Dong dung cua so server cu hoac doi PORT, khong can tat cac chuong trinh khac.');
  }
  return true;
}

function cmdSafe(value, label) {
  if (/["%^&|<>!\r\n]/u.test(value)) throw new Error(`${label} co ky tu dac biet (${value}). Hay chuyen sang duong dan don gian hon.`);
  return value;
}

// An empty argument becomes "" (the start title); a literal '""' would reach cmd as "\"\"" and break start.
function openUrl(url) {
  const result = spawnSync(shell(), ['/d', '/c', 'start', '', url], { windowsHide: true, stdio: 'ignore' });
  if (result.error || result.status !== 0) {
    console.error(`Khong mo duoc trinh duyet. Hay mo thu cong: ${url}`);
    process.exitCode = 1;
  }
}

// Visible console like the other games: logs and errors stay on screen, closing it stops the server.
function startServerWindow(root, title, env) {
  const node = cmdSafe(process.execPath, 'Duong dan Node');
  const command = `start "${title}" /D "${cmdSafe(root, 'Duong dan game')}" "${cmdSafe(shell(), 'ComSpec')}" /d /k ""${node}" --env-file-if-exists=.env server.js"`;
  const result = spawnSync(shell(), ['/d', '/s', '/c', `"${command}"`], { windowsHide: true, windowsVerbatimArguments: true, stdio: 'ignore', env });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Khong mo duoc cua so server.');
}

async function main() {
  const root = path.resolve(process.argv[2]);
  const expected = process.argv[3];
  const defaultPort = Number(process.argv[4]);
  const version = Number(process.argv[5]) || undefined;
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || major === 22 && minor < 9) throw new Error('Can Node.js 22.9+; hay chay bang Node cua Laragon.');
  const envFile = path.join(root, '.env');
  if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
  const port = Number(process.env.PORT ?? defaultPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT khong hop le.');
  const url = `http://127.0.0.1:${port}`;
  if (await probe(url, expected, version)) {
    console.log(`Server da chay. Mo lai ${url}`);
  } else {
    const packageFile = path.join(root, 'package.json');
    const manifest = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
    const requireFromProject = createRequire(packageFile);
    let missing = false;
    for (const dependency of Object.keys(manifest.dependencies ?? {})) {
      try { requireFromProject.resolve(dependency); }
      catch (error) { if (error.code === 'MODULE_NOT_FOUND') missing = true; else throw error; }
    }
    if (missing) {
      const npm = path.join(path.dirname(process.execPath), 'npm.cmd');
      console.log('Dang cai thu vien con thieu...');
      const install = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/c', `"${npm}" install --no-audit --no-fund`], { cwd: root, stdio: 'inherit' });
      if (install.error) throw install.error;
      if (install.status !== 0) throw new Error('Cai thu vien that bai. Xem loi npm o tren.');
    }
    startServerWindow(root, TITLES[expected] ?? `${expected} - server`, {
      ...process.env, PORT: String(port), PATH: `${path.dirname(process.execPath)};${process.env.PATH ?? ''}`,
    });
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 300));
      if (await probe(url, expected, version)) { ready = true; break; }
    }
    if (!ready) throw new Error('Server chua san sang. Xem loi trong cua so server vua mo.');
    console.log(`Da mo cua so server: ${url}`);
  }
  if (process.env.CO_DUYEN_NO_BROWSER !== '1') {
    openUrl(`${url}/`);
    if (expected === 'san-khau-co-duyen-game') openUrl(`${url}/panel.html`);
  }
}

module.exports = { probe };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
