"use strict";

const { clamp } = require("./utils");

function createMemoryGame(opts) {
    const scene = opts.scene;
    const rng = opts.rng;
    const fontTiny = opts.fontTiny;

    const memory = {
        cols: 4,
        rows: 4,
        cards: [],
        firstIndex: -1,
        lock: false,
        known: {}
    };

    let memPairs = 0;

    function buildMemoryDeck(phaseT) {
        const pool = [];
        const wBase = opts.lerp(0.55, 0.25, phaseT);
        const wThink = opts.lerp(0.20, 0.30, phaseT);
        const wRepeat = opts.lerp(0.20, 0.25, phaseT);
        const wHigh = opts.lerp(0.05, 0.20, phaseT);

        function pickCategory() {
            const r = rng.generate();
            if (r < wBase) return "base";
            if (r < wBase + wThink) return "think";
            if (r < wBase + wThink + wRepeat) return "repeat";
            return "high";
        }

        for (let i = 0; i < 8; i++) {
            const cat = pickCategory();
            let s;
            if (cat === "base") s = opts.BASE_SKILLS[opts.choice(rng, opts.BASE_SKILLS.map((_, i2) => i2))];
            else if (cat === "think") s = opts.THINK_SKILLS[opts.choice(rng, opts.THINK_SKILLS.map((_, i2) => i2))];
            else if (cat === "repeat") s = opts.REPEAT_SKILLS[opts.choice(rng, opts.REPEAT_SKILLS.map((_, i2) => i2))];
            else s = opts.HIGH_SKILLS[opts.choice(rng, opts.HIGH_SKILLS.map((_, i2) => i2))];
            pool.push(s);
        }

        const cards = [];
        pool.forEach((s) => {
            cards.push({ skillId: s.id, name: s.name, kind: s.kind || "base", stat: s.stat, faceUp: false, matched: false });
            cards.push({ skillId: s.id, name: s.name, kind: s.kind || "base", stat: s.stat, faceUp: false, matched: false });
        });

        for (let i = cards.length - 1; i > 0; i--) {
            const j = opts.randInt(rng, 0, i);
            const tmp = cards[i];
            cards[i] = cards[j];
            cards[j] = tmp;
        }
        return cards;
    }

    function resetMemoryDeck(phaseT) {
        memory.cards = buildMemoryDeck(phaseT);
        memory.firstIndex = -1;
        memory.lock = false;
        memory.known = {};
    }

    function renderMemoryCards(container, phaseGetter, activeTabGetter) {
        const cardW = 140;
        const cardH = 110;
        const gap = 10;

        if (Array.isArray(container.children)) {
            container.children.forEach((ch) => ch.destroy());
        }

        for (let r = 0; r < memory.rows; r++) {
            for (let c = 0; c < memory.cols; c++) {
                const idx = r * memory.cols + c;
                const card = memory.cards[idx];
                const x = c * (cardW + gap);
                const y = r * (cardH + gap);

                const rect = new g.FilledRect({
                    scene,
                    x,
                    y,
                    width: cardW,
                    height: cardH,
                    cssColor: card.matched ? "#d1fae5" : (card.faceUp ? "#e0f2fe" : "#111827"),
                    opacity: 0.95,
                    touchable: true
                });
                container.append(rect);

                const label = new g.Label({
                    scene,
                    text: card.faceUp || card.matched ? card.name : "?",
                    font: fontTiny,
                    fontSize: 18,
                    textColor: card.faceUp || card.matched ? "#111827" : "#ffffff",
                    x: x + 10,
                    y: y + 10
                });
                container.append(label);

                const sub = new g.Label({
                    scene,
                    text: (card.faceUp || card.matched) ? (card.kind === "high" ? "高位" : (card.kind === "think" ? "思考" : (card.kind === "repeat" ? "反復" : "基礎"))) : "",
                    font: fontTiny,
                    fontSize: 16,
                    textColor: "#374151",
                    x: x + 10,
                    y: y + 70
                });
                container.append(sub);

                rect.onPointDown.add(() => {
                    if (phaseGetter() !== "grow") return;
                    if (activeTabGetter() !== "memory") return;
                    if (memory.lock) return;
                    if (card.matched || card.faceUp) return;

                    card.faceUp = true;
                    memory.known[card.skillId] = true;
                    renderMemoryCards(container, phaseGetter, activeTabGetter);

                    if (memory.firstIndex < 0) {
                        memory.firstIndex = idx;
                        return;
                    }

                    const first = memory.cards[memory.firstIndex];
                    if (first.skillId === card.skillId) {
                        first.matched = true;
                        card.matched = true;
                        memPairs++;
                        opts.unlockState.pairs++;

                        let isSca = false;
                        if (card.kind === "high") isSca = !opts.highSkillRequirement(card.skillId);

                        opts.addOrLevelSkill({ id: card.skillId, name: card.name, kind: card.kind, stat: card.stat }, isSca);
                        opts.tryPromoteScaSkills();

                        memory.firstIndex = -1;
                        opts.onPairsChanged(memPairs);
                        opts.onStatsChanged();
                        renderMemoryCards(container, phaseGetter, activeTabGetter);
                    } else {
                        memory.lock = true;
                        const aIdx = memory.firstIndex;
                        memory.firstIndex = -1;
                        scene.setTimeout(() => {
                            memory.cards[aIdx].faceUp = false;
                            card.faceUp = false;
                            memory.lock = false;
                            renderMemoryCards(container, phaseGetter, activeTabGetter);
                        }, 18);
                    }
                });
            }
        }
    }

    return {
        memory,
        resetMemoryDeck,
        renderMemoryCards,
        getPairs: () => memPairs
    };
}

module.exports = { createMemoryGame };
