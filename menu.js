// ========== LAADSCHERM ==========
function hideLoadingScreen() {
    const el = document.getElementById("loadingScreen");
    if (!el) return;
    clearTimeout(loadingScreenTimeout);
    clearTimeout(loadingRemovalTimeout);
    el.classList.add("hidden");
    loadingRemovalTimeout = setTimeout(() => {
        if (el.parentNode) el.remove();
    }, 450);
}

loadingScreenTimeout = setTimeout(hideLoadingScreen, 12000);

function showLoadingError(error) {
    clearTimeout(loadingScreenTimeout);
    clearTimeout(loadingRemovalTimeout);
    const el = document.getElementById("loadingScreen");
    if (!el) return;
    el.classList.remove("hidden");
    el.replaceChildren();
    const message = document.createElement("div");
    message.style.cssText = "text-align:center;color:#f87171;font-family:system-ui;";
    const title = document.createElement("h2");
    title.textContent = translate("loadingError");
    const details = document.createElement("p");
    details.textContent = error.message || String(error);
    message.append(title, details);
    el.append(message);
}

// ========== AUDIO & SCORE UI ==========
let audioCtx = null;
function getAudioCtx() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === "suspended") {
        audioCtx.resume();
    }
    return audioCtx;
}

function playLevelCompleteSound() {
    try {
        const ctx = getAudioCtx();
        const now = ctx.currentTime;

        [523, 784].forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = "sine";
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.3, now + i * 0.08);
            gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.08 + 0.2);
            osc.start(now + i * 0.08);
            osc.stop(now + i * 0.08 + 0.2);
        });
    } catch (e) {
        console.warn("Geluid mislukt:", e);
    }
}

function updateScoreUI() {
    const bankedEl = document.getElementById("bankedScore");
    const pendingEl = document.getElementById("pendingScore");
    const multiplierEl = document.getElementById("scoreMultiplier");
    const messageEl = document.getElementById("trickScoreMessage");
    if (bankedEl) bankedEl.textContent = String(bankedScore);
    if (pendingEl) pendingEl.textContent = String(getPendingScorePreview());
    if (multiplierEl) multiplierEl.textContent = `x${comboMultiplier}`;
    if (messageEl) messageEl.textContent = lastTrickMessage ? translate(lastTrickMessage) : "";

    const specialFlipsList = document.getElementById("specialFlipsList");
    if (specialFlipsList && trickSystemSettings) {
        const trickLabels = {
            shuvit_bs_360: "shuvitBs360",
            shuvit_fs_360: "shuvitFs360",
            kickflip: "trickKickflip",
            heelflip: "trickHeelflip"
        };
        const items = trickSystemSettings.combos
            .filter(pattern => pattern.displayInScore)
            .map(pattern => {
                const item = document.createElement("li");
                const sequence = pattern.sequence
                    .map(key => translate(trickLabels[key] || key))
                    .join(" + ");
                item.textContent = `${translate(pattern.labelKey)}: ${sequence}`;
                return item;
            });
        specialFlipsList.replaceChildren(...items);
    }
}

function updateUsernameTag() {
    if (!usernameLabel) return;
    const texture = usernameLabel.texture;
    texture.clear();
    const fontSize = Math.max(24, Math.min(42 * 2, 42 * 18 * 2 / currentUsername.length));
    texture.drawText(currentUsername, null, 86, `bold ${fontSize}px system-ui`, "#ffffff", "transparent", true);
}
// ========== SHOP & LEVELS UI ==========
function saveWheelProgress() {
    writeStoredValue("acidin_wheels_currency", String(wheelsCurrency));
    writeStoredValue("acidin_owned_wheels", JSON.stringify(ownedWheels));
}

function updateWheelUI() {
    const el = document.getElementById("currentWheel");
    if (el) el.textContent = currentWheel;
}

function updateShopUI() {
    const countEl = document.getElementById("wheelsCount");
    if (countEl) countEl.textContent = wheelsCurrency;

    const previewName = document.getElementById("previewWheelName");
    if (previewName) previewName.textContent = currentWheel;

    const shopList = document.getElementById("shopList");
    if (shopList) {
        shopList.innerHTML = GAME_SETTINGS.gameplay.wheels.map(wheel => {
            const name = wheel.id;
            const owned = ownedWheels.includes(name);
            const price = wheel.price;
            const equipped = currentWheel === name;
            return `<div class="shop-item">
                <span>${name.replaceAll("_", " ")}${equipped ? ` (${translate("equipped")})` : ""}</span>
                ${owned
                    ? `<button class="buy-btn owned" onclick="equipWheel('${name}')">${translate("equip")}</button>`
                    : `<button class="buy-btn" onclick="buyWheel('${name}')" ${wheelsCurrency < price ? "disabled" : ""}>${translate("price", { amount: price })}</button>`
                }
            </div>`;
        }).join("");
    }
    updateLevelUI();
}

window.buyWheel = function (name) {
    const wheel = GAME_SETTINGS.gameplay.wheels.find(item => item.id === name);
    if (!wheel || ownedWheels.includes(name) || wheelsCurrency < wheel.price) return;
    wheelsCurrency -= wheel.price;
    ownedWheels.push(name);
    saveWheelProgress();
    updateShopUI();
};

window.equipWheel = function (name) {
    if (!ownedWheels.includes(name)) return;
    if (boardParts && boardParts.root && gameScene) {
        loadWheelSet(name, boardParts.root, gameScene);
    }
    updateShopUI();
};

function loadLevelState() {
    const levels = GAME_SETTINGS.gameplay.levels;
    const validIds = new Set(levels.map(level => level.id));
    const saved = readStoredJSON("acidin_level_state", null, value =>
        value && typeof value === "object" && !Array.isArray(value) &&
        Number.isInteger(value.currentLevel) &&
        value.progress && typeof value.progress === "object" && !Array.isArray(value.progress) &&
        Array.isArray(value.completed) && Array.isArray(value.collectedStars)
    );
    if (!saved) return {
        currentLevel: levels[0].id,
        progress: {},
        completed: [],
        collectedStars: []
    };

    return {
        currentLevel: validIds.has(saved.currentLevel) ? saved.currentLevel : levels[0].id,
        progress: Object.fromEntries(Object.entries(saved.progress)
            .filter(([, value]) => Number.isInteger(value) && value >= 0)),
        completed: [...new Set(saved.completed.filter(id => validIds.has(id)))],
        collectedStars: [...new Set(saved.collectedStars.filter(name => typeof name === "string"))]
    };
}

function saveLevelState() {
    writeStoredValue("acidin_level_state", JSON.stringify(levelState));
}

function getCurrentLevel() {
    return GAME_SETTINGS.gameplay.levels.find(level => level.id === levelState.currentLevel)
        || GAME_SETTINGS.gameplay.levels[GAME_SETTINGS.gameplay.levels.length - 1];
}

function getLevelGoalProgressKey(level, index) {
    return `${level.id}:${index}`;
}

function updateLevelUI() {
    if (!GAME_SETTINGS || !levelState) return;
    const level = getCurrentLevel();
    const completed = levelState.completed.includes(level.id);
    const name = `${translate("levels")} ${level.id}: ${translate(level.nameKey)}`;
    const hudName = document.getElementById("levelHUDName");
    const hudProgress = document.getElementById("levelHUDProgress");
    if (hudName) hudName.textContent = name;

    const goalsDone = level.goals.reduce((count, goal, index) =>
        count + ((levelState.progress[getLevelGoalProgressKey(level, index)] || 0) >= goal.required ? 1 : 0), 0);
    if (hudProgress) hudProgress.textContent = completed
        ? translate("levelComplete")
        : `${goalsDone} / ${level.goals.length}`;

    const list = document.getElementById("levelList");
    if (!list) return;
    const allComplete = GAME_SETTINGS.gameplay.levels.every(item => levelState.completed.includes(item.id));
    if (allComplete) {
        list.innerHTML = `<p>${translate("allLevelsComplete")}</p>`;
        return;
    }

    const goalsHtml = level.goals.map((goal, index) => {
        const progress = levelState.progress[getLevelGoalProgressKey(level, index)] || 0;
        const done = progress >= goal.required;
        return `<div class="task-item"><span>${translate(goal.labelKey, { required: goal.required })}</span>` +
            `<span class="reward">${done ? "✓" : `${progress} / ${goal.required}`}</span></div>`;
    }).join("");
    list.innerHTML = `<div class="section-title">${name}</div>${goalsHtml}` +
        `<p class="reward">${translate("levelReward", { amount: level.reward })}</p>`;
}

function addLevelProgress(event, target = "") {
    const level = getCurrentLevel();
    if (levelState.completed.includes(level.id)) return;
    let updated = false;
    level.goals.forEach((goal, index) => {
        if (goal.event !== event || goal.target !== target) return;
        const key = getLevelGoalProgressKey(level, index);
        const current = levelState.progress[key] || 0;
        if (current >= goal.required) return;
        levelState.progress[key] = Math.min(goal.required, current + 1);
        updated = true;
    });
    if (!updated) return;

    const levelComplete = level.goals.every((goal, index) =>
        (levelState.progress[getLevelGoalProgressKey(level, index)] || 0) >= goal.required);
    if (levelComplete) {
        levelState.completed.push(level.id);
        wheelsCurrency += level.reward;
        const nextLevel = GAME_SETTINGS.gameplay.levels.find(item => item.id > level.id);
        if (nextLevel) {
            levelState.currentLevel = nextLevel.id;
            const nextMap = GAME_SETTINGS.assets.maps.find(map => map.id === nextLevel.mapId && map.playable);
            if (nextMap && nextMap.id !== activeMapId && gameScene) {
                loadLevelMap(gameScene, nextMap, GAME_SETTINGS.gameplay.physics).catch(error => {
                    console.error(`Map voor level ${nextLevel.id} kon niet worden geladen:`, error);
                });
            }
        }
        playLevelCompleteSound();
        saveWheelProgress();
    }
    saveLevelState();
    refreshLevelStars();
    updateLevelUI();
    updateShopUI();
}
// ========== BOARD PREVIEW IN SHOP ==========
async function initBoardPreview() {
    const previewCanvas = document.getElementById("boardPreview");
    if (!previewCanvas) return;

    previewEngine = new BABYLON.Engine(previewCanvas, true, { preserveDrawingBuffer: true });
    const scene = new BABYLON.Scene(previewEngine);
    scene.clearColor = new BABYLON.Color4(0.06, 0.08, 0.11, 1);
    const camera = new BABYLON.ArcRotateCamera(
        "boardPreviewCamera",
        -Math.PI / 2,
        1.05,
        PREVIEW_CAMERA_RADIUS,
        BABYLON.Vector3.Zero(),
        scene
    );
    camera.lowerRadiusLimit = PREVIEW_MIN_RADIUS;
    camera.upperRadiusLimit = PREVIEW_MAX_RADIUS;
    camera.wheelPrecision = 50;
    camera.panningSensibility = 0;
    camera.attachControl(previewCanvas, true);

    const light = new BABYLON.HemisphericLight("boardPreviewLight", new BABYLON.Vector3(0, 1, 0), scene);
    light.intensity = GAME_SETTINGS.gameplay.board.previewLightIntensity;
    const fill = new BABYLON.DirectionalLight("boardPreviewFill", new BABYLON.Vector3(0, -1, 1), scene);
    fill.intensity = GAME_SETTINGS.gameplay.board.previewFillIntensity;

    const result = await BABYLON.SceneLoader.ImportMeshAsync("", "", GAME_SETTINGS.assets.board, scene);
    const root = result.meshes[0];
    const modelMeshes = result.meshes.filter(mesh => mesh.getTotalVertices && mesh.getTotalVertices() > 0);
    if (!root || modelMeshes.length === 0) {
        throw new Error("Het skateboardmodel bevat geen zichtbare meshes.");
    }

    const bounds = BABYLON.Mesh.MinMax(modelMeshes);
    const center = bounds.min.add(bounds.max).scale(0.5);
    const size = bounds.max.subtract(bounds.min);
    const largestDimension = Math.max(size.x, size.y, size.z);
    if (!Number.isFinite(largestDimension) || largestDimension <= 0) {
        throw new Error("De afmetingen van het skateboardmodel zijn ongeldig.");
    }
    root.position.subtractInPlace(center);
    root.scaling.scaleInPlace(PREVIEW_SCALE / largestDimension);
    root.rotation.y = Math.PI * 0.12;
    camera.radius = Math.max(PREVIEW_MIN_RADIUS, largestDimension * PREVIEW_CAMERA_RADIUS / PREVIEW_SCALE);

    previewScene = scene;
    previewBoardRoot = root;
    await updateBoardPreviewWheel(currentWheel);
    previewEngine.resize();
    previewEngine.runRenderLoop(() => scene.render());
    window.addEventListener("resize", () => previewEngine.resize());
    applyLightMode();
}

// ========== MENU NAVIGATIE & THEMA ==========
let taskMenuOpen = false;
let activeMenuTab = "levels";

window.showMenuTab = function (tab) {
    const validTabs = ["levels", "shop", "settings"];
    if (!validTabs.includes(tab)) return;
    activeMenuTab = tab;
    document.querySelectorAll("[data-menu-tab]").forEach(button => {
        button.classList.toggle("active", button.dataset.menuTab === tab);
    });
    document.querySelectorAll("[data-menu-panel]").forEach(panel => {
        panel.classList.toggle("active", panel.dataset.menuPanel === tab);
    });
    updateLevelUI();
};

function toggleMenuSection(tab) {
    if (taskMenuOpen && activeMenuTab === tab) {
        toggleTaskMenu();
        return;
    }
    if (document.pointerLockElement) document.exitPointerLock();
    if (!taskMenuOpen) toggleTaskMenu();
    window.showMenuTab(tab);
}

function toggleTaskMenu() {
    taskMenuOpen = !taskMenuOpen;
    const el = document.getElementById("taskMenu");
    if (el) el.classList.toggle("open", taskMenuOpen);
    if (taskMenuOpen && previewEngine) {
        requestAnimationFrame(() => previewEngine.resize());
    }
    if (taskMenuOpen && document.pointerLockElement) {
        document.exitPointerLock();
    }
    updateShopUI();
}

function applyLightMode() {
    if (!GAME_SETTINGS) return;
    const boardSettings = GAME_SETTINGS.gameplay.board;
    document.documentElement.dataset.theme = isLightMode ? "light" : "dark";
    const button = document.getElementById("lightModeToggle");
    if (button) {
        button.textContent = isLightMode ? translate("on") : translate("off");
        button.setAttribute("aria-pressed", String(isLightMode));
    }
    if (gameScene) {
        const color = isLightMode ? boardSettings.gameClearLight : boardSettings.gameClearDark;
        gameScene.clearColor = new BABYLON.Color4(...color, 1);
    }
    if (gameSkyMaterial) {
        gameSkyMaterial.diffuseColor = new BABYLON.Color3(...(isLightMode ? boardSettings.skyLight : boardSettings.skyDark));
        gameSkyMaterial.emissiveColor = new BABYLON.Color3(...(isLightMode ? boardSettings.skyEmissiveLight : boardSettings.skyEmissiveDark));
    }
    if (gameLight) gameLight.intensity = isLightMode ? boardSettings.lightIntensityLight : boardSettings.lightIntensityDark;
    if (previewScene) {
        const color = isLightMode ? boardSettings.previewClearLight : boardSettings.previewClearDark;
        previewScene.clearColor = new BABYLON.Color4(...color, 1);
    }
}

window.toggleLightMode = function () {
    isLightMode = !isLightMode;
    writeStoredValue("acidin_light_mode", String(isLightMode));
    applyLightMode();
};

document.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (document.getElementById("onboarding")?.classList.contains("open")) return;
    const target = e.target;
    if (target instanceof HTMLElement &&
        (target.isContentEditable || target.matches("input, select, textarea"))) return;
    const key = e.key.toLowerCase();
    if (keyMatches("settings", key)) {
        e.preventDefault();
        toggleMenuSection("settings");
    } else if (keyMatches("levels", key)) {
        e.preventDefault();
        toggleMenuSection("levels");
    } else if (keyMatches("menu", key)) {
        e.preventDefault();
        toggleMenuSection("shop");
    }
});
// ========== TAAL & ONBOARDING ==========
function applyLanguage() {
    document.documentElement.lang = currentLanguage;
    document.querySelectorAll("[data-i18n]").forEach(element => {
        element.textContent = translate(element.dataset.i18n);
    });
    document.querySelectorAll("[data-i18n-aria-label]").forEach(element => {
        element.setAttribute("aria-label", translate(element.dataset.i18nAriaLabel));
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(element => {
        element.setAttribute("placeholder", translate(element.dataset.i18nPlaceholder));
    });

    const languageSelect = document.getElementById("languageSelect");
    if (languageSelect) languageSelect.value = currentLanguage;

    const wheelHint = document.getElementById("wheelHint");
    if (wheelHint) wheelHint.textContent = translate("wheelHint");
    const controlsHint = document.querySelector("#controlsHint [data-i18n='controlsHint']");
    const controlLabels = {
        movement: [
            getBindingLabel("forward"),
            getBindingLabel("backward"),
            getBindingLabel("left"),
            getBindingLabel("right")
        ].filter(Boolean).join(" | "),
        push: getBindingLabel("push"),
        ollie: getBindingLabel("ollie"),
        grind: getBindingLabel("grind"),
        boardslide: `${getBindingLabel("boardslide")} ${translate("boardslide")}`,
        impossibleControl: `${getBindingLabel("impossible")} ${translate("trickImpossible")}`,
        switchWheels: getBindingLabel("switchWheels"),
        menu: `${getBindingLabel("menu")} ${translate("shop")}`,
        settings: `${getBindingLabel("settings")} ${translate("settings")}`,
        levels: `${getBindingLabel("levels")} ${translate("levels")}`,
        shuvitControl: GAME_SETTINGS.controls.mouse.shuvit[currentLanguage],
        trickControl: GAME_SETTINGS.controls.mouse.tricks[currentLanguage]
    };
    if (controlsHint) controlsHint.textContent = translate("controlsHint", controlLabels);
    const menuCloseHint = document.querySelector("[data-i18n='menuCloseHint']");
    if (menuCloseHint) menuCloseHint.textContent = translate("menuCloseHint", controlLabels);
    const onboardingNextButton = document.getElementById("onboardingNextButton");
    if (onboardingNextButton) {
        onboardingNextButton.textContent = translate(onboardingStep === 2 ? "finish" : "next");
    }
    const tutorialBindings = {
        forward: getBindingLabel("forward"),
        backward: getBindingLabel("backward"),
        left: getBindingLabel("left"),
        right: getBindingLabel("right"),
        push: getBindingLabel("push"),
        ollie: getBindingLabel("ollie"),
        grind: getBindingLabel("grind"),
        boardslide: getBindingLabel("boardslide"),
        impossible: getBindingLabel("impossible"),
        levels: getBindingLabel("levels"),
        menu: getBindingLabel("menu"),
        settings: getBindingLabel("settings")
    };
    document.querySelectorAll("#tutorialControls [data-i18n]").forEach(element => {
        element.textContent = translate(element.dataset.i18n, tutorialBindings);
    });
    applyLightMode();
    updateShopUI();
    updateLevelUI();
    updateScoreUI();
    updateUsernameTag();
    updateOnboardingLanguageButtons();
}

function changeLanguage(language) {
    if (!LANGUAGE_OPTIONS.includes(language)) return;
    currentLanguage = language;
    writeStoredValue("acidin_language", currentLanguage);
    applyLanguage();
}

const languageSelect = document.getElementById("languageSelect");
if (languageSelect) {
    languageSelect.addEventListener("change", () => {
        changeLanguage(languageSelect.value);
    });
}

let onboardingStep = 0;
function updateOnboardingLanguageButtons() {
    const container = document.getElementById("onboardingLanguages");
    if (!container || !GAME_SETTINGS) return;
    container.replaceChildren(...GAME_SETTINGS.languages.map(language => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "onboarding-language";
        button.classList.toggle("active", language.code === currentLanguage);
        button.textContent = language.name;
        button.setAttribute("aria-pressed", String(language.code === currentLanguage));
        button.addEventListener("click", () => changeLanguage(language.code));
        return button;
    }));
}

function showOnboardingStep(step) {
    onboardingStep = step;
    document.getElementById("onboardingStepUsername").hidden = step !== 0;
    document.getElementById("onboardingStepLanguage").hidden = step !== 1;
    document.getElementById("onboardingStepTutorial").hidden = step !== 2;
    document.getElementById("onboardingNextButton").textContent =
        translate(step === 2 ? "finish" : "next");
    document.getElementById("onboardingError").textContent = "";
    updateOnboardingLanguageButtons();
}

function finishOnboarding(skipTutorial = false) {
    const input = document.getElementById("usernameInput");
    const name = input ? input.value.trim().slice(0, 24) : "";
    if (name) currentUsername = name;
    if (!currentUsername) currentUsername = "Skater";
    writeStoredValue("acidin_username", currentUsername);
    writeStoredValue("acidin_onboarding_complete", "true");
    updateUsernameTag();
    document.getElementById("onboarding").classList.remove("open");
    if (!skipTutorial) toggleMenuSection("levels");
}

function setupFirstRunOnboarding() {
    const overlay = document.getElementById("onboarding");
    const input = document.getElementById("usernameInput");
    if (!overlay || !input || readStoredValue("acidin_onboarding_complete") === "true") return;
    input.value = currentUsername === "Skater" ? "" : currentUsername;
    overlay.classList.add("open");
    showOnboardingStep(0);

    document.getElementById("onboardingNextButton").addEventListener("click", () => {
        if (onboardingStep === 0) {
            const name = input.value.trim();
            if (!name) {
                document.getElementById("onboardingError").textContent = translate("usernameRequired");
                input.focus();
                return;
            }
            currentUsername = name.slice(0, 24);
            writeStoredValue("acidin_username", currentUsername);
            updateUsernameTag();
            showOnboardingStep(1);
        } else if (onboardingStep === 1) {
            showOnboardingStep(2);
        } else {
            finishOnboarding();
        }
    });
    document.getElementById("skipTutorialButton").addEventListener("click", () => finishOnboarding(true));
    input.addEventListener("keydown", event => {
        if (event.key === "Enter") document.getElementById("onboardingNextButton").click();
    });
}

// ========== MODALS (CREDITS & TRICK GUIDE) ==========
function setupModal(modalId, buttonId) {
    const modal = document.getElementById(modalId);
    const button = document.getElementById(buttonId);
    const closeButton = modal?.querySelector(".close");
    if (!modal || !button || !closeButton) return;

    button.addEventListener("click", () => { modal.style.display = "block"; });
    closeButton.addEventListener("click", () => { modal.style.display = "none"; });
    modal.addEventListener("click", (event) => {
        if (event.target === modal) modal.style.display = "none";
    });
}

setupModal("creditsModal", "openBtn");
setupModal("trickGuideModal", "trickGuideButton");
