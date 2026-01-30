/*
 * ニコ生ゲーム（ランキング）
 * 思考と反復のギフト
 * - 200秒固定（タイトル12 / 成長120 / 戦闘60 / 結果8）
 * - 成長: 神経衰弱(思考) + 落ちもの(反復) をタブ切替で同時進行
 * - 戦闘: 自動戦闘 + 倍速(1-5) + 逃走(スコア確定) / HP0でスコア0
 */

"use strict";

exports.main = void 0;

const { clamp, lerp, randInt, choice, formatTime } = require("./utils");
const { createMemoryGame } = require("./minigame_memory");
const { createBattleView } = require("./battle_view");

function main(param) {
    const scene = new g.Scene({ game: g.game });

    // ランキング: g.game.vars.gameState.score を最終スコアとして扱う
    g.game.vars.gameState = { score: 0 };

    // 固定200秒（セッションパラメータが来ても固定優先）
    const TOTAL_TIME = 200;
    const PHASE_TITLE = 12;
    const PHASE_GROW = 120;
    const PHASE_BATTLE = 60;
    const PHASE_RESULT = 8;

    // 画面
    const W = g.game.width;
    const H = g.game.height;

    // 乱数
    const rng = param.random || g.game.random;

    // UI
    const font = new g.DynamicFont({ game: g.game, fontFamily: "sans-serif", size: 36 });
    const fontSmall = new g.DynamicFont({ game: g.game, fontFamily: "sans-serif", size: 24 });
    const fontTiny = new g.DynamicFont({ game: g.game, fontFamily: "sans-serif", size: 18 });

    // ステータス
    const stats = {
        maxHP: 100,
        hp: 100,
        maxMP: 40,
        mp: 40,
        atk: 10,
        def: 6,
        matk: 10,
        mdef: 6,
        evd: 5,
        spd: 10
    };

    // 状態異常
    const ailments = {
        poison: 0,
        paralysis: 0,
        injury: 0,
        bigInjury: 0,
        mental: 0,
        sick: 0
    };

    // スキル定義
    const BASE_SKILLS = [
        { id: "hp", name: "体力鍛錬", stat: "maxHP" },
        { id: "mp", name: "魔力拡張", stat: "maxMP" },
        { id: "atk", name: "剣技基礎", stat: "atk" },
        { id: "def", name: "防御基礎", stat: "def" },
        { id: "matk", name: "魔導基礎", stat: "matk" },
        { id: "mdef", name: "魔防基礎", stat: "mdef" },
        { id: "evd", name: "回避訓練", stat: "evd" },
        { id: "spd", name: "敏捷訓練", stat: "spd" }
    ];

    const THINK_SKILLS = [
        { id: "judge", name: "状況判断", kind: "think" },
        { id: "analyze", name: "分析眼", kind: "think" },
        { id: "opt", name: "最適化", kind: "think" },
        { id: "rebuild", name: "再構築", kind: "think" }
    ];

    const REPEAT_SKILLS = [
        { id: "mastery", name: "習熟", kind: "repeat" },
        { id: "chant", name: "反復詠唱", kind: "repeat" },
        { id: "muscle", name: "身体記憶", kind: "repeat" },
        { id: "auto", name: "無意識行動", kind: "repeat" }
    ];

    const HIGH_SKILLS = [
        { id: "multi", name: "連続行動", kind: "high" },
        { id: "crit", name: "致命解析", kind: "high" },
        { id: "regen", name: "自動再生", kind: "high" },
        { id: "over", name: "魔力暴走", kind: "high" }
    ];

    // 条件（成長フェーズ中に満たすとスカ→昇格）
    const unlockState = {
        pairs: 0,
        merges: 0,
        shuffles: 0,
        thoughtShards: 0
    };

    function highSkillRequirement(id) {
        switch (id) {
            case "multi":
                return unlockState.merges >= 6;
            case "crit":
                return unlockState.pairs >= 5;
            case "regen":
                return unlockState.thoughtShards >= 3;
            case "over":
                return unlockState.shuffles >= 4;
            default:
                return false;
        }
    }

    // 所持スキル: id -> {name, lv, isSca, kind}
    const owned = {};

    function applyStatsFromSkills() {
        const base = {
            maxHP: 100,
            hp: stats.hp,
            maxMP: 40,
            mp: stats.mp,
            atk: 10,
            def: 6,
            matk: 10,
            mdef: 6,
            evd: 5,
            spd: 10
        };
        let maxHP = base.maxHP;
        let maxMP = base.maxMP;
        let atk = base.atk;
        let def = base.def;
        let matk = base.matk;
        let mdef = base.mdef;
        let evd = base.evd;
        let spd = base.spd;

        Object.keys(owned).forEach((k) => {
            const s = owned[k];
            if (s.isSca) return;
            const lv = s.lv;
            if (s.stat === "maxHP") maxHP += 12 * lv;
            if (s.stat === "maxMP") maxMP += 6 * lv;
            if (s.stat === "atk") atk += 3 * lv;
            if (s.stat === "def") def += 2 * lv;
            if (s.stat === "matk") matk += 3 * lv;
            if (s.stat === "mdef") mdef += 2 * lv;
            if (s.stat === "evd") evd += 2 * lv;
            if (s.stat === "spd") spd += 2 * lv;
        });

        stats.maxHP = maxHP;
        stats.maxMP = maxMP;
        stats.atk = atk;
        stats.def = def;
        stats.matk = matk;
        stats.mdef = mdef;
        stats.evd = evd;
        stats.spd = spd;
        stats.hp = clamp(stats.hp, 0, stats.maxHP);
        stats.mp = clamp(stats.mp, 0, stats.maxMP);
    }

    function addOrLevelSkill(skill, isSca) {
        const key = skill.id;
        if (!owned[key]) {
            owned[key] = {
                id: skill.id,
                name: skill.name,
                lv: 1,
                isSca: !!isSca,
                kind: skill.kind || "base",
                stat: skill.stat
            };
        } else {
            if (!owned[key].isSca) {
                owned[key].lv = clamp(owned[key].lv + 1, 1, 5);
            }
        }
        applyStatsFromSkills();
    }

    function tryPromoteScaSkills() {
        Object.keys(owned).forEach((k) => {
            const s = owned[k];
            if (!s.isSca) return;
            if (s.kind === "high") {
                if (highSkillRequirement(s.id)) {
                    s.isSca = false;
                    s.lv = 1;
                }
            }
        });
        applyStatsFromSkills();
    }

    function countOwned(predicate) {
        let c = 0;
        Object.keys(owned).forEach((k) => {
            if (predicate(owned[k])) c++;
        });
        return c;
    }

    // --------------------
    // 落ちもの（簡易スイカ）
    // --------------------
    const drop = {
        areaX: 720,
        areaY: 120,
        areaW: 520,
        areaH: 520,
        spawnX: 980,
        spawnY: 140,
        active: null,
        pieces: [],
        cooldown: 0,
        gravity: 0.55,
        maxPieces: 40
    };

    function pieceRadius(lv) {
        return 16 + (lv - 1) * 6;
    }

    function spawnPiece(phaseT) {
        const r = rng.generate();
        let type = "skill";
        if (r < lerp(0.12, 0.18, phaseT)) type = "shard";
        else if (r < lerp(0.35, 0.25, phaseT)) type = "sca";

        if (type === "shard") {
            return {
                type: "shard",
                id: "shard",
                name: "思考の欠片",
                lv: 1,
                isSca: false,
                kind: "shard",
                x: drop.spawnX,
                y: drop.spawnY,
                vy: 0,
                r: 14
            };
        }

        let candidates = Object.keys(owned).map((k) => owned[k]).filter((s) => !s.isSca);
        if (candidates.length === 0) candidates = BASE_SKILLS.map((s) => ({ id: s.id, name: s.name, lv: 1, isSca: false, kind: "base" }));
        const picked = choice(rng, candidates);

        if (type === "sca") {
            const hs = choice(rng, HIGH_SKILLS);
            return {
                type: "skill",
                id: hs.id,
                name: hs.name,
                lv: 1,
                isSca: true,
                kind: "high",
                x: drop.spawnX,
                y: drop.spawnY,
                vy: 0,
                r: pieceRadius(1)
            };
        }

        return {
            type: "skill",
            id: picked.id,
            name: picked.name,
            lv: clamp(picked.lv || 1, 1, 5),
            isSca: false,
            kind: picked.kind || "base",
            x: drop.spawnX,
            y: drop.spawnY,
            vy: 0,
            r: pieceRadius(clamp(picked.lv || 1, 1, 5))
        };
    }

    function canMerge(a, b) {
        if (!a || !b) return false;
        if (a.type !== "skill" || b.type !== "skill") return false;
        if (a.isSca || b.isSca) return false;
        return a.id === b.id && a.lv === b.lv && a.lv < 5;
    }

    function canAnnihilateSca(a, b) {
        if (!a || !b) return false;
        if (a.type !== "skill" || b.type !== "skill") return false;
        if (!a.isSca || !b.isSca) return false;
        return a.id === b.id;
    }

    function resolveCollisions() {
        for (let i = 0; i < drop.pieces.length; i++) {
            const a = drop.pieces[i];
            for (let j = i + 1; j < drop.pieces.length; j++) {
                const b = drop.pieces[j];
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const dist2 = dx * dx + dy * dy;
                const minD = a.r + b.r;
                if (dist2 < minD * minD) {
                    const nearRest = Math.abs(a.vy) < 0.8 && Math.abs(b.vy) < 0.8;
                    if (nearRest && canMerge(a, b)) {
                        drop.pieces.splice(j, 1);
                        j--;
                        a.lv++;
                        a.r = pieceRadius(a.lv);
                        unlockState.merges++;
                        if (owned[a.id] && !owned[a.id].isSca) {
                            owned[a.id].lv = clamp(owned[a.id].lv + 1, 1, 5);
                            applyStatsFromSkills();
                        }
                        tryPromoteScaSkills();
                        continue;
                    }
                    if (nearRest && canAnnihilateSca(a, b)) {
                        drop.pieces.splice(j, 1);
                        drop.pieces.splice(i, 1);
                        i--;
                        unlockState.merges++;
                        tryPromoteScaSkills();
                        break;
                    }

                    const dist = Math.sqrt(dist2) || 0.001;
                    const overlap = (minD - dist) * 0.5;
                    const nx = dx / dist;
                    const ny = dy / dist;
                    a.x -= nx * overlap;
                    a.y -= ny * overlap;
                    b.x += nx * overlap;
                    b.y += ny * overlap;
                }
            }
        }
    }

    // --------------------
    // 戦闘
    // --------------------
    const battle = {
        time: 0,
        speed: 1,
        enemyLv: 1,
        kills: 0,
        streak: 0,
        streakMul: 1,
        escaped: false,
        wallDefeated: false
    };

    function hasSkill(id) {
        return owned[id] && !owned[id].isSca;
    }

    function skillLv(id) {
        return owned[id] && !owned[id].isSca ? owned[id].lv : 0;
    }

    function battleTick(dt) {
        if (battle.escaped) return;
        if (stats.hp <= 0) return;

        battle.time += dt;
        battle.enemyLv = 1 + Math.floor(battle.time / 6);

        const spdBonus = 1 + (stats.spd / 50);
        const repeatBonus = 1 + 0.08 * (skillLv("mastery") + skillLv("chant") + skillLv("muscle") + skillLv("auto"));
        const multiBonus = hasSkill("multi") ? 1.25 : 1.0;
        let actionRate = spdBonus * repeatBonus * multiBonus;

        let actions = actionRate * dt;

        let critRate = 0.05 + 0.03 * skillLv("crit");
        let critMul = 1.6 + 0.1 * skillLv("crit");
        let overMul = hasSkill("over") ? 1.25 : 1.0;
        let judgeMul = 1.0 + 0.03 * (skillLv("judge") + skillLv("analyze") + skillLv("opt") + skillLv("rebuild"));

        let mpCostMul = ailments.mental > 0 ? 1.35 : 1.0;
        let healMul = ailments.sick > 0 ? 0.6 : 1.0;
        let defMul = ailments.injury > 0 ? 0.8 : 1.0;
        let canHeal = ailments.bigInjury <= 0;

        if (ailments.poison > 0) {
            stats.hp -= 2.2 * dt;
            ailments.poison = Math.max(0, ailments.poison - dt);
        }
        if (ailments.paralysis > 0) {
            actions *= 0.7;
            ailments.paralysis = Math.max(0, ailments.paralysis - dt);
        }
        if (ailments.injury > 0) ailments.injury = Math.max(0, ailments.injury - dt);
        if (ailments.bigInjury > 0) ailments.bigInjury = Math.max(0, ailments.bigInjury - dt);
        if (ailments.mental > 0) ailments.mental = Math.max(0, ailments.mental - dt);
        if (ailments.sick > 0) ailments.sick = Math.max(0, ailments.sick - dt);

        if (hasSkill("regen") && canHeal) {
            const regen = (0.8 + 0.4 * skillLv("regen")) * healMul;
            stats.hp = clamp(stats.hp + regen * dt, 0, stats.maxHP);
        }

        let baseDmg = (stats.atk * 0.9 + stats.matk * 0.9) * judgeMul * overMul;
        let mpUse = Math.min(stats.mp, actions * 0.8 * mpCostMul);
        stats.mp -= mpUse;
        stats.mp = clamp(stats.mp, 0, stats.maxMP);
        baseDmg *= 1.0 + 0.15 * (mpUse / Math.max(0.001, actions));
        baseDmg *= (1 - critRate) + critRate * critMul;

        const enemyHP = 18 + battle.enemyLv * 7;
        const killsExpected = (baseDmg * actions) / enemyHP;
        const killsNow = Math.floor(killsExpected);
        if (killsNow > 0) {
            battle.kills += killsNow;
            battle.streak += killsNow;
            battle.streakMul = 1 + Math.min(2.0, battle.streak / 25);
        }

        const enemyDps = 2.2 + battle.enemyLv * 0.55;
        const evdRate = clamp(0.02 + stats.evd / 200, 0.02, 0.35);
        const taken = enemyDps * dt * (1 - evdRate);
        const defFactor = 1 - clamp((stats.def * defMul) / (60 + battle.enemyLv * 6), 0, 0.55);
        stats.hp -= taken * defFactor;

        const p = rng.generate();
        if (p < 0.01 * dt * (1 + battle.enemyLv / 20)) ailments.poison = Math.max(ailments.poison, 6);
        else if (p < 0.018 * dt * (1 + battle.enemyLv / 25)) ailments.paralysis = Math.max(ailments.paralysis, 4);
        else if (p < 0.026 * dt * (1 + battle.enemyLv / 30)) ailments.injury = Math.max(ailments.injury, 6);
        else if (p < 0.030 * dt * (1 + battle.enemyLv / 40)) ailments.mental = Math.max(ailments.mental, 6);
        else if (p < 0.034 * dt * (1 + battle.enemyLv / 45)) ailments.sick = Math.max(ailments.sick, 6);
        else if (p < 0.036 * dt * (1 + battle.enemyLv / 60)) ailments.bigInjury = Math.max(ailments.bigInjury, 5);

        if (!battle.wallDefeated && battle.time > 20 && rng.generate() < 0.0025 * dt) {
            const highCount = countOwned((s) => s.kind === "high" && !s.isSca);
            let baseSum = 0;
            Object.keys(owned).forEach((k) => {
                const s = owned[k];
                if (s.kind === "base" && !s.isSca) baseSum += s.lv;
            });
            if (highCount >= 2 || baseSum >= 16) {
                battle.wallDefeated = true;
                battle.kills += 8;
                battle.streak += 8;
                battle.streakMul = 1 + Math.min(2.0, battle.streak / 25);
            }
        }

        stats.hp = clamp(stats.hp, 0, stats.maxHP);
    }

    function calcScore() {
        if (stats.hp <= 0) return 0;
        const hpRate = stats.hp / Math.max(1, stats.maxHP);
        const base = battle.kills * (10 + battle.enemyLv) + (battle.wallDefeated ? 500 : 0);
        const mul = battle.streakMul;
        const hpBonus = Math.floor(300 * hpRate);
        return Math.floor(base * mul + hpBonus);
    }

    function hpRateAtEnd() {
        return stats.hp / Math.max(1, stats.maxHP);
    }

    function decideTitle(score, memPairs, merges) {
        if (score <= 200) return "落ちこぼれ";
        if (memPairs >= 7) return "思索者";
        if (merges >= 10) return "鍛錬者";
        if (hpRateAtEnd() >= 0.7 && battle.escaped) return "賢者";
        return "成り上がり";
    }

    // --------------------
    // シーン構築
    // --------------------
    scene.onLoad.add(() => {
        const bg = new g.FilledRect({ scene, cssColor: "#f6f2e8", width: W, height: H });
        scene.append(bg);

        const header = new g.FilledRect({ scene, cssColor: "#2b2b2b", width: W, height: 64 });
        scene.append(header);
        const titleLabel = new g.Label({ scene, text: "思考と反復のギフト", font, fontSize: 30, textColor: "#ffffff", x: 16, y: 16 });
        scene.append(titleLabel);

        const phaseLabel = new g.Label({ scene, text: "", font: fontSmall, fontSize: 22, textColor: "#ffffff", x: 520, y: 20 });
        scene.append(phaseLabel);

        const timeLabel = new g.Label({ scene, text: "TIME: 200", font: fontSmall, fontSize: 22, textColor: "#ffffff", x: W - 180, y: 20 });
        scene.append(timeLabel);

        const leftPanel = new g.FilledRect({ scene, cssColor: "#ffffff", x: 24, y: 96, width: 640, height: 600, opacity: 0.95 });
        const rightPanel = new g.FilledRect({ scene, cssColor: "#ffffff", x: 696, y: 96, width: 560, height: 600, opacity: 0.95 });
        scene.append(leftPanel);
        scene.append(rightPanel);

        let activeTab = "memory";
        const tabMemory = new g.FilledRect({ scene, cssColor: "#3b82f6", x: 24, y: 72, width: 320, height: 32, opacity: 0.95, touchable: true });
        const tabDrop = new g.FilledRect({ scene, cssColor: "#9ca3af", x: 344, y: 72, width: 320, height: 32, opacity: 0.95, touchable: true });
        scene.append(tabMemory);
        scene.append(tabDrop);
        const tabMemoryLabel = new g.Label({ scene, text: "思考(神経衰弱)", font: fontTiny, fontSize: 18, textColor: "#ffffff", x: 24 + 90, y: 78 });
        scene.append(tabMemoryLabel);
        const tabDropLabel = new g.Label({ scene, text: "反復(落ちもの)", font: fontTiny, fontSize: 18, textColor: "#ffffff", x: 344 + 90, y: 78 });
        scene.append(tabDropLabel);

        const memoryLayer = new g.E({ scene, x: 0, y: 0 });
        scene.append(memoryLayer);
        const dropLayer = new g.E({ scene, x: 0, y: 0, hidden: true });
        scene.append(dropLayer);

        function setTab(t) {
            activeTab = t;
            tabMemory.cssColor = t === "memory" ? "#3b82f6" : "#9ca3af";
            tabDrop.cssColor = t === "drop" ? "#3b82f6" : "#9ca3af";
            tabMemory.modified();
            tabDrop.modified();
            if (t === "memory") {
                memoryLayer.show();
            } else {
                memoryLayer.hide();
            }
            if (t === "drop") {
                dropLayer.show();
            } else {
                dropLayer.hide();
            }
        }

        tabMemory.onPointDown.add(() => setTab("memory"));
        tabDrop.onPointDown.add(() => setTab("drop"));

        const statLabel = new g.Label({ scene, text: "", font: fontTiny, fontSize: 18, textColor: "#111827", x: 720, y: 104 });
        scene.append(statLabel);

        function updateStatLabel() {
            statLabel.text =
                "HP " + Math.floor(stats.hp) + "/" + stats.maxHP +
                "  MP " + Math.floor(stats.mp) + "/" + stats.maxMP +
                "\nATK " + stats.atk + "  DEF " + stats.def +
                "  MATK " + stats.matk + "  MDEF " + stats.mdef +
                "\nEVD " + stats.evd + "  SPD " + stats.spd;
            statLabel.invalidate();
        }

        const skillLabel = new g.Label({ scene, text: "", font: fontTiny, fontSize: 18, textColor: "#111827", x: 720, y: 180 });
        scene.append(skillLabel);

        function updateSkillLabel() {
            const lines = [];
            const keys = Object.keys(owned);
            keys.sort();
            for (let i = 0; i < keys.length; i++) {
                const s = owned[keys[i]];
                const tag = s.isSca ? "(スカ)" : "Lv" + s.lv;
                lines.push(s.name + " " + tag);
                if (lines.length >= 10) break;
            }
            if (lines.length === 0) lines.push("(まだ何も得ていない)");
            skillLabel.text = "スキル\n" + lines.join("\n");
            skillLabel.invalidate();
        }

        // overlay
        const overlay = new g.FilledRect({ scene, cssColor: "#000000", width: W, height: H, opacity: 0.0, touchable: true });
        scene.append(overlay);
        const overlayText = new g.Label({ scene, text: "", font, fontSize: 44, textColor: "#ffffff", x: 80, y: 180 });
        scene.append(overlayText);
        const overlaySub = new g.Label({ scene, text: "", font: fontSmall, fontSize: 24, textColor: "#ffffff", x: 80, y: 280 });
        scene.append(overlaySub);

        function showOverlay(mainText, subText, opacity) {
            overlay.opacity = opacity;
            overlay.modified();
            overlayText.text = mainText;
            overlayText.invalidate();
            overlaySub.text = subText || "";
            overlaySub.invalidate();
        }

        // memory minigame (separated)
        const memInfo = new g.Label({ scene, text: "揃えるとスキル獲得。高位は条件未達だとスカ。", font: fontTiny, fontSize: 18, textColor: "#111827", x: 40, y: 110 });
        memoryLayer.append(memInfo);
        const memGrid = new g.E({ scene, x: 40, y: 150 });
        memoryLayer.append(memGrid);
        const memPairLabel = new g.Label({ scene, text: "PAIR: 0", font: fontTiny, fontSize: 18, textColor: "#111827", x: 40, y: 640 });
        memoryLayer.append(memPairLabel);

        function updateMemPairLabel(memPairs) {
            memPairLabel.text = "PAIR: " + memPairs + "  (思考の実績: " + unlockState.pairs + ")";
            memPairLabel.invalidate();
        }

        // create memory game module
        const memoryGame = createMemoryGame({
            scene,
            rng,
            fontTiny,
            lerp,
            randInt,
            choice,
            BASE_SKILLS,
            THINK_SKILLS,
            REPEAT_SKILLS,
            HIGH_SKILLS,
            unlockState,
            highSkillRequirement,
            addOrLevelSkill,
            tryPromoteScaSkills,
            onPairsChanged: (pairs) => {
                updateMemPairLabel(pairs);
                updateSkillLabel();
                updateStatLabel();
            },
            onStatsChanged: () => {
                updateSkillLabel();
                updateStatLabel();
            }
        });

        // drop UI
        const dropInfo = new g.Label({ scene, text: "左右ドラッグで位置調整→タップで落下。合体でLvUP。スカ同士は対消滅。", font: fontTiny, fontSize: 18, textColor: "#111827", x: 40, y: 110 });
        dropLayer.append(dropInfo);

        const dropArea = new g.FilledRect({ scene, cssColor: "#f3f4f6", x: drop.areaX, y: drop.areaY, width: drop.areaW, height: drop.areaH, opacity: 1.0, touchable: true });
        dropLayer.append(dropArea);

        const dropBorder = new g.FilledRect({ scene, cssColor: "#111827", x: drop.areaX, y: drop.areaY, width: drop.areaW, height: 2 });
        dropLayer.append(dropBorder);
        const dropBorder2 = new g.FilledRect({ scene, cssColor: "#111827", x: drop.areaX, y: drop.areaY + drop.areaH - 2, width: drop.areaW, height: 2 });
        dropLayer.append(dropBorder2);
        const dropBorderL = new g.FilledRect({ scene, cssColor: "#111827", x: drop.areaX, y: drop.areaY, width: 2, height: drop.areaH });
        dropLayer.append(dropBorderL);
        const dropBorderR = new g.FilledRect({ scene, cssColor: "#111827", x: drop.areaX + drop.areaW - 2, y: drop.areaY, width: 2, height: drop.areaH });
        dropLayer.append(dropBorderR);

        const dropHint = new g.Label({ scene, text: "(反復) 操作: ドラッグで左右 / タップで落下", font: fontTiny, fontSize: 18, textColor: "#111827", x: 720, y: 660 });
        dropLayer.append(dropHint);

        const dropCountLabel = new g.Label({ scene, text: "MERGE: 0", font: fontTiny, fontSize: 18, textColor: "#111827", x: 40, y: 640 });
        dropLayer.append(dropCountLabel);

        function updateDropCountLabel() {
            dropCountLabel.text = "MERGE: " + unlockState.merges + "  SHARD: " + unlockState.thoughtShards + "  SHUFFLE: " + unlockState.shuffles;
            dropCountLabel.invalidate();
        }

        const pieceLayer = new g.E({ scene, x: 0, y: 0 });
        dropLayer.append(pieceLayer);

        function drawPiece(p) {
            const color = p.type === "shard" ? "#f59e0b" : (p.isSca ? "#6b7280" : "#10b981");
            const rect = new g.FilledRect({ scene, cssColor: color, x: p.x - p.r, y: p.y - p.r, width: p.r * 2, height: p.r * 2, opacity: 0.9 });
            pieceLayer.append(rect);
            const t = p.type === "shard" ? "欠片" : (p.isSca ? "スカ" : "Lv" + p.lv);
            const label = new g.Label({ scene, text: p.type === "shard" ? "思" : p.name, font: fontTiny, fontSize: 16, textColor: "#111827", x: rect.x + 4, y: rect.y + 4 });
            pieceLayer.append(label);
            const sub = new g.Label({ scene, text: t, font: fontTiny, fontSize: 14, textColor: "#111827", x: rect.x + 4, y: rect.y + p.r * 2 - 20 });
            pieceLayer.append(sub);
            p._e = rect;
            p._l = label;
            p._s = sub;
        }

        function refreshPieces() {
            if (Array.isArray(pieceLayer.children)) {
                pieceLayer.children.forEach((ch) => ch.destroy());
            }
            drop.pieces.forEach(drawPiece);
            if (drop.active) drawPiece(drop.active);
        }

        function ensureActive(phaseT) {
            if (drop.active || drop.cooldown > 0) return;
            drop.active = spawnPiece(phaseT);
            refreshPieces();
        }

        let dragging = false;
        let dragOffsetX = 0;
        dropArea.onPointDown.add((ev) => {
            if (phase !== "grow") return;
            if (activeTab !== "drop") return;
            if (!drop.active) return;
            dragging = true;
            dragOffsetX = drop.active.x - ev.point.x;
        });
        dropArea.onPointMove.add((ev) => {
            if (!dragging) return;
            if (!drop.active) return;
            drop.active.x = clamp(ev.point.x + dragOffsetX, drop.areaX + drop.active.r + 4, drop.areaX + drop.areaW - drop.active.r - 4);
            refreshPieces();
        });
        dropArea.onPointUp.add(() => {
            dragging = false;
        });

        dropArea.onPointDown.add(() => {
            if (phase !== "grow") return;
            if (activeTab !== "drop") return;
            if (drop.active) {
                drop.pieces.push(drop.active);
                drop.active = null;
                drop.cooldown = 10;
                unlockState.shuffles++;
                memoryGame.resetMemoryDeck(growT());
                memoryGame.renderMemoryCards(memGrid, () => phase, () => activeTab);
                tryPromoteScaSkills();
                updateDropCountLabel();
            }
        });

        // battle UI
        const battleLayer = new g.E({ scene, x: 0, y: 0, visible: false });
        scene.append(battleLayer);

        const battlePanel = new g.FilledRect({ scene, cssColor: "#111827", x: 24, y: 96, width: 1232, height: 600, opacity: 0.92 });
        battleLayer.append(battlePanel);

        const battleInfo = new g.Label({ scene, text: "自動戦闘: 倍速(1-5) / 逃走でスコア確定 / HP0でスコア0", font: fontSmall, fontSize: 24, textColor: "#ffffff", x: 48, y: 120 });
        battleLayer.append(battleInfo);

        const battleView = createBattleView({ scene, battleLayer, fontSmall, fontTiny });

        const battleStat = new g.Label({ scene, text: "", font: fontSmall, fontSize: 24, textColor: "#ffffff", x: 48, y: 170 });
        battleLayer.append(battleStat);

        const battleLog = new g.Label({ scene, text: "", font: fontTiny, fontSize: 18, textColor: "#e5e7eb", x: 48, y: 260 });
        battleLayer.append(battleLog);

        const btnSpeed = [];
        for (let i = 1; i <= 5; i++) {
            const b = new g.FilledRect({ scene, cssColor: i === 1 ? "#3b82f6" : "#374151", x: 48 + (i - 1) * 110, y: 560, width: 100, height: 44, opacity: 0.95, touchable: true });
            battleLayer.append(b);
            const l = new g.Label({ scene, text: i + "x", font: fontSmall, fontSize: 22, textColor: "#ffffff", x: b.x + 34, y: b.y + 10 });
            battleLayer.append(l);
            b.onPointDown.add(() => {
                battle.speed = i;
                for (let k = 0; k < btnSpeed.length; k++) btnSpeed[k].cssColor = "#374151";
                b.cssColor = "#3b82f6";
                btnSpeed.forEach((bb) => bb.modified());
            });
            btnSpeed.push(b);
        }

        const btnEscape = new g.FilledRect({ scene, cssColor: "#ef4444", x: 48 + 5 * 110 + 40, y: 560, width: 180, height: 44, opacity: 0.95, touchable: true });
        battleLayer.append(btnEscape);
        const btnEscapeLabel = new g.Label({ scene, text: "逃走(確定)", font: fontSmall, fontSize: 22, textColor: "#ffffff", x: btnEscape.x + 26, y: btnEscape.y + 10 });
        battleLayer.append(btnEscapeLabel);

        // phase
        let elapsed = 0;
        let phase = "title";

        let titleAutoTimerActive = false;
        let titleAutoElapsed = 0;
        let titleAutoCanceled = false;

        function cancelTitleAutoTimer() {
            if (!titleAutoTimerActive) return;
            titleAutoTimerActive = false;
            titleAutoCanceled = true;
        }

        function startTitleAutoTimer() {
            titleAutoTimerActive = true;
            titleAutoElapsed = 0;
            titleAutoCanceled = false;
        }

        function growT() {
            return clamp((elapsed - PHASE_TITLE) / PHASE_GROW, 0, 1);
        }

        function updateBattleUI() {
            battleStat.text =
                "敵Lv: " + battle.enemyLv + "  撃破: " + battle.kills + "  連勝倍率: x" + battle.streakMul.toFixed(2) +
                "\nHP " + Math.floor(stats.hp) + "/" + stats.maxHP + "  MP " + Math.floor(stats.mp) + "/" + stats.maxMP +
                "  倍速: " + battle.speed + "x";
            battleStat.invalidate();

            const ail = [];
            if (ailments.poison > 0) ail.push("毒");
            if (ailments.paralysis > 0) ail.push("麻痺");
            if (ailments.injury > 0) ail.push("怪我");
            if (ailments.bigInjury > 0) ail.push("大怪我");
            if (ailments.mental > 0) ail.push("精神不安定");
            if (ailments.sick > 0) ail.push("体調不良");
            battleLog.text =
                "状態: " + (ail.length ? ail.join("/") : "なし") +
                "\n高位: " + (countOwned((s) => s.kind === "high" && !s.isSca)) + " / スカ: " + countOwned((s) => s.isSca) +
                "\n才能の壁: " + (battle.wallDefeated ? "突破" : "未") +
                "\n(HP0でスコア0。欲張るほど危険。)";
            battleLog.invalidate();
        }

        function setPhase(p) {
            phase = p;
            if (p === "title") {
                phaseLabel.text = "TITLE";
                phaseLabel.invalidate();
                leftPanel.hide();
                rightPanel.hide();
                memoryLayer.hide();
                dropLayer.hide();
                battleLayer.hide();
                showOverlay(
                    "思考と反復のギフト",
                    "・育成(神経衰弱/落ちもの)でスキルを獲得\n・育成が終わると自動戦闘でスコアを稼ぐ\n・HP0でスコア0 / 逃走で確定\n\n(12秒後に自動で育成へ移行します)",
                    0.70
                );
                startTitleAutoTimer();
            }
            if (p === "grow") {
                phaseLabel.text = "GROW";
                phaseLabel.invalidate();
                showOverlay("", "", 0.0);
                leftPanel.show();
                rightPanel.show();
                battleLayer.hide();
                setTab(activeTab);
                cancelTitleAutoTimer();
            }
            if (p === "battle") {
                phaseLabel.text = "BATTLE";
                phaseLabel.invalidate();
                leftPanel.hide();
                rightPanel.hide();
                memoryLayer.hide();
                dropLayer.hide();
                battleLayer.show();
                showOverlay("", "", 0.0);
                stats.hp = clamp(stats.hp, 1, stats.maxHP);
                stats.mp = clamp(stats.mp, 0, stats.maxMP);
                battleView.resetBattleVisuals(battle, stats);
                updateBattleUI();
                battleView.updateBattleVisuals(battle, stats);
                cancelTitleAutoTimer();
            }
            if (p === "result") {
                phaseLabel.text = "RESULT";
                phaseLabel.invalidate();
                battleLayer.hide();
                showOverlay("結果", "", 0.65);
                cancelTitleAutoTimer();
            }
        }

        function finalizeScoreAndGoResult() {
            const score = calcScore();
            g.game.vars.gameState.score = score;
            const title = decideTitle(score, memoryGame.getPairs(), unlockState.merges);
            setPhase("result");
            showOverlay(
                "SCORE: " + score,
                "称号: " + title + "\n撃破: " + battle.kills + " / 敵Lv: " + battle.enemyLv + " / HP残: " + Math.floor(stats.hp) +
                "\n(ランキングに送信されます)",
                0.70
            );
        }

        btnEscape.onPointDown.add(() => {
            if (phase !== "battle") return;
            battle.escaped = true;
            finalizeScoreAndGoResult();
        });

        // init
        memoryGame.resetMemoryDeck(0);
        memoryGame.renderMemoryCards(memGrid, () => phase, () => activeTab);
        updateMemPairLabel(memoryGame.getPairs());
        updateDropCountLabel();
        updateSkillLabel();
        updateStatLabel();
        setPhase("title");

        overlay.onPointDown.add(() => {
            if (phase !== "title") return;
            cancelTitleAutoTimer();
            showOverlay("", "", 0.0);
            elapsed = PHASE_TITLE;
            setPhase("grow");
        });

        scene.onUpdate.add(() => {
            const dt = 1 / g.game.fps;
            elapsed += dt;
            timeLabel.text = "TIME: " + formatTime(TOTAL_TIME - elapsed);
            timeLabel.invalidate();

            if (phase === "title" && titleAutoTimerActive && !titleAutoCanceled) {
                titleAutoElapsed += dt;
                if (titleAutoElapsed >= 12.0) {
                    titleAutoTimerActive = false;
                    elapsed = Math.max(elapsed, PHASE_TITLE);
                    setPhase("grow");
                }
            }

            if (elapsed < PHASE_TITLE) {
                if (phase !== "title") setPhase("title");
            } else if (elapsed < PHASE_TITLE + PHASE_GROW) {
                if (phase !== "grow") setPhase("grow");
            } else if (elapsed < PHASE_TITLE + PHASE_GROW + PHASE_BATTLE) {
                if (phase !== "battle") setPhase("battle");
            } else if (elapsed < TOTAL_TIME) {
                if (phase !== "result") {
                    finalizeScoreAndGoResult();
                }
            }

            if (phase === "grow") {
                const t = growT();
                if (drop.cooldown > 0) drop.cooldown--;
                ensureActive(t);

                for (let i = 0; i < drop.pieces.length; i++) {
                    const p = drop.pieces[i];
                    p.vy += drop.gravity;
                    p.y += p.vy;

                    p.x = clamp(p.x, drop.areaX + p.r + 4, drop.areaX + drop.areaW - p.r - 4);
                    const floorY = drop.areaY + drop.areaH - p.r - 4;
                    if (p.y > floorY) {
                        p.y = floorY;
                        p.vy *= -0.15;
                        if (Math.abs(p.vy) < 0.2) p.vy = 0;
                    }

                    if (p.y < drop.areaY + 20) {
                        stats.hp = clamp(stats.hp - 0.6, 0, stats.maxHP);
                    }
                }

                resolveCollisions();

                for (let i = 0; i < drop.pieces.length; i++) {
                    const p = drop.pieces[i];
                    if (p.type === "shard" && p.vy === 0 && p.y >= drop.areaY + drop.areaH - p.r - 4) {
                        drop.pieces.splice(i, 1);
                        i--;
                        unlockState.thoughtShards++;
                        stats.mp = clamp(stats.mp + 6, 0, stats.maxMP);
                        tryPromoteScaSkills();
                        updateDropCountLabel();
                        updateStatLabel();
                    }
                }

                refreshPieces();
                updateStatLabel();
                updateSkillLabel();
            }

            if (phase === "battle") {
                const dtBattle = dt * battle.speed;
                battleTick(dtBattle);
                updateBattleUI();
                battleView.updateBattleVisuals(battle, stats);
                if (stats.hp <= 0) {
                    g.game.vars.gameState.score = 0;
                    setPhase("result");
                    showOverlay("SCORE: 0", "HPが尽きた…（欲張りすぎた）", 0.75);
                }
            }
        });
    });

    g.game.pushScene(scene);
}

exports.main = main;
