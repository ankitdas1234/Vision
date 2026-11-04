export class WeatherFx {
    cv;
    g;
    kind = "clear";
    daylight = 1;
    drops = Array.from({ length: 220 }, () => ({ x: Math.random(), y: Math.random(), v: 0.7 + Math.random() * 0.9 }));
    stars = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random() * 0.45, r: 0.4 + Math.random() * 1.2, p: Math.random() * 6 }));
    clouds = Array.from({ length: 7 }, () => ({ x: Math.random(), y: 0.04 + Math.random() * 0.22, w: 0.18 + Math.random() * 0.2, v: 0.004 + Math.random() * 0.008, a: 0.5 + Math.random() * 0.5 }));
    flash = 0;
    nextFlash = 3;
    t = 0;
    constructor(cv) {
        this.cv = cv;
        this.g = cv.getContext("2d");
    }
    set(kind, daylight) { this.kind = kind; this.daylight = daylight; }
    /** Is anything drawn at all? Clear daytime sky draws nothing, so the page can skip the work. */
    get active() { return this.kind !== "clear" || this.daylight < 0.45; }
    clear() { this.g.clearRect(0, 0, this.cv.width, this.cv.height); }
    frame(dt) {
        this.t += dt;
        const cv = this.cv, g = this.g, w = cv.clientWidth, h = cv.clientHeight;
        if (cv.width !== w || cv.height !== h) {
            cv.width = w;
            cv.height = h;
        }
        else
            g.clearRect(0, 0, w, h); // resizing a canvas every frame is slow: only when it changed
        if (!w || !h)
            return;
        const night = 1 - this.daylight;
        // stars (not in a storm: the clouds hide them)
        if (night > 0.35 && this.kind !== "storm" && this.kind !== "rain") {
            const k = Math.min(1, (night - 0.35) * 2);
            for (const s of this.stars) {
                g.fillStyle = `rgba(255,255,255,${(0.25 + 0.5 * Math.abs(Math.sin(this.t * 0.8 + s.p))) * k})`;
                g.beginPath();
                g.arc(s.x * w, s.y * h, s.r, 0, 6.2832);
                g.fill();
            }
        }
        // clouds: soft overlapping blobs, darker and denser the worse the weather
        const cover = this.kind === "cloudy" ? 0.55 : this.kind === "rain" ? 0.8 : this.kind === "storm" ? 1 : this.kind === "fog" ? 0.3 : 0;
        if (cover > 0) {
            const tone = Math.round(60 + 150 * this.daylight * (this.kind === "storm" ? 0.35 : this.kind === "rain" ? 0.55 : 0.9));
            for (const c of this.clouds) {
                c.x += c.v * dt * (this.kind === "storm" ? 3 : 1);
                if (c.x > 1.3)
                    c.x = -0.3;
                const cw = c.w * w, cx = c.x * w, cy = c.y * h;
                for (let i = 0; i < 4; i++) {
                    const px = cx + (i - 1.5) * cw * 0.28, rg = g.createRadialGradient(px, cy, 0, px, cy, cw * 0.4);
                    rg.addColorStop(0, `rgba(${tone},${tone},${tone + 14},${0.42 * c.a * cover})`);
                    rg.addColorStop(1, `rgba(${tone},${tone},${tone + 14},0)`);
                    g.fillStyle = rg;
                    g.fillRect(px - cw * 0.4, cy - cw * 0.4, cw * 0.8, cw * 0.8);
                }
            }
        }
        // fog: a pale haze that thickens toward the ground
        if (this.kind === "fog") {
            const fg = g.createLinearGradient(0, h * 0.3, 0, h);
            fg.addColorStop(0, "rgba(200,205,215,0)");
            fg.addColorStop(0.6, `rgba(200,205,215,${0.16 + 0.06 * Math.sin(this.t * 0.4)})`);
            fg.addColorStop(1, "rgba(200,205,215,0.26)");
            g.fillStyle = fg;
            g.fillRect(0, 0, w, h);
        }
        // rain: slanted streaks
        if (this.kind === "rain" || this.kind === "storm") {
            const storm = this.kind === "storm", n = Math.floor(this.drops.length * (storm ? 1 : 0.55));
            g.strokeStyle = `rgba(190,210,235,${storm ? 0.6 : 0.45})`;
            g.lineWidth = 1;
            g.beginPath();
            for (let i = 0; i < n; i++) {
                const d = this.drops[i];
                d.y += dt * d.v * (storm ? 2 : 1.4);
                d.x -= dt * (storm ? 0.3 : 0.12);
                if (d.y > 1) {
                    d.y = -0.05;
                    d.x = Math.random() * 1.2;
                }
                if (d.x < -0.1)
                    d.x += 1.2;
                const x = d.x * w, y = d.y * h;
                g.moveTo(x, y);
                g.lineTo(x + (storm ? 5 : 2), y + (storm ? 17 : 11));
            }
            g.stroke();
        }
        // lightning: a brief white flash every few seconds in a storm
        if (this.kind === "storm") {
            this.nextFlash -= dt;
            if (this.nextFlash <= 0) {
                this.flash = 1;
                this.nextFlash = 4 + Math.random() * 6;
            }
            if (this.flash > 0) {
                g.fillStyle = `rgba(235,240,255,${this.flash * 0.35})`;
                g.fillRect(0, 0, w, h);
                this.flash = Math.max(0, this.flash - dt * 3.5);
            }
        }
    }
}
