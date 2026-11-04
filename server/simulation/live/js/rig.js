/**
 * RIG — the 3D body of Vision in the simulator.
 *
 * This is a PURE RENDERER. It computes no robot behaviour of its own: every
 * frame it draws whatever the server's virtual robot (server/src/robot/
 * SimulatedRobot.ts) last reported — body pose, head angle, leg servo
 * speeds, ultrasonic distance — via Rig.applyState().
 *
 * The robot model is ONE merged mesh (assets/model/robot.obj), so at load it
 * is split into three rigid parts by triangle position, matching the three
 * real servos:
 *
 *    head      everything above the leg stubs. Pivots about the vertical axis
 *              = servo CH0 (0-180 deg, 90 = straight ahead): a full 180 deg
 *              field of view, like a human turning their head. The camera and
 *              the ultrasonic sensor are on it, so the sensor beam drawn in
 *              the scene swings with the head.
 *    left leg  swings about the hip = servo CH1  (continuous rotation)
 *    right leg swings about the hip = servo CH2  (continuous rotation)
 *
 * Conventions (shared with SimulatedRobot.ts):
 *    heading 0 = facing +z, increases when turning RIGHT (clockwise from above)
 *    forward = (-sin(heading), +cos(heading)) in (x, z)
 *    model front is -z in the raw OBJ; the robot's right side is +x
 */
export const Rig = (function () {
  const mount = document.getElementById("stage3d");
  const loadingEl = document.getElementById("modelLoading");

  // Fraction of the model's height at which the leg stubs end and the head
  // body begins (measured on the supplied robot.obj: leg stubs top out at ~27%).
  const LEG_CUT_FRAC = 0.267;
  // Real robot is roughly this wide; sets how many scene units one metre is.
  const ROBOT_WIDTH_M = 0.2;
  const LEG_SWING_RAD = 0.5;     // peak hip swing at full leg speed
  const GAIT_HZ = 1.6;           // gait cycles per second at full leg speed

  let scene, camera, renderer, root, placed;
  let headPivot, legPivotL, legPivotR, sensor, sensorMat, mat;
  let groundGrid = null, groundFloor = null, groundCell = 1;
  let radius = 1, modelHeight = 1, unitsPerMeter = 8;
  let ready_ = false;
  const view = { theta: 0, phi: Math.PI * 0.31, dist: 3 };
  const camTarget = new THREE.Vector3();

  // What the server last told us (targets), and what we're currently drawing.
  const tgt = { x: 0, z: 0, heading: 0, head: 90, l: 0, r: 0, ultraMm: 2000, stopped: false };
  const cur = { heading: 0, headYaw: 0, ampL: 0, ampR: 0, phaseL: 0, phaseR: Math.PI };
  let idleNudgeDeg = 0;
  let lastFrame = performance.now();

  const rad = (d) => (d * Math.PI) / 180;
  const shortestAngleDiff = (from, to) => ((((to - from) % 360) + 540) % 360) - 180;

  function parseOBJ(text) {
    const lines = text.split("\n");
    const positions = [], colors = [], faces = [];
    let hasColor = false;
    let sumX = 0, sumY = 0, sumZ = 0, n = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.charCodeAt(0) === 118 && line.charCodeAt(1) === 32) {
        const p = line.trim().split(/\s+/);
        const vx = parseFloat(p[1]), vy = parseFloat(p[2]), vz = parseFloat(p[3]);
        positions.push(vx, vy, vz);
        sumX += vx; sumY += vy; sumZ += vz; n++;
        if (p.length >= 7) { hasColor = true; colors.push(parseFloat(p[4]), parseFloat(p[5]), parseFloat(p[6])); }
        else colors.push(0.75, 0.75, 0.75);
      } else if (line.charCodeAt(0) === 102 && line.charCodeAt(1) === 32) {
        const f = line.trim().split(/\s+/);
        for (let k = 1; k < f.length; k++) faces.push(parseInt(f[k].split("/")[0], 10) - 1);
      }
    }
    return { positions, colors, faces, hasColor, centroid: n ? { x: sumX / n, y: sumY / n, z: sumZ / n } : { x: 0, y: 0, z: 0 } };
  }

  /** Splits triangles into head / left leg / right leg by where each triangle sits. */
  function splitFaces(positions, faces, cutY) {
    const head = [], left = [], right = [];
    for (let i = 0; i < faces.length; i += 3) {
      const a = faces[i], b = faces[i + 1], c = faces[i + 2];
      const cy = (positions[a * 3 + 1] + positions[b * 3 + 1] + positions[c * 3 + 1]) / 3;
      if (cy >= cutY) { head.push(a, b, c); continue; }
      const cx = (positions[a * 3] + positions[b * 3] + positions[c * 3]) / 3;
      (cx < 0 ? left : right).push(a, b, c); // robot's left = -x (its front is -z, right is +x)
    }
    return { head, left, right };
  }

  function boundsOf(positions, indices) {
    const b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
    for (let i = 0; i < indices.length; i++) {
      const v = indices[i] * 3;
      const x = positions[v], y = positions[v + 1], z = positions[v + 2];
      if (x < b.minX) b.minX = x; if (x > b.maxX) b.maxX = x;
      if (y < b.minY) b.minY = y; if (y > b.maxY) b.maxY = y;
      if (z < b.minZ) b.minZ = z; if (z > b.maxZ) b.maxZ = z;
    }
    return b;
  }

  function partMesh(full, indices, material) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", full.getAttribute("position"));   // shared with the other parts
    geo.setAttribute("normal", full.getAttribute("normal"));       // smooth normals computed once on the whole mesh
    if (full.getAttribute("color")) geo.setAttribute("color", full.getAttribute("color"));
    geo.setIndex(indices);
    return new THREE.Mesh(geo, material);
  }

  function updateCamera() {
    const midY = modelHeight * 0.5;
    const x = camTarget.x + view.dist * Math.sin(view.phi) * Math.sin(view.theta);
    const y = camTarget.y + midY + view.dist * Math.cos(view.phi);
    const z = camTarget.z + view.dist * Math.sin(view.phi) * Math.cos(view.theta);
    camera.position.set(x, y, z);
    camera.lookAt(camTarget.x, camTarget.y + midY, camTarget.z);
  }

  function bindControls() {
    let dragging = false, lx = 0, ly = 0;
    const down = (x, y) => { dragging = true; lx = x; ly = y; mount.style.cursor = "grabbing"; };
    const move = (x, y) => {
      if (!dragging) return;
      const dx = x - lx, dy = y - ly; lx = x; ly = y;
      view.theta -= dx * 0.008;
      view.phi = Math.max(0.25, Math.min(Math.PI / 1.55, view.phi - dy * 0.008));
      updateCamera();
    };
    const up = () => { dragging = false; mount.style.cursor = "grab"; };
    mount.addEventListener("mousedown", (e) => down(e.clientX, e.clientY));
    window.addEventListener("mousemove", (e) => move(e.clientX, e.clientY));
    window.addEventListener("mouseup", up);
    mount.addEventListener("wheel", (e) => {
      e.preventDefault();
      view.dist = Math.max(radius * 0.55, Math.min(radius * 7, view.dist * (1 + e.deltaY * 0.001)));
      updateCamera();
    }, { passive: false });
    mount.addEventListener("touchstart", (e) => { if (e.touches.length === 1) down(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
    mount.addEventListener("touchmove", (e) => { if (e.touches.length === 1) { e.preventDefault(); move(e.touches[0].clientX, e.touches[0].clientY); } }, { passive: false });
    mount.addEventListener("touchend", up);
  }

  function onResize() {
    if (!mount.clientWidth) return;
    camera.aspect = mount.clientWidth / mount.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(mount.clientWidth, mount.clientHeight);
  }

  function updateInfiniteGround() {
    if (!groundGrid) return;
    const gx = Math.round(root.position.x / groundCell) * groundCell;
    const gz = Math.round(root.position.z / groundCell) * groundCell;
    groundGrid.position.x = gx; groundGrid.position.z = gz;
    if (groundFloor) { groundFloor.position.x = gx; groundFloor.position.z = gz; }
  }

  /** Ultrasonic beam: green when clear, amber when close, red when about to stop. */
  function updateSensorBeam() {
    const mm = tgt.ultraMm;
    const lengthM = Math.min(Math.max(mm, 0), 2000) / 1000;
    sensor.scale.set(1, 1, Math.max(0.02, lengthM * unitsPerMeter));
    sensorMat.color.set(mm <= 150 ? 0xef4444 : mm <= 600 ? 0xeab308 : 0x22c55e);
  }

  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    if (!ready_) { renderer.render(scene, camera); return; }

    // ---- body pose (smoothly follows the server's 20 Hz updates) ----
    const k = Math.min(1, dt * 14);
    root.position.x += (tgt.x - root.position.x) * k;
    root.position.z += (tgt.z - root.position.z) * k;
    cur.heading += shortestAngleDiff(cur.heading, tgt.heading) * k;
    root.rotation.y = Math.PI - rad(cur.heading); // model front is -z; see header for the convention

    // ---- head servo (CH0): 90 = straight ahead, <90 looks left, >90 looks right ----
    const wantYaw = -rad(tgt.head - 90) + rad(idleNudgeDeg);
    cur.headYaw += (wantYaw - cur.headYaw) * Math.min(1, dt * 22);
    headPivot.rotation.y = cur.headYaw;

    // ---- leg servos (CH1, CH2): hip swing whose rate follows the servo speed & direction ----
    const ampTargetL = Math.min(1, Math.abs(tgt.l)) * LEG_SWING_RAD;
    const ampTargetR = Math.min(1, Math.abs(tgt.r)) * LEG_SWING_RAD;
    cur.ampL += (ampTargetL - cur.ampL) * Math.min(1, dt * 8);
    cur.ampR += (ampTargetR - cur.ampR) * Math.min(1, dt * 8);
    cur.phaseL += tgt.l * dt * Math.PI * 2 * GAIT_HZ;
    cur.phaseR += tgt.r * dt * Math.PI * 2 * GAIT_HZ;
    legPivotL.rotation.x = cur.ampL * Math.sin(cur.phaseL);
    legPivotR.rotation.x = cur.ampR * Math.sin(cur.phaseR);

    // little bounce while stepping
    const stepping = (cur.ampL + cur.ampR) / (2 * LEG_SWING_RAD);
    root.position.y = Math.abs(Math.sin(cur.phaseL)) * radius * 0.05 * stepping;

    mat.emissive.setHex(tgt.stopped ? 0x3a0606 : 0x000000);

    camTarget.x = root.position.x;
    camTarget.z = root.position.z;
    updateInfiniteGround();
    updateCamera();
    renderer.render(scene, camera);
  }

  async function init() {
    scene = new THREE.Scene();
    scene.background = null;
    camera = new THREE.PerspectiveCamera(40, mount.clientWidth / mount.clientHeight, 0.01, 200);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.05); key.position.set(2.2, 4.2, 3); scene.add(key);
    const rim = new THREE.DirectionalLight(0xaaaaaa, 0.35); rim.position.set(-3, 1.2, -2.2); scene.add(rim);
    const fill = new THREE.DirectionalLight(0xffffff, 0.25); fill.position.set(0, -1, 2); scene.add(fill);

    root = new THREE.Group();
    scene.add(root);

    try {
      const res = await fetch("../assets/model/robot.obj");
      if (!res.ok) throw new Error("model fetch failed: " + res.status);
      const parsed = parseOBJ(await res.text());
      const { positions, colors, faces, hasColor, centroid } = parsed;

      // One geometry for the whole mesh so normals are smooth across the split.
      const full = new THREE.BufferGeometry();
      full.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      if (hasColor) full.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      full.setIndex(faces);
      full.computeVertexNormals();
      full.computeBoundingBox();
      full.computeBoundingSphere();

      const bb = full.boundingBox;
      const size = new THREE.Vector3(); bb.getSize(size);
      radius = full.boundingSphere.radius || Math.max(size.x, size.y, size.z) || 1;
      modelHeight = size.y;
      unitsPerMeter = size.x / ROBOT_WIDTH_M;

      mat = new THREE.MeshStandardMaterial({
        vertexColors: hasColor, color: hasColor ? 0xffffff : 0xaab0bb,
        metalness: 0.08, roughness: 0.72, side: THREE.DoubleSide, emissive: 0x000000,
      });

      // ---- split into head + two legs ----
      const cutY = bb.min.y + size.y * LEG_CUT_FRAC;
      const parts = splitFaces(positions, faces, cutY);
      const hb = boundsOf(positions, parts.head);
      const lb = boundsOf(positions, parts.left);
      const rb = boundsOf(positions, parts.right);

      // Raw-model pivots: head turns about the vertical axis through its middle; each leg swings about its hip.
      const headPiv = new THREE.Vector3((hb.minX + hb.maxX) / 2, 0, (hb.minZ + hb.maxZ) / 2);
      const hipL = new THREE.Vector3((lb.minX + lb.maxX) / 2, cutY, (lb.minZ + lb.maxZ) / 2);
      const hipR = new THREE.Vector3((rb.minX + rb.maxX) / 2, cutY, (rb.minZ + rb.maxZ) / 2);

      // "placed" recreates the original model placement (centred, feet on the ground).
      placed = new THREE.Group();
      placed.position.set(-centroid.x, -bb.min.y, -centroid.z);
      root.add(placed);

      const mk = (pivot, indices) => {
        const g = new THREE.Group();
        g.position.copy(pivot);
        const mesh = partMesh(full, indices, mat);
        mesh.position.set(-pivot.x, -pivot.y, -pivot.z);
        g.add(mesh);
        placed.add(g);
        return g;
      };
      headPivot = mk(headPiv, parts.head);
      legPivotL = mk(hipL, parts.left);
      legPivotR = mk(hipR, parts.right);

      // ---- ultrasonic beam: rides on the head, pointing out of its front (-z) ----
      sensorMat = new THREE.LineBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.85 });
      const beamGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
      sensor = new THREE.Line(beamGeo, sensorMat);
      sensor.position.set(0, bb.min.y + size.y * 0.62 - headPiv.y, hb.minZ - headPiv.z);
      headPivot.add(sensor);

      // ---- ground ----
      const gridSize = 80, gridDivs = 80;
      groundCell = gridSize / gridDivs;
      const grid = new THREE.GridHelper(gridSize, gridDivs, 0x2e2e32, 0x18181a);
      (Array.isArray(grid.material) ? grid.material : [grid.material]).forEach((m) => { m.transparent = true; m.opacity = 0.9; m.depthWrite = false; });
      scene.add(grid); groundGrid = grid;
      const floorGeo = new THREE.PlaneGeometry(gridSize * 2, gridSize * 2); floorGeo.rotateX(-Math.PI / 2);
      const floorMesh = new THREE.Mesh(floorGeo, new THREE.MeshBasicMaterial({ color: 0x080809, transparent: true, opacity: 0.92, depthWrite: false }));
      floorMesh.position.y = -0.01; scene.add(floorMesh); groundFloor = floorMesh;

      view.theta = 0; view.phi = Math.PI * 0.45;
      view.dist = radius / Math.sin(((camera.fov * Math.PI) / 180) / 2) * 1.8;
      loadingEl.style.display = "none";
      ready_ = true;
    } catch (e) {
      loadingEl.textContent = "Could not load 3D model";
      console.error(e);
      throw e;
    }

    updateCamera();
    bindControls();
    window.addEventListener("resize", onResize);
    requestAnimationFrame(loop);
  }

  const ready = init();

  const signed = (leg) => (leg && leg.direction === "FORWARD" ? 1 : leg && leg.direction === "REVERSE" ? -1 : 0) * ((leg ? leg.speed : 0) / 100);

  return {
    ready,
    /** Feed the server's virtual-robot snapshot (SimulatedRobot.snapshot()). */
    applyState(s) {
      if (!s) return;
      if (s.pose) {
        tgt.x = s.pose.x * unitsPerMeter;
        tgt.z = s.pose.z * unitsPerMeter;
        tgt.heading = s.pose.headingDeg;
      }
      tgt.head = typeof s.headPhysicalAngle === "number" ? s.headPhysicalAngle : s.headAngle ?? 90;
      tgt.l = signed(s.leftLeg);
      tgt.r = signed(s.rightLeg);
      if (typeof s.ultrasonicMm === "number") {
        tgt.ultraMm = s.ultrasonicMm;
        if (ready_) updateSensorBeam();
      }
      tgt.stopped = !!s.emergencyStopped;
    },
    /** Cosmetic only: small head wobble while the user is talking ("attentive listening"). */
    setIdleNudge: (deg) => { idleNudgeDeg = deg; },
  };
})();
