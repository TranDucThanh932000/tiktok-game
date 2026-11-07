const MP3_RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
const MP3_KBPS_V1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const MP3_KBPS_V2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];

export function mp3Seconds(buf) {
  let at = 0;
  if (buf.length > 10 && buf.toString('latin1', 0, 3) === 'ID3') {
    at = 10 + (((buf[6] & 127) << 21) | ((buf[7] & 127) << 14) | ((buf[8] & 127) << 7) | (buf[9] & 127));
  }
  while (at < buf.length - 4 && !(buf[at] === 0xff && (buf[at + 1] & 0xe0) === 0xe0)) at++;
  let seconds = 0;
  while (at < buf.length - 4 && buf[at] === 0xff && (buf[at + 1] & 0xe0) === 0xe0) {
    const version = (buf[at + 1] >> 3) & 3;
    const rate = MP3_RATES[version]?.[(buf[at + 2] >> 2) & 3];
    const kbps = (version === 3 ? MP3_KBPS_V1 : MP3_KBPS_V2)[buf[at + 2] >> 4];
    if (!rate || !kbps) break;
    const samples = version === 3 ? 1152 : 576;
    seconds += samples / rate;
    at += Math.floor((samples / 8) * ((kbps * 1000) / rate)) + ((buf[at + 2] >> 1) & 1);
  }
  return seconds;
}
