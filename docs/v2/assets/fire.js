/* mxtei fire background — WebGL fragment shader on a fixed, pointer-events:none canvas.
   Ported from the design handoff: shader, per-section parameter table and easing
   constants are verbatim and deliberate. The 0.012 lerp is what makes a section
   crossing read as a drift rather than a cut — don't raise it. */
(function () {
  "use strict";

  var MODES = {
    home:      { speed:.075, scale:3.0, base:.95, side:.42, center:.26, bright:.60, spark:.30 },
    services:  { speed:.065, scale:2.7, base:.70, side:.58, center:.00, bright:.52, spark:.24 },
    work:      { speed:.048, scale:2.2, base:.62, side:.30, center:.00, bright:.34, spark:.14 },
    pricing:   { speed:.085, scale:3.4, base:.68, side:.28, center:.62, bright:.54, spark:.26 },
    about:     { speed:.042, scale:2.0, base:.72, side:.34, center:.08, bright:.40, spark:.12 },
    contact:   { speed:.10,  scale:4.0, base:.78, side:.26, center:.46, bright:.58, spark:.36 },
    reach:     { speed:.13,  scale:3.8, base:1.0, side:.52, center:.50, bright:.76, spark:.46 },
    reachflow: { speed:.105, scale:4.4, base:.66, side:.56, center:.00, bright:.56, spark:.30 },
    brand:     { speed:.055, scale:2.6, base:.66, side:.28, center:.58, bright:.46, spark:.18 }
  };

  var VERT = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";

  var FRAG = [
    "precision highp float;",
    "uniform vec2 u_res;uniform float u_time;uniform vec2 u_mouse;",
    "uniform float u_speed,u_scale,u_base,u_side,u_center,u_bright,u_spark,u_open;",
    "float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}",
    "float noise(vec2 p){",
    " vec2 i=floor(p),f=fract(p);",
    " f=f*f*(3.-2.*f);",
    " float a=hash(i),b=hash(i+vec2(1.,0.)),c=hash(i+vec2(0.,1.)),d=hash(i+vec2(1.,1.));",
    " return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);}",
    "float fbm(vec2 p){",
    " float s=0.,a=.5;",
    " for(int i=0;i<5;i++){s+=a*noise(p);p*=2.03;a*=.5;}",
    " return s;}",
    "void main(){",
    " vec2 uv=gl_FragCoord.xy/u_res;",
    " float asp=u_res.x/max(u_res.y,1.);",
    " vec2 p=vec2(uv.x*asp,uv.y);",
    " float t=u_time*u_speed;",
    " float conv=1.+uv.y*1.85;",
    " vec2 pc=vec2((p.x-asp*.5)*conv+asp*.5,p.y);",
    " vec2 q=vec2(pc.x,pc.y*.30)*u_scale;",
    " float w=fbm(q*.5+vec2(t*.12,-t*.9));",
    " float f=fbm(q+vec2(w*.9,-t*2.1+w*.35));",
    " f=mix(f,fbm(q*2.1+vec2(w*.6,-t*3.0)),.26);",
    " float rise=pow(1.-uv.y*.72,1.05);",
    " float tail=smoothstep(.95,.15,uv.y)*.55;",
    " float bottom=u_base*(rise*.80+tail+.20*smoothstep(.30,0.,uv.y));",
    " float edge=max(smoothstep(.28,0.,uv.x),smoothstep(.72,1.,uv.x));",
    " float side=u_side*edge*pow(1.-uv.y*.30,1.0);",
    " float center=u_center*smoothstep(.38,0.,abs(uv.x-.5))*pow(1.-uv.y*.62,1.3);",
    " float md=distance(p,vec2(u_mouse.x*asp,u_mouse.y));",
    " float m=bottom+side+center+.40*exp(-md*md*11.);",
    " float gap=smoothstep(.50,.06,abs(uv.x-.5))*smoothstep(.03,.30,uv.y)*(.06+.34*u_open);",
    " m*=1.-gap;",
    " m=clamp(m,0.,1.6);",
    " float flame=f*m;",
    " float e=smoothstep(.20,.80,flame);",
    " float hot=smoothstep(.62,1.00,flame);",
    " float tip=smoothstep(.86,1.22,flame);",
    " float sp=fbm(vec2(pc.x*12.,pc.y*5.-t*5.));",
    " float spark=smoothstep(.82,.97,sp)*m*u_spark*smoothstep(.95,.05,uv.y);",
    " vec3 col=mix(vec3(.24,.04,.01),vec3(1.,.34,.08),e);",
    " col=mix(col,vec3(1.,.62,.22),hot);",
    " col=mix(col,vec3(1.,.87,.62),tip);",
    " float topFade=smoothstep(1.05,.30,uv.y);",
    " float botKeep=.78+.22*smoothstep(.45,0.,uv.y);",
    " float a=e*u_bright*topFade*botKeep;",
    " a+=spark*.5;",
    " col+=vec3(1.,.72,.40)*spark*.85;",
    " gl_FragColor=vec4(col*a,min(a,1.));",
    "}"
  ].join("\n");

  var state = {
    cur: null, target: null,
    mouse: { x:.5, y:.35, tx:.5, ty:.35 },
    open: 0, vel: 0, lastY: 0,
    raf: 0, io: null, gl: null
  };

  function setMode(name) {
    var m = MODES[name];
    if (m && state.target) {
      for (var k in m) state.target[k] = m[k];
    }
  }

  /* Most-visible [data-fire] section wins. Re-callable: disconnects first so a
     re-run never stacks observers. */
  function observeSections() {
    if (state.io) state.io.disconnect();
    var nodes = document.querySelectorAll("[data-fire]");
    if (!nodes.length || !("IntersectionObserver" in window)) return;
    state.io = new IntersectionObserver(function (entries) {
      var best = null;
      entries.forEach(function (en) {
        if (en.isIntersecting && (!best || en.intersectionRatio > best.intersectionRatio)) best = en;
      });
      if (best) setMode(best.target.getAttribute("data-fire"));
    }, { threshold: [0.25, 0.5, 0.75] });
    Array.prototype.forEach.call(nodes, function (n) { state.io.observe(n); });
  }

  function initFire(canvas, startMode) {
    if (state.gl) return;                       // never a second context
    var gl = canvas.getContext("webgl", { alpha:true, premultipliedAlpha:true, antialias:false })
          || canvas.getContext("experimental-webgl", { alpha:true, premultipliedAlpha:true, antialias:false });
    if (!gl) return;                            // no WebGL: page stands on its own ground colour
    state.gl = gl;

    function mk(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn(gl.getShaderInfoLog(s));
      return s;
    }
    var prog = gl.createProgram();
    gl.attachShader(prog, mk(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.warn(gl.getProgramInfoLog(prog)); return; }
    gl.useProgram(prog);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);   // shader outputs premultiplied colour

    var U = {};
    ["u_res","u_time","u_mouse","u_speed","u_scale","u_base","u_center","u_side","u_bright","u_spark","u_open"]
      .forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });

    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 1.6);   // uncapped DPR tanks 4K for no gain
      var w = Math.floor(canvas.clientWidth * dpr), h = Math.floor(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h);
      }
    }

    if (state.raf) cancelAnimationFrame(state.raf);
    var t0 = performance.now();

    function frame() {
      resize();
      var k = .012;
      for (var key in state.target) state.cur[key] += (state.target[key] - state.cur[key]) * k;
      state.mouse.x += (state.mouse.tx - state.mouse.x) * .035;
      state.mouse.y += (state.mouse.ty - state.mouse.y) * .035;
      state.vel *= .94;
      var openTarget = Math.min(state.vel / 26, 1);
      // asymmetric: parts quickly as you scroll, closes back slowly once you stop
      state.open += (openTarget - state.open) * (openTarget > state.open ? .02 : .006);

      gl.uniform2f(U.u_res, canvas.width, canvas.height);
      gl.uniform1f(U.u_time, reduce ? 4.2 : (performance.now() - t0) / 1000);
      gl.uniform2f(U.u_mouse, state.mouse.x, state.mouse.y);
      gl.uniform1f(U.u_speed,  state.cur.speed);
      gl.uniform1f(U.u_scale,  state.cur.scale);
      gl.uniform1f(U.u_base,   state.cur.base);
      gl.uniform1f(U.u_side,   state.cur.side);
      gl.uniform1f(U.u_center, state.cur.center);
      gl.uniform1f(U.u_bright, state.cur.bright);
      gl.uniform1f(U.u_spark,  state.cur.spark);
      gl.uniform1f(U.u_open,   state.open);

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      state.raf = requestAnimationFrame(frame);
    }
    frame();
  }

  function start() {
    var canvas = document.getElementById("fire");
    if (!canvas) return;
    var startMode = document.body.getAttribute("data-fire-start") || "home";
    var base = MODES[startMode] || MODES.home;
    state.cur = Object.assign({}, base);
    state.target = Object.assign({}, base);

    window.addEventListener("pointermove", function (e) {
      state.mouse.tx = e.clientX / window.innerWidth;
      state.mouse.ty = 1 - e.clientY / window.innerHeight;
    }, { passive: true });

    state.lastY = window.scrollY;
    window.addEventListener("scroll", function () {
      var y = window.scrollY;
      state.vel = Math.min(state.vel + Math.abs(y - state.lastY), 90);
      state.lastY = y;
    }, { passive: true });

    initFire(canvas, startMode);
    observeSections();
  }

  window.mxFire = { start: start, setMode: setMode, observeSections: observeSections };
})();
