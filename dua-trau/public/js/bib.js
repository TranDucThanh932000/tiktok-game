// Số báo danh của trâu: ô màu áo trâu, số trắng. Dùng cả trong HTML (bibEl) lẫn trên canvas (drawBib, biển cắm trên lưng trâu).
export function bibEl(buffalo, className = '') {
  const node = document.createElement('span');
  node.className = `bib ${className}`.trim();
  node.textContent = buffalo?.id ?? '';
  node.style.setProperty('--c', buffalo?.color ?? '#888');
  return node;
}

export function drawBib(g, x, y, buffalo, t) {
  g.strokeStyle = '#5a3a1c';
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x, y - 76);
  g.stroke();
  g.fillStyle = '#ffd34d';
  g.beginPath();
  g.arc(x, y - 78, 5, 0, Math.PI * 2);
  g.fill();
  // Biển hơi đung đưa theo nhịp chạy.
  g.save();
  g.translate(x + 2, y - 74);
  g.rotate(Math.sin(t * 6) * 0.05);
  g.fillStyle = buffalo.color;
  g.strokeStyle = '#fff';
  g.lineWidth = 4;
  g.beginPath();
  g.roundRect(0, 0, 62, 52, 10);
  g.fill();
  g.stroke();
  g.strokeStyle = 'rgba(0, 0, 0, .25)';
  g.lineWidth = 2;
  g.beginPath();
  g.roundRect(-2, -2, 66, 56, 12);
  g.stroke();
  g.font = '700 38px "Be Vietnam Pro", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = 6;
  g.strokeStyle = 'rgba(0, 0, 0, .45)';
  g.strokeText(buffalo.id, 31, 28);
  g.fillStyle = '#fff';
  g.fillText(buffalo.id, 31, 28);
  g.restore();
}
