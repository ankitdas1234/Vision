export const Rig = (function () {
    const mount = document.getElementById("stage3d");
    const loadingEl = document.getElementById("modelLoading");
    let scene, camera, renderer, root, model;
    let groundGrid = null, groundFloor = null, groundCell = 1;
    let radius = 1;
    let modelHeight = 1;
    const view = { theta: 0, phi: Math.PI * 0.31, dist: 3 };
    const target = new THREE.Vector3();
    let t = 0;
    const mode = { walking: false, walkDir: 1, dancing: false, stopped: false };
    let bodyTurnDeg = 0;
    let eyeAngleDeg = 90;
    let idleNudgeDeg = 0;
    const micro = { tilt: 0, yaw: 0, squash: 0, hop: 0, lean: 0 }; // tiny involuntary movements from the mind (blink, tilt, glance, startle)
    // body language set by the mind: slump = forward droop, breath = breathing rate/size, speed = walk speed, energy = dance size
    const posture = { slump: 0, breath: 0.45, speed: 1, energy: 1 };
    let slumpNow = 0;
    let turnDeg = 0; // smoothed heading that follows bodyTurnDeg
    const props = new Map();
    function parseOBJ(text) {
        const lines = text.split("\n");
        const positions = [];
        const colors = [];
        const faces = [];
        let hasColor = false;
        let sumX = 0, sumY = 0, sumZ = 0, n = 0;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.charCodeAt(0) === 118 && line.charCodeAt(1) === 32) {
                const p = line.trim().split(/\s+/);
                const vx = parseFloat(p[1]), vy = parseFloat(p[2]), vz = parseFloat(p[3]);
                positions.push(vx, vy, vz);
                sumX += vx;
                sumY += vy;
                sumZ += vz;
                n++;
                if (p.length >= 7) {
                    hasColor = true;
                    colors.push(parseFloat(p[4]), parseFloat(p[5]), parseFloat(p[6]));
                }
                else {
                    colors.push(0.75, 0.75, 0.75);
                }
            }
            else if (line.charCodeAt(0) === 102 && line.charCodeAt(1) === 32) {
                const f = line.trim().split(/\s+/);
                for (let k = 1; k < f.length; k++)
                    faces.push(parseInt(f[k].split("/")[0], 10) - 1);
            }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        if (hasColor)
            geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
        if (faces.length)
            geo.setIndex(faces);
        geo.computeVertexNormals();
        geo.computeBoundingBox();
        geo.computeBoundingSphere();
        return { geo, hasColor, centroid: n ? { x: sumX / n, y: sumY / n, z: sumZ / n } : { x: 0, y: 0, z: 0 } };
    }
    function updateCamera() {
        const midY = modelHeight * 0.5;
        // Keep the camera above the floor. Below it the (one-sided) floor vanishes and the sky shows where the floor should be.
        const minY = Math.max(0.05, modelHeight * 0.08), cMin = (minY - target.y - midY) / view.dist;
        if (cMin > -1) view.phi = Math.max(0.25, Math.min(view.phi, Math.acos(Math.min(1, cMin))));
        const x = target.x + view.dist * Math.sin(view.phi) * Math.sin(view.theta);
        const y = target.y + midY + view.dist * Math.cos(view.phi);
        const z = target.z + view.dist * Math.sin(view.phi) * Math.cos(view.theta);
        camera.position.set(x, y, z);
        camera.lookAt(target.x, target.y + midY, target.z);
    }
    function bindControls() {
        let dragging = false, lx = 0, ly = 0;
        function down(x, y) { dragging = true; lx = x; ly = y; mount.style.cursor = "grabbing"; }
        function move(x, y) {
            if (!dragging)
                return;
            const dx = x - lx, dy = y - ly;
            lx = x;
            ly = y;
            view.theta -= dx * 0.008;
            view.phi = Math.max(0.25, Math.min(Math.PI / 1.55, view.phi - dy * 0.008));
            updateCamera();
        }
        function up() { dragging = false; mount.style.cursor = "grab"; }
        mount.addEventListener("mousedown", (e) => down(e.clientX, e.clientY));
        window.addEventListener("mousemove", (e) => move(e.clientX, e.clientY));
        window.addEventListener("mouseup", up);
        mount.addEventListener("wheel", (e) => {
            e.preventDefault();
            view.dist = Math.max(radius * 0.55, Math.min(radius * 7, view.dist * (1 + e.deltaY * 0.001)));
            updateCamera();
        }, { passive: false });
        mount.addEventListener("touchstart", (e) => { if (e.touches.length === 1)
            down(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
        mount.addEventListener("touchmove", (e) => { if (e.touches.length === 1) {
            e.preventDefault();
            move(e.touches[0].clientX, e.touches[0].clientY);
        } }, { passive: false });
        mount.addEventListener("touchend", up);
    }
    function onResize() {
        if (!mount.clientWidth)
            return;
        camera.aspect = mount.clientWidth / mount.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(mount.clientWidth, mount.clientHeight);
    }
    // Grid made of short segments (4 units each). A single 80-unit line that passes behind the camera can be
    // dropped by some renderers while it is clipped, which left only one direction of lines visible.
    const FLOOR = new THREE.Color(0x080809);
    function makeGrid(size, divs, centerHex, lineHex) {
        const half = size / 2, step = size / divs, chunk = 4, pos = [], col = [];
        const c1 = new THREE.Color(centerHex), c2 = new THREE.Color(lineHex);
        for (let i = 0; i <= divs; i++) {
            const k = -half + i * step, c = i === divs / 2 ? c1 : c2;
            for (let a = -half; a < half - 1e-6; a += chunk) {
                const b = Math.min(half, a + chunk);
                const vs = [[a, k], [b, k], [k, a], [k, b]];
                for (const v of vs) {
                    pos.push(v[0], 0, v[1]);
                    // lines fade into the floor colour with distance, so the grid never ends in a visible edge or second line
                    const d = Math.hypot(v[0], v[1]), t = Math.min(1, Math.max(0, (d - 30) / 45)), f = t * t * (3 - 2 * t);
                    col.push(c.r + (FLOOR.r - c.r) * f, c.g + (FLOOR.g - c.g) * f, c.b + (FLOOR.b - c.b) * f);
                }
            }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
        const g = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, toneMapped: false }));
        g.frustumCulled = false;
        return g;
    }
    function updateInfiniteGround() {
        if (!groundGrid)
            return;
        const gx = Math.round(root.position.x / groundCell) * groundCell;
        const gz = Math.round(root.position.z / groundCell) * groundCell;
        groundGrid.position.x = gx;
        groundGrid.position.z = gz;
        if (groundFloor) {
            groundFloor.position.x = gx;
            groundFloor.position.z = gz;
        }
    }
    // ---- sky: the page behind the (transparent) 3D view is a CSS gradient. To keep the far end of the floor from showing as a black
    // strip under it, the 3D scene gets fog in the gradient's bottom colour (the colour at the horizon), and the page is told where
    // the horizon is on screen (--horizon) so the gradient reaches that colour exactly there.
    const skyCol = new THREE.Color(0x1b2236);
    const horizonV = new THREE.Vector3();
    let lastHorizon = -1;
    function setSky(cssColor) { skyCol.set(cssColor); }
    function updateHorizon() {
        const dx = target.x - camera.position.x, dz = target.z - camera.position.z, len = Math.hypot(dx, dz) || 1;
        horizonV.set(camera.position.x + (dx / len) * 1000, camera.position.y, camera.position.z + (dz / len) * 1000).project(camera);
        const pct = Math.max(0, Math.min(100, (1 - horizonV.y) * 50));
        if (Math.abs(pct - lastHorizon) > 0.2) {
            lastHorizon = pct;
            mount.parentElement?.style.setProperty("--horizon", pct.toFixed(1) + "%");
        }
    }
    let lastNow = 0;
    function loop(now) {
        requestAnimationFrame(loop);
        // Everything below is scaled by real elapsed time (k = 1 is one 60 fps frame), so a slow or lagging machine
        // still walks at the right speed instead of crawling, and a 120 Hz screen no longer runs double speed.
        const k = lastNow && now ? Math.max(0.25, Math.min(6, (now - lastNow) / 16.667)) : 1;
        lastNow = now || 0;
        t += 0.016 * k;
        const dTurn = ((bodyTurnDeg - turnDeg + 540) % 360) - 180;
        turnDeg += Math.max(-7 * k, Math.min(7 * k, dTurn));
        if (model && !mode.stopped) {
            let bob = 0, sway = 0, lean = 0;
            slumpNow += (posture.slump - slumpNow) * (1 - Math.pow(0.97, k)); // ease into a posture instead of snapping
            if (mode.dancing) {
                const beat = t * 6.2;
                const half = t * 3.1;
                const double = t * 12.4;
                const bounce = Math.abs(Math.sin(beat));
                bob = (0.55 * bounce + 0.25 * Math.abs(Math.sin(double)) + 0.12) * radius * 0.11;
                sway = Math.sin(beat) * 0.28 + Math.sin(half) * 0.10;
                lean = Math.sin(half * 1.15) * 0.14 + Math.sin(double) * 0.04;
                const danceYaw = Math.sin(beat * 0.5) * 0.18 + Math.sin(double) * 0.05;
                bob *= posture.energy;
                sway *= posture.energy;
                lean *= posture.energy;
                root.position.x += Math.sin(half) * radius * 0.006 * k;
                root.position.z += Math.cos(half * 1.3) * radius * 0.005 * k;
                const eyeYaw = ((eyeAngleDeg + idleNudgeDeg - 90) / 90) * 0.28;
                root.rotation.y = Math.PI + (turnDeg * Math.PI) / 180 + danceYaw + eyeYaw * 0.25;
            }
            else if (mode.walking) {
                const step = t * 5.2;
                const stepSin = Math.sin(step);
                const stepAbs = Math.abs(stepSin);
                bob = Math.pow(stepAbs, 0.65) * radius * 0.13;
                sway = stepSin * 0.20;
                lean = Math.cos(step) * 0.10;
                const yaw = (turnDeg * Math.PI) / 180;
                const speed = radius * (0.038 + 0.012 * stepAbs) * mode.walkDir * posture.speed;
                root.position.x += (Math.sin(yaw) * speed + Math.cos(yaw) * stepSin * radius * 0.008) * k;
                root.position.z += (Math.cos(yaw) * speed - Math.sin(yaw) * stepSin * radius * 0.008) * k;
                const eyeYaw = ((eyeAngleDeg + idleNudgeDeg - 90) / 90) * 0.28;
                const walkYawWiggle = stepSin * 0.09;
                root.rotation.y = Math.PI + (turnDeg * Math.PI) / 180 + eyeYaw * 0.4 + walkYawWiggle;
            }
            else {
                const eyeYaw = ((eyeAngleDeg + idleNudgeDeg - 90) / 90) * 0.28;
                root.rotation.y = Math.PI + (turnDeg * Math.PI) / 180 + eyeYaw * 0.4;
            }
            if (!mode.dancing && !mode.walking) {
                // breathing: slow when calm or sleepy, quicker when excited or afraid
                const br = Math.sin(t * (1.1 + posture.breath * 2.2));
                bob += (0.5 + posture.breath) * radius * 0.006 * (br * 0.5 + 0.5);
                sway += br * 0.004 * (0.5 + posture.breath);
            }
            root.rotation.z = sway + micro.tilt;
            root.rotation.y += micro.yaw;
            root.rotation.x = lean + slumpNow + micro.lean;
            root.position.y = bob + micro.hop * radius;
            root.scale.y = 1 - micro.squash;
            target.x = root.position.x;
            target.z = root.position.z;
            updateInfiniteGround();
            updateCamera();
        }
        else if (model && mode.stopped) {
            root.rotation.z *= Math.pow(0.9, k);
            root.rotation.x *= Math.pow(0.9, k);
            root.position.y *= Math.pow(0.85, k);
            root.scale.y = 1;
        }
        for (const p of pulses) {
            if (!p.grp.parent)
                continue;
            const k = Math.sin(t * 2.2 + p.phase);
            if (p.soft)
                p.glow.material.opacity = p.base * (0.75 + 0.25 * k);
            else {
                p.ring.material.opacity = 0.45 + 0.25 * k;
                p.glow.material.opacity = 0.07 + 0.05 * k;
                p.grp.scale.setScalar(1 + 0.04 * k);
            }
        }
        updateHorizon();
        renderer.render(scene, camera);
    }
    async function init() {
        scene = new THREE.Scene();
        scene.background = null;
        camera = new THREE.PerspectiveCamera(40, mount.clientWidth / mount.clientHeight, 0.05, 6000);
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); // 2x costs ~80 % more pixels for little visible gain
        renderer.setSize(mount.clientWidth, mount.clientHeight);
        mount.appendChild(renderer.domElement);
        scene.add(new THREE.AmbientLight(0xffffff, 0.55));
        const key = new THREE.DirectionalLight(0xffffff, 1.05);
        key.position.set(2.2, 4.2, 3);
        scene.add(key);
        const rim = new THREE.DirectionalLight(0xaaaaaa, 0.35);
        rim.position.set(-3, 1.2, -2.2);
        scene.add(rim);
        const fill = new THREE.DirectionalLight(0xffffff, 0.25);
        fill.position.set(0, -1, 2);
        scene.add(fill);
        root = new THREE.Group();
        scene.add(root);
        try {
            const res = await fetch("../assets/model/robot.obj");
            if (!res.ok)
                throw new Error("model fetch failed: " + res.status);
            const raw = await res.text();
            const parsed = parseOBJ(raw);
            const mat = new THREE.MeshStandardMaterial({
                vertexColors: parsed.hasColor,
                color: parsed.hasColor ? 0xffffff : 0xaab0bb,
                metalness: 0.08,
                roughness: 0.72,
                side: THREE.DoubleSide,
            });
            model = new THREE.Mesh(parsed.geo, mat);
            const s = new THREE.Vector3();
            parsed.geo.boundingBox.getSize(s);
            radius = parsed.geo.boundingSphere.radius || Math.max(s.x, s.y, s.z) || 1;
            model.position.set(-parsed.centroid.x, -parsed.geo.boundingBox.min.y, -parsed.centroid.z);
            root.add(model);
            const gridSize = 160, gridDivs = 160; // the grid reaches past where the fog hides it, so it never just stops
            groundCell = gridSize / gridDivs;
            const grid = makeGrid(gridSize, gridDivs, 0x55555f, 0x2e2e36);
            const mats = Array.isArray(grid.material) ? grid.material : [grid.material];
            mats.forEach((m) => { m.transparent = true; m.opacity = 0.9; m.depthWrite = false; });
            scene.add(grid);
            groundGrid = grid;
            const floorGeo = new THREE.PlaneGeometry(4000, 4000);
            floorGeo.rotateX(-Math.PI / 2);
            const floorMat = new THREE.MeshBasicMaterial({ color: 0x080809, depthWrite: false, side: THREE.DoubleSide }); // double-sided: never see through it
            const floorMesh = new THREE.Mesh(floorGeo, floorMat);
            floorMesh.position.y = -0.01;
            floorMesh.renderOrder = -2;
            grid.renderOrder = -1; // floor first, then the grid lines on top of it
            scene.add(floorMesh);
            groundFloor = floorMesh;
            modelHeight = s.y;
            view.theta = 0;
            view.phi = Math.PI * 0.36; // slightly above the horizon so the floor reads as a grid, not a line
            view.dist = radius / Math.sin(((camera.fov * Math.PI) / 180) / 2) * 1.8;
            loadingEl.style.display = "none";
        }
        catch (e) {
            loadingEl.textContent = "Could not load 3D model";
            console.error(e);
            throw e;
        }
        updateCamera();
        bindControls();
        window.addEventListener("resize", onResize);
        // The 3D view must also follow its own box: it changes height when the shell's notice bar appears or goes away, which is NOT a window resize
        // (a stale size left a strip of sky colour along the bottom).
        if (typeof ResizeObserver !== "undefined")
            new ResizeObserver(onResize).observe(mount);
        requestAnimationFrame(loop);
    }
    function addProp({ id, kind, x, z, color = 0xffffff, radius = 1 }) {
        let mesh;
        if (kind === "charger") {
            mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.4, radius * 1.4, radius * 0.06, 32), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.55 }));
            mesh.position.set(x, radius * 0.03, z);
        }
        else if (kind === "toy") {
            mesh = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.35, 24, 16), new THREE.MeshStandardMaterial({ color, roughness: 0.4 }));
            mesh.position.set(x, radius * 0.35, z);
        }
        else {
            const g = new THREE.RingGeometry(radius * 0.995, radius, 128);
            g.rotateX(-Math.PI / 2);
            mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
            mesh.position.set(x, 0.01, z);
        }
        scene.add(mesh);
        props.set(id, mesh);
    }
    // Load a GLB/glTF model as scenery. size is in robot-sizes; resolves with its footprint radius (world units).
    function addModel({ id, url, x, z, size = 3, rotY = 0 }) {
        return new Promise((resolve, reject) => {
            if (!THREE.GLTFLoader)
                return reject(new Error("GLTFLoader script not loaded"));
            new THREE.GLTFLoader().load(url, (gltf) => {
                const obj = gltf.scene;
                const box = new THREE.Box3().setFromObject(obj);
                const dim = box.getSize(new THREE.Vector3());
                obj.scale.setScalar((size * radius) / Math.max(dim.x, dim.y, dim.z));
                box.setFromObject(obj);
                const d2 = box.getSize(new THREE.Vector3());
                obj.position.set(x, -box.min.y, z);
                obj.rotation.y = rotY;
                scene.add(obj);
                props.set(id, obj);
                resolve({ radius: Math.max(d2.x, d2.z) / 2 });
            }, undefined, reject);
        });
    }
    // Add a simple built-in 3D shape as scenery (no model file needed). size is in robot-sizes; resolves with its footprint radius.
    function addShape({ id, shape = "box", x, z, size = 2, color = 0x94a3b8, rotY = 0 }) {
        const h = size * radius, r = h / 2;
        let geo, y = h / 2;
        if (shape === "cylinder")
            geo = new THREE.CylinderGeometry(r, r, h, 32);
        else if (shape === "sphere")
            geo = new THREE.SphereGeometry(r, 32, 20);
        else if (shape === "cone")
            geo = new THREE.ConeGeometry(r, h, 32);
        else
            geo = new THREE.BoxGeometry(h, h, h);
        const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1 }));
        mesh.position.set(x, y, z);
        mesh.rotation.y = rotY;
        scene.add(mesh);
        props.set(id, mesh);
        return Promise.resolve({ radius: shape === "box" ? (h * Math.SQRT2) / 2 : r });
    }
    const pulses = [];
    /** A glowing ring on the ground that gently pulses (the charger). */
    function addRing({ id, x, z, r = 3, color = 0x22c55e }) {
        const grp = new THREE.Group();
        const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.82, r, 64), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
        const glow = new THREE.Mesh(new THREE.CircleGeometry(r * 0.82, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, depthWrite: false }));
        for (const m of [ring, glow]) {
            m.rotation.x = -Math.PI / 2;
            grp.add(m);
        }
        grp.position.set(x, 0.04, z);
        scene.add(grp);
        props.set(id, grp);
        pulses.push({ grp, ring, glow, phase: Math.random() * 6 });
    }
    /** A flat coloured disc on the ground (hot / cold zones). */
    function addDisc({ id, x, z, r = 5, color = 0xff6b35, opacity = 0.28 }) {
        const m = new THREE.Mesh(new THREE.CircleGeometry(r, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
        m.rotation.x = -Math.PI / 2;
        m.position.set(x, 0.03, z);
        scene.add(m);
        props.set(id, m);
        pulses.push({ grp: m, glow: m, base: opacity, phase: Math.random() * 6, soft: true });
    }
    function removeProp(id) { const m = props.get(id); if (m) {
        scene.remove(m);
        props.delete(id);
    } }
    const ready = init();
    return {
        ready,
        setEyeAngle: (deg) => { eyeAngleDeg = deg; },
        setIdleNudge: (deg) => { idleNudgeDeg = deg; },
        setMicro: (m) => { Object.assign(micro, m); },
        isDancing: () => !!mode.dancing,
        setPosture: (p) => { Object.assign(posture, p); },
        setBodyTurn: (deg) => { bodyTurnDeg = deg; },
        setWalking: (v, dir = 1) => { mode.walking = !!v; mode.walkDir = dir >= 0 ? 1 : -1; },
        setDancing: (v) => { mode.dancing = v; },
        setStopped: (v) => { mode.stopped = v; },
        getEyeAngle: () => eyeAngleDeg,
        getBodyTurn: () => bodyTurnDeg,
        getTurnDeg: () => turnDeg,
        getPosition: () => ({ x: root ? root.position.x : 0, z: root ? root.position.z : 0, unit: radius }),
        setPosition: (x, z) => { if (root) {
            root.position.x = x;
            root.position.z = z;
        } },
        isWalking: () => mode.walking,
        /** Turn the robot to face the 3D view camera (the screen / viewer). */
        faceViewer: () => {
            bodyTurnDeg = (view.theta * 180) / Math.PI;
        },
        getViewThetaDeg: () => (view.theta * 180) / Math.PI,
        addProp,
        addModel,
        setSky,
        addShape,
        removeProp,
        addDisc,
        addRing,
    };
})();
