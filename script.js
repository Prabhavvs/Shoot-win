const TARGET_IMAGE_PATHS = [
    "assets/targets/1-356e29ad-8ef1-4f3a-905a-d2fac71d9750.png",
    "assets/targets/2-a42acc01-0050-4128-a958-93a63f362a33.png",
    "assets/targets/3-1ca68996-4a38-47fb-8944-53eb913561a3.png",
    "assets/targets/4-d5a3e3c3-e24f-40a3-9956-a3c7f7d59752.png",
    "assets/targets/5-09f4f41d-e431-41b4-b690-de9624713e89.png",
    "assets/targets/6-062566bd-9475-499f-b348-8ef8d476284b.png",
    "assets/targets/7-b22b9602-8e79-4d5f-8b2e-f484c23fc494.png",
    "assets/targets/8-880bc649-5a5d-40d4-9164-a32b60f93d5f.png",
    "assets/targets/9-9d3f877a-0ccd-4630-b668-db11cbcb512e.png",
    "assets/targets/10-656c26a3-f02f-4ecb-be56-77043cf8beb8.png",
    "assets/targets/11-6c083848-2758-469d-9a10-edac4f348299.png"
];

const INTRUDER_ASSET_PATHS = [
    { label: "BOOK", src: "assets/intruders/book.png" },
    { label: "SHUTTLE", src: "assets/intruders/shuttle.png" },
    { label: "SOCCER", src: "assets/intruders/soccer.png" },
    { label: "RUGBY", src: "assets/intruders/rugby.png" },
    { label: "SHOE", src: "assets/intruders/shoe.png" }
];
const ROUND_DURATION_SECONDS = 30;
const TARGET_CORRECT_SHOTS = 5;
const BASE_INTRUDER_CHANCE = 0.35;
const MAX_TARGETS_ON_SCREEN = 8;
const TARGET_LANE_Y = 85;
const MIN_TARGET_GAP = 4;
const TARGET_FLOW_SPEED = 315;
const TARGET_SIZE = 76;
const SFX_VOLUME_MULTIPLIER = 1.4;

class SweetShotGame {
    constructor(options = {}) {
        this.previewWin = Boolean(options.previewWin);
        this.canvas = document.getElementById("gameCanvas");
        this.ctx = this.canvas.getContext("2d");
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = "high";

        this.startScreen = document.getElementById("startScreen");
        this.gameScreen = document.getElementById("gameScreen");
        this.endScreen = document.getElementById("endScreen");

        this.scoreText = document.getElementById("scoreText");
        this.timeText = document.getElementById("timeText");
        this.endTitle = document.getElementById("endTitle");
        this.endReason = document.getElementById("endReason");
        this.finalScore = document.getElementById("finalScore");
        this.dragControl = document.getElementById("dragControl");
        this.dragControlWrap = document.getElementById("dragControlWrap");
        this.rulesTrigger = document.querySelector(".start-rules");
        this.rulesModal = document.getElementById("rulesModal");
        this.rulesCloseBtn = document.getElementById("rulesCloseBtn");

        this.images = [];
        this.intruderImages = [];
        this.bowImage = null;
        this.arrowImage = null;
        this.targets = [];
        this.arrows = [];
        this.particles = [];
        this.scorePopups = [];
        this.running = false;
        this.score = 0;
        this.timeLeft = ROUND_DURATION_SECONDS;
        this.previousFrameMs = 0;
        this.countdownInterval = null;
        this.dragStartY = 0;
        this.dragPull = 0;
        this.isDragging = false;
        this.audioCtx = null;
        this.lastSpawnKey = null;
        this.nextSpawnType = "dessert";
        this.winCtaRevealTimer = null;

        this.bindEvents();
        this.loadImages().then(() => {
            if (this.previewWin) {
                this.endGame("Preview mode", true);
            } else {
                this.showScreen("start");
            }
        });
    }

    bindEvents() {
        document.getElementById("startBtn").addEventListener("click", () => {
            this.playStartCtaSfx();
            this.start();
        });
        document.getElementById("playAgainBtn").addEventListener("click", () => this.start());
        this.dragControlWrap.addEventListener("pointerdown", (event) => this.onDragStart(event));
        window.addEventListener("pointermove", (event) => this.onDragMove(event));
        window.addEventListener("pointerup", (event) => this.onDragEnd(event));
        window.addEventListener("pointercancel", (event) => this.onDragEnd(event));

        // Fallback for environments where pointer events are inconsistent.
        this.dragControlWrap.addEventListener("mousedown", (event) => this.onDragStart(event));
        window.addEventListener("mousemove", (event) => this.onDragMove(event));
        window.addEventListener("mouseup", (event) => this.onDragEnd(event));
        this.dragControlWrap.addEventListener("touchstart", (event) => {
            if (!event.changedTouches || event.changedTouches.length === 0) return;
            event.preventDefault();
            this.onDragStart(event.changedTouches[0]);
        }, { passive: false });
        window.addEventListener("touchmove", (event) => {
            if (!event.changedTouches || event.changedTouches.length === 0) return;
            this.onDragMove(event.changedTouches[0]);
        }, { passive: true });
        window.addEventListener("touchend", (event) => {
            if (!event.changedTouches || event.changedTouches.length === 0) return;
            this.onDragEnd(event.changedTouches[0]);
        }, { passive: true });
        const relayoutDrag = () => this.updateDragAnchorPosition();
        window.addEventListener("resize", relayoutDrag);
        window.addEventListener("orientationchange", () => {
            requestAnimationFrame(() => relayoutDrag());
        });
        if (window.visualViewport) {
            window.visualViewport.addEventListener("resize", relayoutDrag);
            window.visualViewport.addEventListener("scroll", relayoutDrag);
        }

        if (this.rulesTrigger && this.rulesModal && this.rulesCloseBtn) {
            this.rulesTrigger.addEventListener("click", () => this.openRulesModal());
            this.rulesCloseBtn.addEventListener("click", () => this.closeRulesModal());
            this.rulesModal.addEventListener("click", (event) => {
                if (event.target.classList.contains("rules-modal-overlay")) {
                    this.closeRulesModal();
                }
            });
        }
    }

    openRulesModal() {
        if (!this.rulesModal) return;
        this.rulesModal.classList.add("open");
        this.rulesModal.setAttribute("aria-hidden", "false");
    }

    closeRulesModal() {
        if (!this.rulesModal) return;
        this.rulesModal.classList.remove("open");
        this.rulesModal.setAttribute("aria-hidden", "true");
    }

    async loadImages() {
        const promises = TARGET_IMAGE_PATHS.map((src) => {
            return new Promise((resolve) => {
                const img = new Image();
                img.src = src;
                img.onload = () => resolve(img);
                img.onerror = () => resolve(null);
            });
        });
        const loaded = await Promise.all(promises);
        this.images = loaded.filter(Boolean);
        const intruderPromises = INTRUDER_ASSET_PATHS.map((item) => {
            return this.loadOneImage(item.src).then((img) => {
                if (!img) return null;
                return { label: item.label, image: img };
            });
        });
        const intrudersLoaded = await Promise.all(intruderPromises);
        this.intruderImages = intrudersLoaded.filter(Boolean);
        this.bowImage = await this.loadOneImage("assets/ui/bow.png");
        this.arrowImage = await this.loadOneImage("assets/ui/arrow.png");
    }

    loadOneImage(src) {
        return new Promise((resolve) => {
            const img = new Image();
            img.src = src;
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
        });
    }

    ensureAudioContext() {
        if (this.audioCtx) return this.audioCtx;
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return null;
        this.audioCtx = new AudioContextClass();
        return this.audioCtx;
    }

    playTone({ frequency, duration = 0.08, type = "sine", gain = 0.08, sweepTo = null }) {
        const ctx = this.ensureAudioContext();
        if (!ctx) return;
        if (ctx.state === "suspended") {
            ctx.resume().catch(() => {});
        }

        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const amp = ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(frequency, now);
        if (sweepTo !== null) {
            osc.frequency.linearRampToValueAtTime(sweepTo, now + duration);
        }

        const scaledGain = Math.min(0.6, gain * SFX_VOLUME_MULTIPLIER);
        amp.gain.setValueAtTime(0.0001, now);
        amp.gain.exponentialRampToValueAtTime(scaledGain, now + 0.01);
        amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);

        osc.connect(amp);
        amp.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + duration + 0.01);
    }

    playDessertHitSfx() {
        this.playTone({ frequency: 760, sweepTo: 980, duration: 0.09, type: "triangle", gain: 0.14 });
        this.playTone({ frequency: 1120, sweepTo: 1320, duration: 0.06, type: "sine", gain: 0.08 });
    }

    playIntruderHitSfx() {
        this.playTone({ frequency: 260, sweepTo: 120, duration: 0.16, type: "sawtooth", gain: 0.16 });
    }

    playStartCtaSfx() {
        this.playTone({ frequency: 520, sweepTo: 760, duration: 0.07, type: "triangle", gain: 0.11 });
    }

    showScreen(screen) {
        this.startScreen.classList.remove("active");
        this.gameScreen.classList.remove("active");
        this.endScreen.classList.remove("active");

        if (screen === "start") this.startScreen.classList.add("active");
        if (screen === "game") this.gameScreen.classList.add("active");
        if (screen === "end") this.endScreen.classList.add("active");
    }

    start() {
        this.running = true;
        this.score = 0;
        this.timeLeft = ROUND_DURATION_SECONDS;
        this.targets = [];
        this.arrows = [];
        this.particles = [];
        this.scorePopups = [];
        this.dragPull = 0;
        this.isDragging = false;
        this.lastSpawnKey = null;
        this.nextSpawnType = "dessert";
        this.dragControl.style.transform = "translateY(0px)";
        this.previousFrameMs = performance.now();
        this.seedInitialTargets();
        this.updateHud();
        this.showScreen("game");
        requestAnimationFrame(() => this.updateDragAnchorPosition());

        if (this.countdownInterval) clearInterval(this.countdownInterval);
        this.countdownInterval = setInterval(() => {
            if (!this.running) return;
            this.timeLeft -= 1;
            this.updateHud();
            if (this.timeLeft <= 0) {
                if (this.score >= TARGET_CORRECT_SHOTS) {
                    this.endGame("You reached 10 correct shots!", true);
                } else {
                    this.endGame("Time is up before reaching 10 correct shots.", false);
                }
            }
        }, 1000);

        requestAnimationFrame((ms) => this.loop(ms));
    }

    loop(nowMs) {
        if (!this.running) return;
        const delta = Math.min((nowMs - this.previousFrameMs) / 1000, 0.05);
        this.previousFrameMs = nowMs;

        this.updateTargets(delta);
        this.replenishTargets();
        this.updateArrows(delta);
        this.checkArrowHits();
        this.updateParticles(delta);
        this.updateScorePopups(delta);
        this.draw();

        requestAnimationFrame((ms) => this.loop(ms));
    }

    createTarget(xPosition = 0) {
        const size = TARGET_SIZE;
        const y = TARGET_LANE_Y;
        const shouldSpawnIntruder = this.nextSpawnType === "intruder";

        if (shouldSpawnIntruder && this.intruderImages.length > 0) {
            let selectedIndex = Math.floor(Math.random() * this.intruderImages.length);
            let selectedIntruder = this.intruderImages[selectedIndex];
            let selectedKey = `F:${selectedIntruder.label}`;
            for (let i = 0; i < 8 && selectedKey === this.lastSpawnKey; i += 1) {
                selectedIndex = Math.floor(Math.random() * this.intruderImages.length);
                selectedIntruder = this.intruderImages[selectedIndex];
                selectedKey = `F:${selectedIntruder.label}`;
            }
            this.lastSpawnKey = selectedKey;
            this.nextSpawnType = "dessert";
            return {
                type: "forbidden",
                label: selectedIntruder.label,
                image: selectedIntruder.image,
                x: xPosition,
                y,
                size,
                speed: TARGET_FLOW_SPEED
            };
        }
        if (this.images.length > 0) {
            let selectedIndex = Math.floor(Math.random() * this.images.length);
            let selectedKey = `D:${selectedIndex}`;
            for (let i = 0; i < 8 && selectedKey === this.lastSpawnKey; i += 1) {
                selectedIndex = Math.floor(Math.random() * this.images.length);
                selectedKey = `D:${selectedIndex}`;
            }
            this.lastSpawnKey = selectedKey;
            this.nextSpawnType = "intruder";
            const image = this.images[selectedIndex];
            return { type: "dessert", image, x: xPosition, y, size, speed: TARGET_FLOW_SPEED };
        }
        return null;
    }

    seedInitialTargets() {
        this.targets = [];
        let currentX = -18;
        for (let i = 0; i < MAX_TARGETS_ON_SCREEN; i += 1) {
            const target = this.createTarget();
            if (!target) break;
            target.x = currentX + target.size / 2;
            currentX += target.size + MIN_TARGET_GAP;
            this.targets.push(target);
        }
    }

    updateTargets(delta) {
        this.targets.forEach((target) => {
            target.x += target.speed * delta;
            if (target.x > this.canvas.width + target.size) {
                target.x = this.getSpawnBeforeLeftmost(target.size, target);
                target.y = TARGET_LANE_Y;
            }
        });
    }

    replenishTargets() {
        while (this.targets.length < MAX_TARGETS_ON_SCREEN) {
            const target = this.createTarget();
            if (!target) return;
            target.x = this.getSpawnBeforeLeftmost(target.size, target);
            this.targets.push(target);
        }
    }

    getSpawnBeforeLeftmost(size, ignoreTarget = null) {
        if (this.targets.length <= 1) {
            return -size / 2;
        }
        let leftMost = Infinity;
        let leftSize = size;
        for (const target of this.targets) {
            if (target === ignoreTarget) continue;
            if (target.x < leftMost) {
                leftMost = target.x;
                leftSize = target.size;
            }
        }
        return leftMost - (leftSize / 2 + size / 2 + MIN_TARGET_GAP);
    }

    updateParticles(delta) {
        this.particles = this.particles.filter((particle) => {
            particle.life -= delta;
            particle.y += particle.vy * delta;
            particle.x += particle.vx * delta;
            return particle.life > 0;
        });
    }

    updateArrows(delta) {
        this.arrows = this.arrows.filter((arrow) => {
            arrow.y += arrow.vy * delta;
            return arrow.y > -80;
        });
    }

    checkArrowHits() {
        for (let ai = this.arrows.length - 1; ai >= 0; ai -= 1) {
            const arrow = this.arrows[ai];
            let didHit = false;

            for (let ti = this.targets.length - 1; ti >= 0; ti -= 1) {
                const target = this.targets[ti];
                const dx = arrow.x - target.x;
                const dy = arrow.y - target.y;
                const radius = target.type === "dessert" ? target.size * 0.42 : 52;
                if (dx * dx + dy * dy > radius * radius) continue;

                this.targets.splice(ti, 1);
                this.arrows.splice(ai, 1);
                this.spawnHitParticles(target.x, target.y, target.type === "dessert" ? "#ffd166" : "#ff4d6d");

                if (target.type === "forbidden") {
                    this.playIntruderHitSfx();
                    this.endGame(`You hit a forbidden item (${target.label}).`, false);
                    return;
                }

                this.score += 1;
                this.spawnScorePopup(target.x, target.y - target.size * 0.55, this.score);
                this.playDessertHitSfx();
                this.updateHud();
                if (this.score >= TARGET_CORRECT_SHOTS) {
                    this.endGame("You reached 10 correct shots!", true);
                    return;
                }
                didHit = true;
                break;
            }

            if (didHit) continue;
        }
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        for (const target of this.targets) {
            if (target.image) {
                this.ctx.drawImage(target.image, target.x - target.size / 2, target.y - target.size / 2, target.size, target.size);
            } else {
                this.ctx.fillStyle = "#c53f59";
                this.ctx.beginPath();
                this.ctx.roundRect(target.x - 46, target.y - 28, 92, 56, 8);
                this.ctx.fill();
                this.ctx.fillStyle = "#fff4f6";
                this.ctx.font = "bold 20px Arial";
                this.ctx.textAlign = "center";
                this.ctx.fillText(target.label, target.x, target.y + 7);
            }
        }

        const bowX = this.canvas.width / 2;
        const bowY = this.getBowY();
        if (this.bowImage) {
            const bw = this.bowImage.naturalWidth;
            const bh = this.bowImage.naturalHeight;
            const bowCrop = {
                sx: bw * 0.08,
                sy: bh * 0.36,
                sw: bw * 0.84,
                sh: bh * 0.30
            };
            this.ctx.save();
            this.ctx.translate(bowX, bowY);
            this.ctx.rotate((-1 * Math.PI) / 180);
            this.ctx.drawImage(
                this.bowImage,
                bowCrop.sx,
                bowCrop.sy,
                bowCrop.sw,
                bowCrop.sh,
                -170,
                -62,
                340,
                104
            );
            this.ctx.restore();
        } else {
            this.ctx.fillStyle = "#c6a16f";
            this.ctx.fillRect(bowX - 50, bowY - 8, 100, 16);
        }

        // Dynamic bowstring: stretches to center as user drags.
        const stringLeftX = bowX - 126;
        const stringRightX = bowX + 118;
        const stringAnchorY = bowY + 5;
        const stringPullY = stringAnchorY + this.dragPull * 0.42;

        this.ctx.strokeStyle = "rgba(124, 67, 26, 0.94)";
        this.ctx.lineWidth = 3;
        this.ctx.lineCap = "round";
        this.ctx.beginPath();
        this.ctx.moveTo(stringLeftX, stringAnchorY);
        this.ctx.lineTo(bowX, stringPullY);
        this.ctx.lineTo(stringRightX, stringAnchorY);
        this.ctx.stroke();

        // Always render a nocked arrow on the bow so aim point is visible.
        const nockedArrowY = bowY - 30 + this.dragPull * 0.42;
        if (this.arrowImage) {
            const aw = this.arrowImage.naturalWidth;
            const ah = this.arrowImage.naturalHeight;
            const arrowCrop = {
                sx: aw * 0.39,
                sy: ah * 0.15,
                sw: aw * 0.22,
                sh: ah * 0.72
            };
            this.ctx.drawImage(
                this.arrowImage,
                arrowCrop.sx,
                arrowCrop.sy,
                arrowCrop.sw,
                arrowCrop.sh,
                bowX - 15,
                nockedArrowY - 78,
                30,
                140
            );
        } else {
            this.ctx.fillStyle = "#ececec";
            this.ctx.fillRect(bowX - 2, nockedArrowY - 48, 4, 52);
        }

        for (const arrow of this.arrows) {
            if (this.arrowImage) {
                const aw = this.arrowImage.naturalWidth;
                const ah = this.arrowImage.naturalHeight;
                const arrowCrop = {
                    sx: aw * 0.39,
                    sy: ah * 0.15,
                    sw: aw * 0.22,
                    sh: ah * 0.72
                };
                this.ctx.drawImage(
                    this.arrowImage,
                    arrowCrop.sx,
                    arrowCrop.sy,
                    arrowCrop.sw,
                    arrowCrop.sh,
                    arrow.x - 15,
                    arrow.y - 78,
                    30,
                    140
                );
            } else {
                this.ctx.fillStyle = "#ececec";
                this.ctx.fillRect(arrow.x - 2, arrow.y - 48, 4, 52);
            }
        }

        for (const particle of this.particles) {
            this.ctx.globalAlpha = Math.max(0, particle.life * 1.8);
            this.ctx.fillStyle = particle.color;
            this.ctx.beginPath();
            this.ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.globalAlpha = 1;
        }

        for (const popup of this.scorePopups) {
            const alpha = Math.max(0, popup.life / popup.maxLife);
            this.ctx.globalAlpha = alpha;
            this.ctx.fillStyle = "rgba(102, 16, 24, 0.94)";
            this.ctx.strokeStyle = "rgba(210, 88, 100, 0.85)";
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(popup.x, popup.y, 18, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.stroke();

            this.ctx.fillStyle = "#ffffff";
            this.ctx.font = "bold 16px Arial";
            this.ctx.textAlign = "center";
            this.ctx.textBaseline = "middle";
            this.ctx.fillText(String(popup.value), popup.x, popup.y + 0.5);
            this.ctx.globalAlpha = 1;
        }
    }

    onDragStart(event) {
        if (!this.running) return;
        if (this.isDragging) return;
        this.isDragging = true;
        this.dragStartY = event.clientY ?? 0;
        this.dragPull = 0;
        this.dragControl.style.cursor = "grabbing";
        this.dragControl.style.transform = "translateY(0px)";
        if (this.dragControlWrap.setPointerCapture && event.pointerId !== undefined) {
            this.dragControlWrap.setPointerCapture(event.pointerId);
        }
    }

    onDragMove(event) {
        if (!this.isDragging) return;
        const clientY = event.clientY ?? this.dragStartY;
        const rawPull = clientY - this.dragStartY;
        const maxPull = this.getDragPullLimit();
        this.dragPull = Math.max(0, Math.min(maxPull, rawPull));
        this.dragControl.style.transform = `translateY(${this.dragPull}px)`;
    }

    getDragPullLimit() {
        return 130;
    }

    getBowY() {
        return this.canvas.height - 256;
    }

    updateDragAnchorPosition() {
        const stage = document.getElementById("gameStage");
        if (!stage || !this.canvas || !this.dragControlWrap) return;

        const stageRect = stage.getBoundingClientRect();
        const canvasRect = this.canvas.getBoundingClientRect();
        if (!stageRect.height || !canvasRect.height) return;

        // Anchor where the orange fletching starts on the nocked arrow.
        const anchorCanvasX = this.canvas.width / 2;
        const anchorCanvasY = this.getBowY() - 8;
        const scaleX = canvasRect.width / this.canvas.width;
        const scaleY = canvasRect.height / this.canvas.height;

        const anchorStageX = (canvasRect.left - stageRect.left) + anchorCanvasX * scaleX;
        const anchorStageY = (canvasRect.top - stageRect.top) + anchorCanvasY * scaleY;

        this.dragControlWrap.style.left = `${anchorStageX}px`;
        this.dragControlWrap.style.top = `${anchorStageY - this.dragControlWrap.offsetHeight / 2}px`;
        this.dragControlWrap.style.bottom = "auto";
        this.dragControlWrap.style.transform = "translateX(-50%)";
    }

    onDragEnd(event) {
        if (!this.isDragging) return;
        this.isDragging = false;
        this.dragControl.style.cursor = "grab";
        this.dragControl.style.transform = "translateY(0px)";

        if (!this.running || this.dragPull < 16) {
            this.dragPull = 0;
            return;
        }

        const speed = 620 + this.dragPull * 6.2;
        this.arrows.push({
            x: this.canvas.width / 2,
            y: this.canvas.height - 306,
            vy: -speed
        });
        this.dragPull = 0;
    }

    spawnHitParticles(x, y, color) {
        for (let i = 0; i < 10; i += 1) {
            this.particles.push({
                x,
                y,
                vx: -120 + Math.random() * 240,
                vy: -120 + Math.random() * 240,
                radius: 2 + Math.random() * 3.5,
                life: 0.45 + Math.random() * 0.25,
                color
            });
        }
    }

    spawnScorePopup(x, y, value) {
        this.scorePopups.push({
            x,
            y,
            value,
            life: 0.75,
            maxLife: 0.75
        });
    }

    updateScorePopups(delta) {
        this.scorePopups = this.scorePopups.filter((popup) => {
            popup.life -= delta;
            popup.y -= 32 * delta;
            return popup.life > 0;
        });
    }

    updateHud() {
        this.scoreText.textContent = `Correct Shots: ${this.score}/${TARGET_CORRECT_SHOTS}`;
        this.timeText.textContent = `Time: ${Math.max(0, this.timeLeft)}`;
    }

    endGame(reason, didWin) {
        this.running = false;
        if (this.countdownInterval) clearInterval(this.countdownInterval);
        if (this.winCtaRevealTimer) {
            clearTimeout(this.winCtaRevealTimer);
            this.winCtaRevealTimer = null;
        }

        // Reset transition state before screen swap so fade is visible.
        this.endScreen.classList.remove("win-state");
        this.endScreen.classList.remove("end-win-reveal");
        this.endScreen.classList.remove("end-win-cta-reveal");
        const gameOverSign = document.querySelector(".end-game-over-sign");
        const wrongCopy = document.querySelector(".end-wrong-copy");
        const youWon = document.querySelector(".end-you-won-wrap");
        const reward = document.querySelector(".end-reward");
        const laughing = document.querySelector(".end-laughing");
        const playAgainBtn = document.querySelector(".end-playagain-btn");
        const playAgainImg = document.querySelector(".end-playagain-img");
        const fallback = document.querySelectorAll(".end-fallback-text");

        if (didWin) {
            if (gameOverSign) gameOverSign.style.display = "none";
            if (wrongCopy) wrongCopy.style.display = "none";
            if (youWon) youWon.style.display = "block";
            if (reward) reward.style.display = "block";
            if (laughing) laughing.style.display = "none";
            if (playAgainBtn) playAgainBtn.style.display = "flex";
            if (playAgainImg) playAgainImg.src = "assets/end/play-again-win.png";
            fallback.forEach((node) => { node.style.display = "none"; });
        } else {
            if (gameOverSign) gameOverSign.style.display = "block";
            if (wrongCopy) wrongCopy.style.display = "block";
            if (youWon) youWon.style.display = "none";
            if (reward) reward.style.display = "none";
            if (laughing) laughing.style.display = "block";
            if (playAgainBtn) playAgainBtn.style.display = "flex";
            if (playAgainImg) playAgainImg.src = "assets/end/play-again-cta.png";
            fallback.forEach((node) => { node.style.display = "none"; });
        }

        this.endTitle.textContent = didWin ? "You Win!" : "Game Over";
        this.endReason.textContent = reason;
        this.finalScore.textContent = `Correct Shots: ${this.score}/${TARGET_CORRECT_SHOTS}`;
        this.showScreen("end");

        if (didWin) {
            // Sequence: background scale first, then asset pop-in.
            requestAnimationFrame(() => {
                this.endScreen.classList.add("win-state");
                requestAnimationFrame(() => {
                    this.endScreen.classList.add("end-win-reveal");
                    this.winCtaRevealTimer = setTimeout(() => {
                        this.endScreen.classList.add("end-win-cta-reveal");
                    }, 620);
                });
            });
        }
    }
}

window.addEventListener("DOMContentLoaded", () => {
    const params = new URLSearchParams(window.location.search);
    const previewWin = params.get("preview") === "win";
    new SweetShotGame({ previewWin });
});
