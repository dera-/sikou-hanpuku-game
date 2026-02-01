"use strict";

const { clamp, lerp } = require("./utils");

function createBattleView(opts) {
    const scene = opts.scene;
    const battleLayer = opts.battleLayer;
    const fontSmall = opts.fontSmall;
    const fontTiny = opts.fontTiny;

    const field = new g.E({ scene, x: 24, y: 96, width: 1232, height: 600 });
    battleLayer.append(field);

    const enemyBox = new g.FilledRect({ scene, cssColor: "#b91c1c", x: 24 + 860, y: 96 + 170, width: 220, height: 220, opacity: 0.95 });
    field.append(enemyBox);
    const enemyLabel = new g.Label({ scene, text: "ENEMY", font: fontSmall, fontSize: 22, textColor: "#ffffff", x: enemyBox.x + 10, y: enemyBox.y - 34 });
    field.append(enemyLabel);

    const playerBox = new g.FilledRect({ scene, cssColor: "#2563eb", x: 24 + 160, y: 96 + 300, width: 180, height: 180, opacity: 0.95 });
    field.append(playerBox);
    const playerLabel = new g.Label({ scene, text: "YOU", font: fontSmall, fontSize: 22, textColor: "#ffffff", x: playerBox.x + 10, y: playerBox.y - 34 });
    field.append(playerLabel);

    const hpBarBg = new g.FilledRect({ scene, cssColor: "#374151", x: playerBox.x, y: playerBox.y + playerBox.height + 16, width: 260, height: 14, opacity: 1.0 });
    field.append(hpBarBg);
    const hpBar = new g.FilledRect({ scene, cssColor: "#22c55e", x: hpBarBg.x, y: hpBarBg.y, width: hpBarBg.width, height: hpBarBg.height, opacity: 1.0 });
    field.append(hpBar);
    const hpText = new g.Label({ scene, text: "HP", font: fontTiny, fontSize: 18, textColor: "#ffffff", x: hpBarBg.x, y: hpBarBg.y + 18 });
    field.append(hpText);

    const enemyHpBarBg = new g.FilledRect({ scene, cssColor: "#374151", x: enemyBox.x - 40, y: enemyBox.y + enemyBox.height + 16, width: 260, height: 14, opacity: 1.0 });
    field.append(enemyHpBarBg);
    const enemyHpBar = new g.FilledRect({ scene, cssColor: "#f97316", x: enemyHpBarBg.x, y: enemyHpBarBg.y, width: enemyHpBarBg.width, height: enemyHpBarBg.height, opacity: 1.0 });
    field.append(enemyHpBar);
    const enemyHpText = new g.Label({ scene, text: "HP", font: fontTiny, fontSize: 18, textColor: "#ffffff", x: enemyHpBarBg.x, y: enemyHpBarBg.y + 18 });
    field.append(enemyHpText);

    const fxLayer = new g.E({ scene, x: 0, y: 0 });
    battleLayer.append(fxLayer);

    function spawnDamageLabel(x, y, text, color) {
        const lb = new g.Label({ scene, text, font: fontSmall, fontSize: 26, textColor: color || "#ffffff", x, y });
        lb.opacity = 1;
        fxLayer.append(lb);
        let t = 0;
        lb.onUpdate.add(() => {
            t += 1 / g.game.fps;
            lb.y -= 1.2;
            lb.opacity = clamp(1 - t / 0.7, 0, 1);
            lb.modified();
            if (t >= 0.7) lb.destroy();
        });
    }

    function flashRect(rect, color, frames) {
        const orig = rect.cssColor;
        rect.cssColor = color;
        rect.modified();
        scene.setTimeout(() => {
            if (rect.destroyed()) return;
            rect.cssColor = orig;
            rect.modified();
        }, frames);
    }

    function spawnProjectile(fromX, fromY, toX, toY, color) {
        const pr = new g.FilledRect({ scene, cssColor: color || "#fde047", x: fromX, y: fromY, width: 10, height: 6, opacity: 1.0 });
        fxLayer.append(pr);
        let t = 0;
        const dur = 0.25;
        pr.onUpdate.add(() => {
            t += 1 / g.game.fps;
            const k = clamp(t / dur, 0, 1);
            pr.x = lerp(fromX, toX, k);
            pr.y = lerp(fromY, toY, k);
            pr.modified();
            if (k >= 1) pr.destroy();
        });
    }

    // 敵が画面外にズレていく問題を根本回避するため、位置を動かす演出(nudge)を廃止。
    // 代わりにフラッシュ/弾/ダメージ表示のみで「動かない表現」にする。
    function nudge() {
        // no-op
    }

    let enemyMaxHpVis = 30;
    let enemyHpVis = 30;
    let lastEnemyHp = 30;
    let lastKills = 0;
    let lastHp = 0;

    function resetBattleVisuals(battle, stats) {
        enemyMaxHpVis = battle.enemyMaxHP != null ? battle.enemyMaxHP : (30 + battle.enemyLv * 8);
        enemyHpVis = battle.enemyHP != null ? battle.enemyHP : enemyMaxHpVis;
        lastEnemyHp = enemyHpVis;
        lastKills = battle.kills;
        lastHp = stats.hp;

        // 念のため初期位置に固定
        enemyBox.x = 24 + 860;
        playerBox.x = 24 + 160;
        enemyBox.modified();
        playerBox.modified();
    }

    function updateBattleVisuals(battle, stats) {
        // 敵HPバーを実データに追従させる
        if (battle.enemyMaxHP != null) enemyMaxHpVis = battle.enemyMaxHP;
        if (battle.enemyHP != null) enemyHpVis = battle.enemyHP;

        // 敵が倒れた演出(撃破数増加)
        if (battle.kills > lastKills) {
            const diff = battle.kills - lastKills;
            for (let i = 0; i < diff; i++) {
                spawnProjectile(playerBox.x + playerBox.width, playerBox.y + playerBox.height * 0.5, enemyBox.x, enemyBox.y + enemyBox.height * 0.5, "#fde047");
                flashRect(enemyBox, "#ef4444", 4);
            }
            lastKills = battle.kills;
        }

        // 敵HPが減ったときの演出(HP差分で表示)
        if (enemyHpVis < lastEnemyHp - 0.01) {
            flashRect(enemyBox, "#ef4444", 3);
            const d = Math.max(1, Math.floor(lastEnemyHp - enemyHpVis));
            spawnDamageLabel(enemyBox.x + 40, enemyBox.y + 40, "-" + d, "#fca5a5");
            lastEnemyHp = enemyHpVis;
        } else if (enemyHpVis > lastEnemyHp + 0.01) {
            // 次の敵に切り替わった(HPが戻った)
            lastEnemyHp = enemyHpVis;
        }

        // プレイヤー被弾演出
        if (stats.hp < lastHp - 0.01) {
            spawnProjectile(enemyBox.x, enemyBox.y + enemyBox.height * 0.55, playerBox.x + playerBox.width, playerBox.y + playerBox.height * 0.55, "#fb7185");
            flashRect(playerBox, "#f87171", 4);
            spawnDamageLabel(playerBox.x + 20, playerBox.y + 20, "-" + Math.max(1, Math.floor(lastHp - stats.hp)), "#fecaca");
            lastHp = stats.hp;
        }

        const pr = clamp(stats.hp / Math.max(1, stats.maxHP), 0, 1);
        hpBar.width = Math.floor(hpBarBg.width * pr);
        hpBar.modified();
        hpText.text = "HP " + Math.floor(stats.hp) + "/" + stats.maxHP;
        hpText.invalidate();

        const er = clamp(enemyHpVis / Math.max(1, enemyMaxHpVis), 0, 1);
        enemyHpBar.width = Math.floor(enemyHpBarBg.width * er);
        enemyHpBar.modified();
        enemyLabel.text = "ENEMY Lv" + battle.enemyLv;
        enemyLabel.invalidate();
        enemyHpText.text = "HP " + Math.floor(enemyHpVis) + "/" + enemyMaxHpVis;
        enemyHpText.invalidate();

        // 念のため毎フレーム固定(ズレが残らないように)
        if (enemyBox.x !== 24 + 860) {
            enemyBox.x = 24 + 860;
            enemyBox.modified();
        }
        if (playerBox.x !== 24 + 160) {
            playerBox.x = 24 + 160;
            playerBox.modified();
        }
    }

    return {
        resetBattleVisuals,
        updateBattleVisuals
    };
}

module.exports = { createBattleView };
