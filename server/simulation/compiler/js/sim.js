(function(){
  // The model is the shared simulation asset (one robot.obj for every view).
  var OBJ_URL = '../assets/model/robot.obj';
  // ================= 3D ROBOT RIG =================
  var Rig = (function(){
    var mount = document.getElementById('stage3d');
    var loadingEl = document.getElementById('modelLoading');
    var scene, camera, renderer, root, model, radius = 1, modelHeight = 1;

  // Grid made of short segments (4 units each). A single 80-unit line that passes behind the camera can be
  // dropped by some renderers while it is clipped, which left only one direction of lines visible.
  function makeGrid(size, divs, centerHex, lineHex) {
    const half = size / 2, step = size / divs, chunk = 4, pos = [], col = [];
    const c1 = new THREE.Color(centerHex), c2 = new THREE.Color(lineHex);
    for (let i = 0; i <= divs; i++) {
      const k = -half + i * step, c = i === divs / 2 ? c1 : c2;
      for (let a = -half; a < half - 1e-6; a += chunk) {
        const b = Math.min(half, a + chunk);
        pos.push(-0 + a, 0, k, b, 0, k, k, 0, a, k, 0, b);
        for (let n = 0; n < 4; n++) col.push(c.r, c.g, c.b);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    const g = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, toneMapped: false }));
    g.frustumCulled = false;
    return g;
  }

    var groundGrid = null, groundFloor = null, groundCell = 1;
    var view = { theta: Math.PI * 0, phi: Math.PI * 0.4, dist: 3 };
    var target = new THREE.Vector3();
    var t = 0;
    var mode = { walking:false, walkDir:1, dancing:false, stopped:false };
    var bodyTurnDeg = 0, eyeAngleDeg = 90;
    var frameCount = 0, lastFpsTime = performance.now(), currentFps = 0;
    var onFps = null, onCam = null;

    function parseOBJ(text){
      var lines = text.split('\n');
      var positions = [], colors = [], faces = [], hasColor = false;
      var sumX=0, sumY=0, sumZ=0, n=0;
      for (var i=0;i<lines.length;i++){
        var line = lines[i];
        if (line.charCodeAt(0)===118 && line.charCodeAt(1)===32){
          var p = line.trim().split(/\s+/);
          var vx=parseFloat(p[1]), vy=parseFloat(p[2]), vz=parseFloat(p[3]);
          positions.push(vx,vy,vz);
          sumX+=vx; sumY+=vy; sumZ+=vz; n++;
          if (p.length>=7){ hasColor=true; colors.push(parseFloat(p[4]),parseFloat(p[5]),parseFloat(p[6])); }
          else colors.push(0.75,0.75,0.75);
        } else if (line.charCodeAt(0)===102 && line.charCodeAt(1)===32){
          var f = line.trim().split(/\s+/);
          for (var k=1;k<f.length;k++) faces.push(parseInt(f[k].split('/')[0],10)-1);
        }
      }
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
      if (hasColor) geo.setAttribute('color', new THREE.Float32BufferAttribute(colors,3));
      if (faces.length) geo.setIndex(faces);
      geo.computeVertexNormals();
      geo.computeBoundingBox();
      geo.computeBoundingSphere();
      return { geo:geo, hasColor:hasColor, centroid: n ? {x:sumX/n, y:sumY/n, z:sumZ/n} : {x:0,y:0,z:0} };
    }

    function init(){
      scene = new THREE.Scene();
      scene.background = null;
      camera = new THREE.PerspectiveCamera(40, mount.clientWidth/mount.clientHeight, 0.01, 100);
      renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      mount.appendChild(renderer.domElement);

      scene.add(new THREE.AmbientLight(0xffffff, 0.55));
      var key = new THREE.DirectionalLight(0xffffff, 1.05); key.position.set(2.2,4.2,3); scene.add(key);
      var rim = new THREE.DirectionalLight(0xaaaaaa, 0.35); rim.position.set(-3,1.2,-2.2); scene.add(rim);
      var fill = new THREE.DirectionalLight(0xffffff, 0.25); fill.position.set(0,-1,2); scene.add(fill);

      root = new THREE.Group();
      scene.add(root);

      fetch(OBJ_URL).then(function(r){
        if (!r.ok) throw new Error('model ' + r.status);
        return r.text();
      }).then(function(raw){
      try {
        var parsed = parseOBJ(raw);
        var mat = new THREE.MeshStandardMaterial({
          vertexColors: parsed.hasColor, color: parsed.hasColor ? 0xffffff : 0xaab0bb,
          metalness:0.08, roughness:0.72, side:THREE.DoubleSide
        });
        model = new THREE.Mesh(parsed.geo, mat);

        var c = new THREE.Vector3(); parsed.geo.boundingBox.getCenter(c);
        var s = new THREE.Vector3(); parsed.geo.boundingBox.getSize(s);
        radius = parsed.geo.boundingSphere.radius || Math.max(s.x,s.y,s.z) || 1;
        var cx = parsed.centroid.x, cz = parsed.centroid.z;
        model.position.set(-cx, -parsed.geo.boundingBox.min.y, -cz);
        root.add(model);

        // Large dark grid floor (appears effectively unlimited from typical camera distance)
        var gridSize = 80;
        var gridDivs = 80;
        var grid = makeGrid(gridSize, gridDivs, 0x55555f, 0x2e2e36);
        grid.position.y = 0;
        // r128 GridHelper uses an array of 2 materials — never set .material.prop directly
        var mats = Array.isArray(grid.material) ? grid.material : [grid.material];
        for (var gi = 0; gi < mats.length; gi++) {
          mats[gi].transparent = true;
          mats[gi].opacity = 0.9;
          mats[gi].depthWrite = false;
        }
        scene.add(grid);

        // Near-black infinite-feeling plane under the grid
        var floorGeo = new THREE.PlaneGeometry(gridSize * 2, gridSize * 2);
        floorGeo.rotateX(-Math.PI / 2);
        var floorMat = new THREE.MeshBasicMaterial({
          color: 0x080809, transparent: true, opacity: 0.92, depthWrite: false
        });
        var floorMesh = new THREE.Mesh(floorGeo, floorMat);
        floorMesh.position.y = -0.01;
        scene.add(floorMesh);

        // Infinite ground via cell-snap under the robot
        groundGrid = grid;
        groundFloor = floorMesh;
        groundCell = gridSize / gridDivs;

        // Subtle origin axes
        var axisLen = Math.max(radius * 0.8, 0.4);
        function makeAxis(a, b, hex) {
          var g = new THREE.BufferGeometry().setFromPoints([a, b]);
          var m = new THREE.LineBasicMaterial({ color: hex, transparent: true, opacity: 0.45 });
          scene.add(new THREE.Line(g, m));
        }
        makeAxis(new THREE.Vector3(-axisLen, 0.005, 0), new THREE.Vector3(axisLen, 0.005, 0), 0xb05050);
        makeAxis(new THREE.Vector3(0, 0.005, -axisLen), new THREE.Vector3(0, 0.005, axisLen), 0x509060);

        modelHeight = s.y;
        view.dist = radius / Math.sin((camera.fov*Math.PI/180)/2) * 1.40;
        loadingEl.style.display = 'none';
      } catch(e){
        loadingEl.textContent = 'Could not load 3D model';
      }
      }).catch(function(){
        loadingEl.textContent = 'Could not load 3D model';
      });

      updateCamera();
      bindControls();
      window.addEventListener('resize', onResize);
      requestAnimationFrame(loop);
    }

    function updateCamera(){
      var midY = modelHeight * 0.5;
      var x = target.x + view.dist*Math.sin(view.phi)*Math.sin(view.theta);
      var y = target.y + midY + view.dist*Math.cos(view.phi);
      var z = target.z + view.dist*Math.sin(view.phi)*Math.cos(view.theta);
      camera.position.set(x,y,z);
      camera.lookAt(target.x, target.y + midY, target.z);
      if (onCam) onCam(view);
    }

    function bindControls(){
      var dragging=false, lx=0, ly=0;
      function down(x,y){ dragging=true; lx=x; ly=y; mount.style.cursor='grabbing'; }
      function move(x,y){ if(!dragging) return; var dx=x-lx, dy=y-ly; lx=x; ly=y;
        view.theta -= dx*0.008; view.phi = Math.max(0.25, Math.min(Math.PI/1.55, view.phi - dy*0.008)); updateCamera(); }
      function up(){ dragging=false; mount.style.cursor='grab'; }
      mount.addEventListener('mousedown', function(e){ down(e.clientX,e.clientY); });
      window.addEventListener('mousemove', function(e){ move(e.clientX,e.clientY); });
      window.addEventListener('mouseup', up);
      mount.addEventListener('wheel', function(e){ e.preventDefault();
        view.dist = Math.max(radius*0.55, Math.min(radius*7, view.dist*(1+e.deltaY*0.001))); updateCamera(); }, {passive:false});
      mount.addEventListener('touchstart', function(e){ if(e.touches.length===1) down(e.touches[0].clientX,e.touches[0].clientY); }, {passive:true});
      mount.addEventListener('touchmove', function(e){ if(e.touches.length===1){ e.preventDefault(); move(e.touches[0].clientX,e.touches[0].clientY); } }, {passive:false});
      mount.addEventListener('touchend', up);
    }

    function onResize(){
      if (!mount.clientWidth) return;
      camera.aspect = mount.clientWidth/mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    }

    function loop(){
      requestAnimationFrame(loop);
      t += 0.016;
      frameCount++;
      var now = performance.now();
      if (now - lastFpsTime >= 500) {
        currentFps = Math.round(frameCount * 1000 / (now - lastFpsTime));
        frameCount = 0; lastFpsTime = now;
        if (onFps) onFps(currentFps);
      }
      if (model && !mode.stopped){
        var bob=0, sway=0, lean=0;
        if (mode.dancing){
          // Layered dance on a solid mesh: bounce, hip rock, lean, spin wiggle, small circle
          var beat = t * 6.2;           // main groove
          var half = t * 3.1;           // slower body wave
          var double = t * 12.4;        // quick shoulder shake
          var bounce = Math.abs(Math.sin(beat));
          bob = (0.55 * bounce + 0.25 * Math.abs(Math.sin(double)) + 0.12) * radius * 0.11;
          sway = Math.sin(beat) * 0.28 + Math.sin(half) * 0.10;          // hip sway
          lean = Math.sin(half * 1.15) * 0.14 + Math.sin(double) * 0.04; // forward/back groove
          // gentle spin / shoulder twist on top of body heading
          var danceYaw = Math.sin(beat * 0.5) * 0.18 + Math.sin(double) * 0.05;
          // tiny circular footwork so it doesn't dance in a fixed spot
          root.position.x += Math.sin(half) * radius * 0.006;
          root.position.z += Math.cos(half * 1.3) * radius * 0.005;
          root.rotation.y = Math.PI + (bodyTurnDeg * Math.PI / 180) + danceYaw;
        } else if (mode.walking){
          // Step cycle on solid mesh — bob, weight shift, lean
          var step = t * 5.2;
          var stepSin = Math.sin(step);
          var stepAbs = Math.abs(stepSin);
          bob = Math.pow(stepAbs, 0.65) * radius * 0.13;
          sway = stepSin * 0.20;
          lean = Math.cos(step) * 0.10;
          var yaw = (bodyTurnDeg * Math.PI) / 180;
          var speed = radius * (0.038 + 0.012 * stepAbs) * mode.walkDir;
          root.position.x += Math.sin(yaw) * speed + Math.cos(yaw) * stepSin * radius * 0.008;
          root.position.z += Math.cos(yaw) * speed - Math.sin(yaw) * stepSin * radius * 0.008;
        }
        var eyeYaw = ((eyeAngleDeg-90)/90) * 0.28;
        if (!mode.dancing) {
          var walkYawWiggle = mode.walking ? Math.sin(t * 5.2) * 0.09 : 0;
          root.rotation.y = Math.PI + (bodyTurnDeg*Math.PI/180) + eyeYaw*0.4 + walkYawWiggle;
        } else {
          root.rotation.y += eyeYaw * 0.25;
        }
        root.rotation.z = sway;
        root.rotation.x = lean;
        root.position.y = bob;
        // Camera follows robot
        target.x = root.position.x;
        target.z = root.position.z;
        // Infinite ground: snap grid under robot in whole-cell steps
        if (groundGrid) {
          var gx = Math.round(root.position.x / groundCell) * groundCell;
          var gz = Math.round(root.position.z / groundCell) * groundCell;
          groundGrid.position.x = gx;
          groundGrid.position.z = gz;
          if (groundFloor) {
            groundFloor.position.x = gx;
            groundFloor.position.z = gz;
          }
        }
        updateCamera();
      } else if (model && mode.stopped){
        root.rotation.z *= 0.9; root.rotation.x *= 0.9; root.position.y *= 0.85;
      }
      renderer.render(scene, camera);
    }

    init();

    return {
      setBodyTurn: function(deg){ bodyTurnDeg = deg; },
      setEyeAngle: function(deg){ eyeAngleDeg = deg; },
      setWalking: function(v, dir){ mode.walking = !!v; if (dir !== undefined) mode.walkDir = dir >= 0 ? 1 : -1; },
      setDancing: function(v){ mode.dancing = v; },
      setStopped: function(v){ mode.stopped = v; },
      resetCamera: function(){
        view.theta = Math.PI * 0.40; view.phi = Math.PI * 0.4;
        view.dist = radius / Math.sin((camera.fov*Math.PI/180)/2) * 1.19;
        updateCamera();
      },
      setView: function(preset){
        if (preset === 'front'){ view.theta = 0; view.phi = Math.PI/2; }
        else if (preset === 'side'){ view.theta = Math.PI/2; view.phi = Math.PI/2; }
        else if (preset === 'top'){ view.theta = 0; view.phi = 0.28; }
        view.dist = radius / Math.sin((camera.fov*Math.PI/180)/2) * 1.25;
        updateCamera();
      },
      onFps: function(fn){ onFps = fn; },
      onCam: function(fn){ onCam = fn; },
      resetPosition: function(){
        if (!root) return;
        root.position.x = 0; root.position.z = 0; root.position.y = 0;
        target.x = 0; target.z = 0;
        if (groundGrid) { groundGrid.position.x = 0; groundGrid.position.z = 0; }
        if (groundFloor) { groundFloor.position.x = 0; groundFloor.position.z = 0; }
        updateCamera();
      }
    };
  })();

  // Pull in the compiled program injected above; fall back to an empty shell
  // only if nothing was actually baked into this file.
  var program = window.__VISION_PROGRAM__ || window.program || {
    sourceName: 'untitled.vs',
    instructions: []
  };

  document.getElementById('srcName').innerHTML = '<i class="fa-solid fa-file-code"></i>' + (program.sourceName || 'untitled.vs');

  var instructions = [];  // filled by VisionSim.load(program)
  var logEl = document.getElementById('log');
  var stateEl = document.getElementById('state');
  var bubble = document.getElementById('bubble');
  var flash = document.getElementById('flash');
  var stopchip = document.getElementById('stopchip');
  var speedInput = document.getElementById('speed');
  var speedVal = document.getElementById('speedVal');
  var btnPlay = document.getElementById('btnPlay');
  var btnStep = document.getElementById('btnStep');
  var btnReset = document.getElementById('btnReset');
  var statusLed = document.getElementById('statusLed');
  var statusText = document.getElementById('statusText');
  var statusPill = document.getElementById('statusPill');
  var hbLed = document.getElementById('hbLed');
  var stepCur = document.getElementById('stepCur');
  var stepTotal = document.getElementById('stepTotal');
  var stepPct = document.getElementById('stepPct');
  var logCount = document.getElementById('logCount');
  var lastEventBar = document.getElementById('lastEventBar');
  var fpsVal = document.getElementById('fpsVal');
  var camInfo = document.getElementById('camInfo');
  var badgeWalk = document.getElementById('badgeWalk');
  var badgeDance = document.getElementById('badgeDance');
  var badgeEstop = document.getElementById('badgeEstop');

  var state = { eyeAngle:90, bodyTurn:0, walking:false, walkDir:1, dancing:false, emergencyStopped:false, lastEvent:'—' };
  var bubbleTimer=null, actionTimer=null;
  var logFilter = 'all';

  stepTotal.textContent = instructions.length;
  logCount.textContent = instructions.length + ' instr';

  var DURATIONAL = { TURN_LEFT:600, TURN_RIGHT:600, WALK_FORWARD:800, WALK_BACKWARD:800, DANCE:3000 };
  var musicAudio = null;
  function stopMusic(){
    if (musicAudio) {
      try { musicAudio.pause(); musicAudio.currentTime = 0; } catch (e) {}
      musicAudio = null;
    }
  }
  function playMusic(arg){
    stopMusic();
    if (typeof arg !== 'string' || !arg.trim()) {
      say('Playing a song', 1400);
      return;
    }
    var s = arg.trim();
    // URL, absolute path, relative path, or audio file from simulate download
    var isAudioPath = /^(https?:|blob:|data:|\/|\.\/)/i.test(s) || /\.(m4a|webm|mp3|opus|ogg)(\?|$)/i.test(s);
    if (isAudioPath) {
      try {
        musicAudio = new Audio(s);
        musicAudio.volume = 0.9;
        musicAudio.play().catch(function(err){ console.warn('music play failed', err); say('Could not play audio file', 1400); });
        say('Playing music…', 1600);
      } catch (e) {
        say('Could not play audio', 1400);
      }
    } else {
      say('Playing "' + s + '"', Math.max(1600, s.length * 55));
    }
  }

  var graphSvg = document.getElementById('timelineGraph');
  var graphClip = null, graphHead = null, graphPts = [];

  function instrLevel(instr){
    if (!instr) return 0.12;
    if (instr.op === 'SLEEP') return 0.16 + Math.min(0.24, (instr.ms || 400) / 4000);
    if (instr.op === 'LOG') return 0.28;
    var cmd = instr.command || '';
    if (cmd === 'DANCE') return 0.94;
    if (cmd === 'WALK_FORWARD' || cmd === 'WALK_BACKWARD') return 0.72;
    if (cmd === 'WALK_STOP') return 0.2;
    if (cmd === 'TURN_LEFT' || cmd === 'TURN_RIGHT') return 0.56;
    if (cmd.indexOf('EMERGENCY') === 0) return 0.88;
    if (cmd === 'AUDIO_SPEAK' || cmd === 'FIND_PERSON' || cmd === 'PLAY_SONG_REQUEST' || cmd === 'PLAY_MUSIC') return 0.48;
    if (cmd.indexOf('EYE') === 0) return 0.38;
    return 0.34;
  }

  function buildGraph(){
    var n = instructions.length;
    var W = 400, H = 96, padL = 10, padR = 10, padT = 12, padB = 16;
    var innerW = W - padL - padR, innerH = H - padT - padB;
    var ns = 'http://www.w3.org/2000/svg';
    function el(name, attrs){
      var e = document.createElementNS(ns, name);
      for (var k in attrs) e.setAttribute(k, attrs[k]);
      return e;
    }
    graphSvg.innerHTML = '';
    graphSvg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

    var defs = el('defs', {});
    var grad = el('linearGradient', { id:'gFill', x1:'0', y1:'0', x2:'0', y2:'1' });
    var s0 = el('stop', { offset:'0%', 'stop-color':'#e4e4e7', 'stop-opacity':'0.32' });
    var s1 = el('stop', { offset:'100%', 'stop-color':'#e4e4e7', 'stop-opacity':'0' });
    grad.appendChild(s0); grad.appendChild(s1);
    var clip = el('clipPath', { id:'gClip' });
    graphClip = el('rect', { id:'gClipRect', x:'0', y:'0', width:'0', height:String(H) });
    clip.appendChild(graphClip);
    defs.appendChild(grad); defs.appendChild(clip);
    graphSvg.appendChild(defs);

    for (var g = 0; g < 4; g++){
      var gy = padT + (innerH * g / 3);
      graphSvg.appendChild(el('line', { x1:padL, y1:gy, x2:W-padR, y2:gy, stroke:'#222226', 'stroke-width':'1' }));
    }

    graphPts = [];
    var pts = [];
    if (n <= 0) {
      pts = [[padL, padT+innerH], [W-padR, padT+innerH]];
    } else {
      for (var i = 0; i < n; i++){
        var x = padL + (n === 1 ? innerW / 2 : innerW * i / (n - 1));
        var y = padT + innerH * (1 - instrLevel(instructions[i]));
        graphPts.push({ x:x, y:y });
        pts.push([x, y]);
      }
    }
    var lineD = pts.map(function(p, i){ return (i ? 'L' : 'M') + p[0].toFixed(2) + ',' + p[1].toFixed(2); }).join(' ');
    var areaD = lineD + ' L' + pts[pts.length-1][0].toFixed(2) + ',' + (padT+innerH).toFixed(2) +
      ' L' + pts[0][0].toFixed(2) + ',' + (padT+innerH).toFixed(2) + ' Z';

    graphSvg.appendChild(el('path', { d:areaD, fill:'rgba(255,255,255,0.035)' }));
    graphSvg.appendChild(el('path', { d:lineD, fill:'none', stroke:'#3f3f46', 'stroke-width':'1.7', 'stroke-linejoin':'round', 'stroke-linecap':'round' }));

    var prog = el('g', { 'clip-path':'url(#gClip)' });
    prog.appendChild(el('path', { d:areaD, fill:'url(#gFill)' }));
    prog.appendChild(el('path', { d:lineD, fill:'none', stroke:'#e4e4e7', 'stroke-width':'2.25', 'stroke-linejoin':'round', 'stroke-linecap':'round' }));
    graphSvg.appendChild(prog);

    graphPts.forEach(function(p, i){
      graphSvg.appendChild(el('circle', { id:'gpt-'+i, cx:p.x, cy:p.y, r:'2.3', fill:'#3f3f46' }));
    });

    graphHead = el('circle', { id:'gHead', cx:padL, cy:padT+innerH, r:'4.6', fill:'#f4f4f5', stroke:'#09090b', 'stroke-width':'2', opacity:'0' });
    graphSvg.appendChild(graphHead);
  }

  function setGraphProgress(stepIndex, finished){
    var n = instructions.length;
    var W = 400, padL = 10, padR = 10, innerW = W - padL - padR;
    var frac = 0;
    if (n <= 0) frac = 0;
    else if (finished) frac = 1;
    else if (stepIndex < 0) frac = 0;
    else frac = n === 1 ? 1 : stepIndex / Math.max(1, n - 1);
    if (graphClip) graphClip.setAttribute('width', (padL + innerW * frac).toFixed(2));
    if (graphHead) {
      if (stepIndex < 0 || !graphPts.length) {
        graphHead.setAttribute('opacity', '0');
      } else {
        var idx = finished ? graphPts.length - 1 : Math.max(0, Math.min(graphPts.length - 1, stepIndex));
        graphHead.setAttribute('cx', graphPts[idx].x);
        graphHead.setAttribute('cy', graphPts[idx].y);
        graphHead.setAttribute('opacity', '1');
      }
    }
    for (var i = 0; i < graphPts.length; i++){
      var c = document.getElementById('gpt-' + i);
      if (!c) continue;
      if (finished || i < stepIndex) { c.setAttribute('fill', '#a1a1aa'); c.setAttribute('r', '2.5'); }
      else if (i === stepIndex) { c.setAttribute('fill', '#f4f4f5'); c.setAttribute('r', '3.3'); }
      else { c.setAttribute('fill', '#3f3f46'); c.setAttribute('r', '2.3'); }
    }
  }

  buildGraph();
  setGraphProgress(-1, false);

  function render(){
    Rig.setEyeAngle(state.eyeAngle);
    Rig.setBodyTurn(state.bodyTurn);
    Rig.setWalking(state.walking && !state.dancing && !state.emergencyStopped, state.walkDir);
    Rig.setDancing(state.dancing && !state.emergencyStopped);
    Rig.setStopped(state.emergencyStopped);

    flash.classList.toggle('show', state.emergencyStopped);
    stopchip.classList.toggle('show', state.emergencyStopped);
    badgeWalk.classList.toggle('show', state.walking && !state.emergencyStopped);
    badgeDance.classList.toggle('show', state.dancing && !state.emergencyStopped);
    badgeEstop.classList.toggle('show', state.emergencyStopped);

    var busy = state.walking || state.dancing;
    var mode = state.emergencyStopped ? 'stop' : (busy ? 'run' : 'idle');
    if (statusLed) statusLed.className = 'dot';
    if (statusText) statusText.textContent = state.emergencyStopped ? 'E-Stop' : (state.dancing ? 'Dancing' : state.walking ? 'Walking' : 'Idle');
    if (statusPill) statusPill.className = 'status' + (mode === 'stop' ? ' stop' : mode === 'run' ? ' run' : '');
    if (hbLed) {
      hbLed.className = 'pulse' + (state.emergencyStopped ? ' bad' : busy ? ' warn' : '');
    }

    stateEl.innerHTML =
      '<div class="telem-item"><span class="lbl">Eye angle</span><span class="val accent">' + state.eyeAngle + '°</span></div>' +
      '<div class="telem-item"><span class="lbl">Body turn</span><span class="val">' + Math.round(state.bodyTurn) + '°</span></div>' +
      '<div class="telem-item"><span class="lbl">Walking</span><span class="val ' + (state.walking?'good':'') + '">' + (state.walking?'YES':'no') + '</span></div>' +
      '<div class="telem-item"><span class="lbl">Dancing</span><span class="val ' + (state.dancing?'warn':'') + '">' + (state.dancing?'YES':'no') + '</span></div>' +
      '<div class="telem-item"><span class="lbl">E-Stop</span><span class="val ' + (state.emergencyStopped?'bad':'') + '">' + (state.emergencyStopped?'STOPPED':'clear') + '</span></div>' +
      '<div class="telem-item"><span class="lbl">Status</span><span class="val">' + (statusText ? statusText.textContent : (state.emergencyStopped ? 'E-Stop' : (state.dancing ? 'Dancing' : state.walking ? 'Walking' : 'Idle'))) + '</span></div>' +
      '<div class="telem-item wide"><span class="lbl">Last event</span><span class="val" style="font-size:12px">' + state.lastEvent + '</span></div>';

    lastEventBar.textContent = state.lastEvent;
  }

  function say(text, ms){
  bubble.textContent = text;
  bubble.classList.add('show');
  clearTimeout(bubbleTimer);

  // Estimate how long the speech will take (roughly 60ms per character)
  var estimatedMs = Math.max(ms || 2400, text.length * 60);

  bubbleTimer = setTimeout(function(){ bubble.classList.remove('show'); }, estimatedMs);

  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;      // slightly faster so it feels natural
    u.pitch = 1.0;
    u.volume = 1.0;
    window.speechSynthesis.speak(u);
  }

  // Return the estimated duration so the simulator can wait
  return estimatedMs;
}

  function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }
  function speedMultiplier(){ return parseFloat(speedInput.value); }

  function timedAction(fn, durationMs){
    clearTimeout(actionTimer);
    fn(true); render();
    actionTimer = setTimeout(function(){ fn(false); render(); }, Math.max(150, (durationMs || 600)) / speedMultiplier());
  }

  setInterval(function(){ if(hbLed) hbLed.style.opacity = hbLed.style.opacity === '0.3' ? '1' : '0.3'; }, 700);

  function apply(instr){
    if (instr.op === 'SLEEP') { state.lastEvent = 'WAIT ' + instr.ms + 'ms'; render(); return; }
if (instr.op === 'LOG') {
  state.lastEvent = 'PRINT';
  if (instr.message) say(instr.message);   // also speak PRINT text
  render();
  return;
}
    var cmd = instr.command, arg = instr.arg;
    state.lastEvent = cmd + (arg !== undefined ? ' ' + arg : '');

    switch (cmd) {
      case 'EYE_CENTER': state.eyeAngle = 90; break;
      case 'EYE_SET': if (typeof arg === 'number') state.eyeAngle = clamp(arg, 0, 180); break;
      case 'EYE_LEFT': state.eyeAngle = clamp(state.eyeAngle - (typeof arg === 'number' ? arg : 15), 0, 180); break;
      case 'EYE_RIGHT': state.eyeAngle = clamp(state.eyeAngle + (typeof arg === 'number' ? arg : 15), 0, 180); break;
      case 'EYE_TRACK_PERSON': if (typeof arg === 'number') state.eyeAngle = clamp(arg, 0, 180); break;

      case 'TURN_LEFT':
        state.bodyTurn -= 90;
        timedAction(function(on){}, typeof arg === 'number' ? arg : 600);
        break;
      case 'TURN_RIGHT':
        state.bodyTurn += 90;
        timedAction(function(on){}, typeof arg === 'number' ? arg : 600);
        break;
      case 'WALK_FORWARD':
        state.walkDir = 1;
        timedAction(function(on){ state.walking = on; }, typeof arg === 'number' ? arg : 800);
        break;
      case 'WALK_BACKWARD':
        // Turn 180 from current heading, then walk forward
        state.bodyTurn += 180;
        state.walkDir = 1;
        timedAction(function(on){ state.walking = on; }, typeof arg === 'number' ? arg : 800);
        break;
      case 'WALK_STOP': state.walking = false; state.dancing = false; stopMusic(); break;
      case 'DANCE': timedAction(function(on){ state.dancing = on; }, typeof arg === 'number' ? arg : 3000); break;

      case 'EMERGENCY_STOP': state.emergencyStopped = true; state.walking = false; state.dancing = false; stopMusic(); break;
      case 'EMERGENCY_CLEAR': state.emergencyStopped = false; break;

      case 'AUDIO_SPEAK': if (typeof arg === 'string') say(arg, Math.max(1200, arg.length * 65)); break;
      case 'PLAY_SONG_REQUEST':
      case 'PLAY_MUSIC':
        playMusic(arg);
        break;
      case 'STOP_MUSIC':
      case 'AUDIO_STOP':
        stopMusic();
        break;
      case 'FIND_PERSON': say('Looking for ' + (arg || 'someone') + '…'); break;
      default: break;
    }
    render();
  }

  function esc(v){
    return String(v).replace(/[&<>"']/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; });
  }
  // Build log rows (script text is user input: always escaped)
  function buildRows(){
    logEl.innerHTML = '';
    instructions.forEach(function(instr, i){
      var row = document.createElement('div');
      row.className = 'row';
      row.id = 'row-' + i;
      row.dataset.type = instr.op === 'SLEEP' ? 'wait' : instr.op === 'LOG' ? 'print' : 'cmd';
      if (instr.op === 'SLEEP') {
        row.innerHTML = "<span class='ln'>" + esc(instr.line) + "</span><span class='tag wait'>WAIT</span><span class='sleep'>" + esc(instr.ms) + " ms</span>";
      } else if (instr.op === 'LOG') {
        row.innerHTML = "<span class='ln'>" + esc(instr.line) + "</span><span class='tag print'>PRINT</span><span class='logmsg'>\"" + esc(instr.message||'') + "\"</span>";
      } else {
        row.innerHTML = "<span class='ln'>" + esc(instr.line) + "</span><span class='tag cmd'>CMD</span><span class='cmd'>" + esc(instr.command) + "</span>" +
          (instr.arg !== undefined ? " <span class='arg'>" + esc(JSON.stringify(instr.arg)) + "</span>" : "");
      }
      logEl.appendChild(row);
    });
  }

  // Log filters
  document.querySelectorAll('.filter').forEach(function(el){
    el.addEventListener('click', function(){
      document.querySelectorAll('.filter').forEach(function(f){ f.classList.remove('on'); });
      el.classList.add('on');
      logFilter = el.dataset.f;
      logEl.querySelectorAll('.row').forEach(function(r){
        r.style.display = (logFilter === 'all' || r.dataset.type === logFilter) ? '' : 'none';
      });
    });
  });

  var cursor = 0, playing = false, playTimer = null;

  function highlight(i){
    var prev = logEl.querySelector('.row.active');
    if (prev) { prev.classList.remove('active'); prev.classList.add('done'); }
    var row = document.getElementById('row-' + i);
    if (row) { row.classList.add('active'); row.classList.remove('done'); row.scrollIntoView({ block:'nearest' }); }
    document.dispatchEvent(new CustomEvent('vision-sim-step', { detail: { index: i, line: instructions[i] ? instructions[i].line : 0 } }));

    var done = Math.min(i + 1, instructions.length);
    var pct = instructions.length ? Math.round((done / instructions.length) * 100) : 0;
    if (done >= instructions.length) pct = 100;
    stepCur.textContent = done;
    stepPct.textContent = pct + '%';
    setGraphProgress(i, done >= instructions.length);
  }

  function stepOnce(){
    if (cursor >= instructions.length) { pause(); stepCur.textContent = instructions.length; stepPct.textContent = '100%'; setGraphProgress(instructions.length - 1, true); return false; }
    var instr = instructions[cursor];
    highlight(cursor);
    apply(instr);
    cursor++;
    return true;
  }

  function instructionDelay(instr){
    if (instr.op === 'SLEEP') return instr.ms / speedMultiplier();
    if (instr.op === 'LOG') return 350 / speedMultiplier();
    var cmd = instr.command;
    if (DURATIONAL.hasOwnProperty(cmd)) {
      return (typeof instr.arg === 'number' ? instr.arg : DURATIONAL[cmd]) / speedMultiplier();
    }
    if (cmd === 'AUDIO_SPEAK') {
  // Wait based on how long the text will take to speak
  var text = (typeof instr.arg === 'string') ? instr.arg : '';
  var speakMs = Math.max(1200, text.length * 65);   // ~65ms per character
  return speakMs / speedMultiplier();
}
if (cmd === 'PLAY_SONG_REQUEST' || cmd === 'PLAY_MUSIC') {
  var song = (typeof instr.arg === 'string') ? instr.arg : '';
  var musicMs = Math.max(1600, song.length * 55);
  return musicMs / speedMultiplier();
}
if (cmd === 'STOP_MUSIC' || cmd === 'AUDIO_STOP') return 300 / speedMultiplier();
if (cmd === 'FIND_PERSON') return 900 / speedMultiplier();
    return 350 / speedMultiplier();
  }

  function scheduleNext(){
    if (!playing) return;
    if (cursor >= instructions.length) { pause(); return; }
    var delay = instructionDelay(instructions[cursor]);
    stepOnce();
    playTimer = setTimeout(scheduleNext, delay);
  }

  function setPlayUI(isPlaying){
    var icoPlay = btnPlay.querySelector('.ico-play');
    var icoPause = btnPlay.querySelector('.ico-pause');
    var label = document.getElementById('playLabel');
    if (icoPlay) icoPlay.style.display = isPlaying ? 'none' : 'inline-block';
    if (icoPause) icoPause.style.display = isPlaying ? 'inline-block' : 'none';
    if (label) label.textContent = isPlaying ? 'Pause' : 'Play';
  }
  function play(){
    if (cursor >= instructions.length) reset();
    playing = true;
    setPlayUI(true);
    scheduleNext();
  }
  function pause(){
    playing = false;
    setPlayUI(false);
    clearTimeout(playTimer);
  }
  function reset(){
    pause();
    clearTimeout(actionTimer); clearTimeout(bubbleTimer);
    cursor = 0;
    Object.assign(state, { eyeAngle:90, bodyTurn:0, walking:false, walkDir:1, dancing:false, emergencyStopped:false, lastEvent:'—' });
    if (Rig.resetPosition) Rig.resetPosition();
    bubble.classList.remove('show');
    stepCur.textContent = '0';
    stepPct.textContent = '0%';
    setGraphProgress(-1, false);
    render();
    logEl.querySelectorAll('.row').forEach(function(r){ r.classList.remove('active','done'); });
    document.dispatchEvent(new CustomEvent('vision-sim-step', { detail: { index: -1, line: 0 } }));
  }

  btnPlay.addEventListener('click', function(){ playing ? pause() : play(); });
  btnStep.addEventListener('click', function(){ pause(); stepOnce(); });
  btnReset.addEventListener('click', reset);
  speedInput.addEventListener('input', function(){ speedVal.textContent = speedInput.value + '×'; });

  // Camera controls
  document.getElementById('btnCamReset').addEventListener('click', function(){ Rig.resetCamera(); });
  document.getElementById('btnCamFront').addEventListener('click', function(){ Rig.setView('front'); });
  document.getElementById('btnCamSide').addEventListener('click', function(){ Rig.setView('side'); });
  document.getElementById('btnCamTop').addEventListener('click', function(){ Rig.setView('top'); });

  // Keyboard
  window.addEventListener('keydown', function(e){
    var tg = e.target && e.target.tagName; if (tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT') return;
    if (e.code === 'Space'){ e.preventDefault(); playing ? pause() : play(); }
    else if (e.code === 'ArrowRight'){ e.preventDefault(); pause(); stepOnce(); }
    else if (e.code === 'KeyR' && !e.metaKey && !e.ctrlKey){ e.preventDefault(); reset(); }
  });

  // FPS + cam info
  Rig.onFps(function(fps){ fpsVal.textContent = fps; });
  Rig.onCam(function(v){
    camInfo.innerHTML = 'Cam <b>θ ' + (v.theta*180/Math.PI|0) + '° · φ ' + (v.phi*180/Math.PI|0) + '° · d ' + v.dist.toFixed(1) + '</b>';
  });

  render();

  // ---- public API for the page (editor / pipeline) -------------------------------------
  // load(program): swap in a freshly compiled program. program = { sourceName, instructions }.
  var listeners = { step: [] };
  function loadProgram(p){
    reset();
    program = p || { sourceName: 'untitled.vs', instructions: [] };
    instructions = program.instructions || [];
    document.getElementById('srcName').textContent = program.sourceName || 'untitled.vs';
    stepTotal.textContent = instructions.length;
    logCount.textContent = instructions.length + ' instr';
    buildRows();
    buildGraph();
    setGraphProgress(-1, false);
    // keep the active log filter applied
    var on = document.querySelector('.filter.on');
    if (on && on.dataset.f !== 'all') logEl.querySelectorAll('.row').forEach(function(r){ r.style.display = r.dataset.type === on.dataset.f ? '' : 'none'; });
    render();
  }
  window.VisionSim = {
    load: loadProgram,
    play: function(){ play(); },
    pause: function(){ pause(); },
    stopMusic: function(){ stopMusic(); },
    reset: function(){ reset(); },
    isPlaying: function(){ return playing; },
    count: function(){ return instructions.length; }
  };
  document.dispatchEvent(new CustomEvent('vision-sim-ready'));
})();
