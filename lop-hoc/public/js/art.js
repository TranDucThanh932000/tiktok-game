// Hình vẽ bằng SVG, không dùng file ảnh: học sinh nhìn từ sau lưng và cô giáo áo dài.
const SKIN = ['#f1c8a2', '#e8b78f', '#deaa7c'];
const HAIR = ['#1c1411', '#2f211b', '#241a15'];
const TIE = '#e8347f';

const styles = {
  // Tóc ngắn.
  short: () => '',
  // Tóc đuôi ngựa, dây buộc hồng.
  tail: (hair) => `<ellipse cx="60" cy="74" rx="10" ry="17" fill="${hair}"/><circle cx="60" cy="59" r="4.5" fill="${TIE}"/>`,
  // Hai bím.
  twin: (hair) => `<circle cx="24" cy="56" r="11" fill="${hair}"/><circle cx="96" cy="56" r="11" fill="${hair}"/><circle cx="33" cy="48" r="4" fill="${TIE}"/><circle cx="87" cy="48" r="4" fill="${TIE}"/>`,
};
const STYLE_NAMES = ['short', 'tail', 'short', 'twin'];

export function studentSvg(look = 0) {
  const skin = SKIN[look % SKIN.length];
  const hair = HAIR[Math.floor(look / 3) % HAIR.length];
  const style = styles[STYLE_NAMES[Math.floor(look / 9) % STYLE_NAMES.length]](hair);
  return `<svg viewBox="0 0 120 132" aria-hidden="true">
    <path d="M12 132c0-30 18-48 48-48s48 18 48 48Z" fill="#fbfaf3" stroke="#e5dfcf" stroke-width="1.5"/>
    <rect x="50" y="62" width="20" height="28" fill="${skin}"/>
    <path d="M44 84 60 106 76 84Z" fill="#d3263c"/>
    <circle cx="30" cy="42" r="5" fill="${skin}"/><circle cx="90" cy="42" r="5" fill="${skin}"/>
    ${style}
    <circle cx="60" cy="38" r="31" fill="${hair}"/>
    <g class="arm">
      <path d="M88 112 108 84" stroke="#fbfaf3" stroke-width="14" stroke-linecap="round"/>
      <path d="M108 84 117 58" stroke="${skin}" stroke-width="11" stroke-linecap="round"/>
      <circle cx="118" cy="54" r="8" fill="${skin}"/>
    </g>
  </svg>`;
}

export function teacherSvg() {
  return `<svg viewBox="0 0 134 356" aria-hidden="true">
    <path class="pointer" d="M34 148 -46 200" stroke="#6f4526" stroke-width="5" stroke-linecap="round"/>
    <path d="M46 44C46 8 112 8 112 44L118 142H40Z" fill="#231713"/>
    <path d="M56 170H104L118 336H42Z" fill="#fbfaf3" stroke="#ddd6c6" stroke-width="1.5"/>
    <path d="M56 104C70 96 90 96 104 104L108 176 102 326C90 332 70 332 60 326L54 176Z" fill="#4f9ee2"/>
    <path d="M56 106C44 112 40 136 34 148" stroke="#4f9ee2" stroke-width="14" fill="none" stroke-linecap="round"/>
    <circle cx="33" cy="149" r="8" fill="#f1c8a2"/>
    <path d="M104 106C114 116 116 150 116 188" stroke="#4f9ee2" stroke-width="13" fill="none" stroke-linecap="round"/>
    <rect x="104" y="176" width="24" height="36" rx="2" fill="#c0392b"/>
    <circle cx="116" cy="196" r="7" fill="#f1c8a2"/>
    <rect x="70" y="84" width="20" height="24" rx="4" fill="#3c86c8"/>
    <rect x="72" y="72" width="16" height="18" fill="#eebd96"/>
    <ellipse cx="80" cy="50" rx="27" ry="30" fill="#f1c8a2"/>
    <path d="M52 50C50 20 110 20 108 50 98 34 76 30 66 32 60 36 54 42 52 50Z" fill="#231713"/>
    <circle cx="70" cy="52" r="3" fill="#231713"/><circle cx="90" cy="52" r="3" fill="#231713"/>
    <circle cx="63" cy="60" r="4.5" fill="#efa59a"/><circle cx="97" cy="60" r="4.5" fill="#efa59a"/>
    <path class="smile" d="M72 66C76 71 84 71 88 66" stroke="#a7482f" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <ellipse class="mouth" cx="80" cy="67" rx="5" ry="4.5" fill="#8c2f24"/>
    <ellipse cx="66" cy="342" rx="15" ry="7" fill="#33281f"/><ellipse cx="96" cy="342" rx="15" ry="7" fill="#33281f"/>
  </svg>`;
}
