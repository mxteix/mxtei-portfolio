(function () {
  const canvas = document.getElementById("live-bg");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  let w, h;
  let mouse = { x: 0.5, y: 0.5 };

  const blobs = [
    { x: 0.2, y: 0.3, r: 0.35, color: [255, 45, 120], speed: 0.0004, phase: 0 },
    { x: 0.75, y: 0.2, r: 0.3, color: [168, 85, 247], speed: 0.0005, phase: 1.2 },
    { x: 0.5, y: 0.7, r: 0.4, color: [239, 68, 68], speed: 0.0003, phase: 2.4 },
    { x: 0.85, y: 0.65, r: 0.25, color: [236, 72, 153], speed: 0.0006, phase: 0.8 },
    { x: 0.15, y: 0.75, r: 0.28, color: [124, 58, 237], speed: 0.00045, phase: 3.1 },
    { x: 0.6, y: 0.45, r: 0.22, color: [251, 113, 133], speed: 0.00055, phase: 1.7 },
  ];

  const particles = Array.from({ length: 60 }, () => ({
    x: Math.random(),
    y: Math.random(),
    size: Math.random() * 2 + 0.5,
    speed: Math.random() * 0.0003 + 0.0001,
    phase: Math.random() * Math.PI * 2,
    hue: Math.random() * 60 + 300,
  }));

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }

  function isLight() {
    return document.documentElement.getAttribute("data-theme") === "light";
  }

  function drawBackground() {
    const light = isLight();
    ctx.fillStyle = light ? "#faf5ff" : "#08060f";
    ctx.fillRect(0, 0, w, h);
  }

  function drawBlobs(t) {
    blobs.forEach((b) => {
      const ox = Math.sin(t * b.speed * 1000 + b.phase) * 0.08;
      const oy = Math.cos(t * b.speed * 800 + b.phase * 1.3) * 0.06;
      const mx = (mouse.x - 0.5) * 0.04;
      const my = (mouse.y - 0.5) * 0.04;
      const cx = (b.x + ox + mx) * w;
      const cy = (b.y + oy + my) * h;
      const radius = b.r * Math.min(w, h);

      const [r, g, bl] = b.color;
      const alpha = isLight() ? 0.18 : 0.22;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      grad.addColorStop(0, `rgba(${r},${g},${bl},${alpha})`);
      grad.addColorStop(0.5, `rgba(${r},${g},${bl},${alpha * 0.4})`);
      grad.addColorStop(1, `rgba(${r},${g},${bl},0)`);

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawParticles(t) {
    particles.forEach((p) => {
      const px = p.x * w + Math.sin(t * p.speed * 2000 + p.phase) * 20;
      const py = (p.y - ((t * p.speed * 500) % 1)) * h;
      const alpha = isLight() ? 0.35 : 0.5;
      ctx.fillStyle = `hsla(${p.hue}, 80%, 65%, ${alpha})`;
      ctx.beginPath();
      ctx.arc(px, py < 0 ? py + h : py, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawMottoText(t) {
    const light = isLight();
    const text1 = "You ask, I complete.";
    const text2 = "mxtei";

    ctx.save();
    ctx.textAlign = "center";

    const floatY = Math.sin(t) * 12;
    const centerX = w / 2;
    const centerY = h * 0.42 + floatY;

    ctx.font = `800 ${Math.min(w * 0.055, 72)}px "Inter", system-ui, sans-serif`;
    const grad1 = ctx.createLinearGradient(centerX - 200, centerY, centerX + 200, centerY);
    grad1.addColorStop(0, light ? "rgba(219,39,119,0.12)" : "rgba(255,45,120,0.15)");
    grad1.addColorStop(0.5, light ? "rgba(168,85,247,0.14)" : "rgba(168,85,247,0.18)");
    grad1.addColorStop(1, light ? "rgba(239,68,68,0.12)" : "rgba(239,68,68,0.15)");
    ctx.fillStyle = grad1;
    ctx.fillText(text1, centerX, centerY);

    ctx.font = `900 ${Math.min(w * 0.12, 160)}px "Inter", system-ui, sans-serif`;
    const grad2 = ctx.createLinearGradient(centerX - 250, centerY + 60, centerX + 250, centerY + 160);
    grad2.addColorStop(0, light ? "rgba(236,72,153,0.08)" : "rgba(255,45,120,0.1)");
    grad2.addColorStop(0.35, light ? "rgba(168,85,247,0.1)" : "rgba(168,85,247,0.12)");
    grad2.addColorStop(0.7, light ? "rgba(239,68,68,0.08)" : "rgba(239,68,68,0.1)");
    grad2.addColorStop(1, light ? "rgba(251,113,133,0.06)" : "rgba(236,72,153,0.08)");
    ctx.fillStyle = grad2;
    ctx.fillText(text2, centerX, centerY + 100);

    const pulse = 0.5 + Math.sin(t * 2) * 0.5;
    ctx.strokeStyle = light
      ? `rgba(168,85,247,${0.06 + pulse * 0.04})`
      : `rgba(255,45,120,${0.08 + pulse * 0.06})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(centerX, centerY + 50, w * 0.28, h * 0.12, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  function drawGrid(t) {
    const light = isLight();
    const spacing = 80;
    const offset = (t * 20) % spacing;
    ctx.strokeStyle = light ? "rgba(168,85,247,0.04)" : "rgba(255,255,255,0.02)";
    ctx.lineWidth = 1;

    for (let x = -spacing + offset; x < w + spacing; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = -spacing + offset; y < h + spacing; y += spacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  }

  // Every draw function takes seconds; blob/particle speeds are tuned in Hz.
  function animate(ms) {
    const t = ms / 1000;
    drawBackground();
    drawGrid(t);
    drawBlobs(t);
    drawParticles(t);
    drawMottoText(t);
    requestAnimationFrame(animate);
  }

  window.addEventListener("resize", resize);
  window.addEventListener("mousemove", (e) => {
    mouse.x = e.clientX / w;
    mouse.y = e.clientY / h;
  });

  window.addEventListener("themechange", () => {});

  resize();
  requestAnimationFrame(animate);
})();
