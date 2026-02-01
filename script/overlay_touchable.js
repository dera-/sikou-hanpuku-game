"use strict";

let patched = false;

function installOverlayTouchablePatch() {
    if (patched) return;
    patched = true;

    const originalAppend = g.Scene.prototype.append;
    g.Scene.prototype.append = function (entity) {
        const result = originalAppend.call(this, entity);
        patchOverlayTouchable(entity);
        return result;
    };

    function patchOverlayTouchable(entity) {
        if (!entity || entity.__namagameOverlayPatched) return;
        if (typeof g.FilledRect !== "function") return;
        if (!(entity instanceof g.FilledRect)) return;
        const widthDelta = Math.abs(entity.width - g.game.width);
        const heightDelta = Math.abs(entity.height - g.game.height);
        if (widthDelta > 4 || heightDelta > 4) return;
        if (entity.cssColor !== "#000000") return;
        entity.__namagameOverlayPatched = true;
        const updateTouchable = () => {
            entity.touchable = entity.opacity > 0;
        };
        entity.onUpdate.add(updateTouchable);
        updateTouchable();
    }
}

module.exports = { installOverlayTouchablePatch };
