const mass = 15;
const canvas = document.getElementById("renderCanvas");
const engine = new BABYLON.Engine(canvas, true);
let loadingScreenTimeout = null;
let loadingRemovalTimeout = null;
let minimapTimer = 0;


function readStoredValue(key, fallback = null) {
    try {
        return localStorage.getItem(key) ?? fallback;
    } catch (error) {
        console.warn(`Lokale instelling "${key}" kon niet worden gelezen:`, error);
        return fallback;
    }
}

function readStoredJSON(key, fallback, isValid = () => true) {
    const stored = readStoredValue(key);
    if (stored === null) return fallback;
    try {
        const value = JSON.parse(stored);
        return isValid(value) ? value : fallback;
    } catch (error) {
        console.warn(`Opgeslagen gegevens "${key}" zijn ongeldig:`, error);
        return fallback;
    }
}

function writeStoredValue(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch (error) {
        console.warn(`Lokale instelling "${key}" kon niet worden opgeslagen:`, error);
    }
}

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

// Veiligheid: laadscherm altijd weghalen na max 12 seconden
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

// --- VERKORTE PHYSICS BOX VOOR RAMPS ---
let GAME_SETTINGS = null;
const TEST_PARK_ID = new URLSearchParams(window.location.search).get("testPark");
let PHYSICS_BOX_WIDTH = 2.5;
let PHYSICS_BOX_HEIGHT = 0.4;
let PHYSICS_BOX_DEPTH = 4.5;
let SHOW_PHYSICS_OUTLINE = false;

let speed = 0; 
let pushpower = 28;
let lastPushTime = 0;
let PUSH_DELAY = 450;
let maxSpeed = 70;
let coastDeceleration = 0.05;
let brakeDeceleration = 0.8;
let SlowDownPower = coastDeceleration;
let turnSpeed = 2;
let jumpPower = 300;

let ollieTimer = 0;
let OLLIE_DURATION = 0.4;

// --- MUIS CONTROLS ---
let MOUSE_PITCH_SENSITIVITY = 0.04;
let CAMERA_MOUSE_SENSITIVITY = 0.005;
let FLIP_MOUSE_THRESHOLD = 38;
let FLIP_DURATION = 0.45;
let mouseDeltaX = 0;
let mouseDeltaY = 0;
let isPointerLocked = false;
let isLeftMouseDown = false;
let cameraYaw = -Math.PI / 2;
let cameraPitch = 0.85;

// Flip state
let isFlipping = false;
let flipDir = 0;
let flipProgress = 0;
let currentFlipCount = 1;
let activeFlipType = "kickflip";
let isImpossible = false;
let impossibleProgress = 0;

// Shuvit state (alleen visueel)
let isShuviting = false;
let shuvitDir = 0;
let shuvitProgress = 0;
let activeShuvitTurns = 1;
let pendingShuvitWheelDelta = 0;
let shuvitWheelTimer = null;
const SHUVIT_WHEEL_GESTURE_MS = 100;
let SHUVIT_DURATION = 0.32;
let playerIsGrounded = false;
let trickInputBuffer = [];
let pendingScoredTricks = [];
let pendingLevelEvents = [];
let bankedScore = 0;
let comboMultiplier = 1;
let lastTrickMessage = "";
let specialTrickTime = 0;
let specialTrickDuration = 1;
let trickComboWindowMs = 350;
let shuvit360Delta = 180;
let trickSystemSettings = null;
let baseTrickPoints = {};
let currentUsername = readStoredValue("acidin_username", "Skater");
let USERNAME_HIGHT = 2.8;
let levelState = {
    currentLevel: 1,
    progress: {},
    completed: [],
    collectedStars: []
};
let usernameLabel = null;

// Manual state
let isManualing = false;
let manualDir = 0;
let manualProgress = 0;
let MANUAL_DURATION = 0.55;
let MANUAL_FLICK_THRESHOLD = 42;
let MANUAL_PITCH_SPEED = 3.2;

// Grind state + cylinder (pas deze 3 waardes aan voor de grootte)
let isGrinding = false;
let currentGrindMesh = null;
let currentGrindType = null;
let grindAxis = new BABYLON.Vector3(0, 0, 1);
let grindOrigin = new BABYLON.Vector3();
let GRIND_HEIGHT_OFFSET = 0.35;
let GRIND_CYLINDER_DIAMETER = 10.2;
let GRIND_CYLINDER_HEIGHT = 2.5;
let BOARD_LINE_LENGTH = 4.2;
let BOARD_LINE_OFFSET_Y = -0.15;
let LANDING_ALIGNMENT_DEGREES = 30;
let characterRootNode = null;
let characterSkeleton = null;
let characterRootInitialState = null;
let characterBoneInitialStates = [];
let activeCharacterRagdoll = null;
let isCharacterRagdolled = false;
let ragdollRecoveryYaw = 0;

// ========== BOARD CUSTOMIZATION ==========
let AVAILABLE_WHEELS = [];
let currentWheel = readStoredValue("acidin_wheel", "white");
let wheelMeshes = [];

let boardAnimGroups = [];
let idleAnim = null;
let pushAnim = null;
let ollieAnim = null;
let crouchAnim = null;
let uncrouchAnim = null;
let currentBoardAnim = null;
let currentBoardAnimEndObserver = null;
let boardParts = null;
let gameScene = null;
let gameSkyMaterial = null;
let gameLight = null;
let previewEngine = null;
let previewScene = null;
let previewBoardRoot = null;
let previewWheelMeshes = [];
let isLightMode = readStoredValue("acidin_light_mode") === "true";
let LANGUAGE_OPTIONS = ["en", "nl", "es", "de", "fr"];
let currentLanguage = readStoredValue("acidin_language", "en");
if (!LANGUAGE_OPTIONS.includes(currentLanguage)) currentLanguage = "en";

let LANGUAGE_STRINGS = {};

function getBindingAlternatives(binding) {
    if (Array.isArray(binding)) return binding.map(key => [key]);
    if (typeof binding !== "string") return [];
    return binding.split("||").map(alternative =>
        alternative.split("&&").map(key => key.trim().toLowerCase())
    );
}

function isValidKeyBinding(binding) {
    if (Array.isArray(binding)) {
        return binding.length > 0 &&
            binding.every(key => typeof key === "string" && key.length > 0 && !/[&|]/.test(key));
    }
    if (typeof binding !== "string") return false;
    const alternatives = getBindingAlternatives(binding);
    return alternatives.length > 0 &&
        alternatives.every(keys => keys.length > 0 &&
            keys.every(key => key.length > 0 && !/[&|]/.test(key)));
}

async function loadGameSettings() {
    const response = await fetch("settings.json");
    if (!response.ok) {
        throw new Error(`settings.json kon niet worden geladen (HTTP ${response.status}).`);
    }

    const settings = await response.json();
    if (settings.version !== 1 || !settings.gameplay ||
        !Array.isArray(settings.languages) || !settings.translations ||
        !settings.controls?.keyBindings || !settings.assets) {
        throw new Error("settings.json heeft een ongeldig formaat.");
    }
    GAME_SETTINGS = settings;

    const { physics, movement, camera, tricks, board, levels, wheels, starPickupRadius } = settings.gameplay;
    if (![physics, movement, camera, tricks, board].every(value =>
        value && typeof value === "object" && !Array.isArray(value)) ||
        !Array.isArray(wheels) || wheels.length === 0 || !Array.isArray(levels) || levels.length === 0 ||
        !Number.isFinite(starPickupRadius) || starPickupRadius <= 0 ||
        !Number.isFinite(tricks.landingAlignmentDegrees) ||
        tricks.landingAlignmentDegrees <= 0 || tricks.landingAlignmentDegrees >= 90) {
        throw new Error("settings.json mist geldige gameplay-instellingen.");
    }
    if (!Array.isArray(settings.assets.maps) || settings.assets.maps.length === 0 ||
        typeof settings.assets.defaultMapId !== "string" ||
        !settings.assets.maps.some(map => map && map.id === settings.assets.defaultMapId && map.playable)) {
        throw new Error("settings.json mist een geldige standaardmap.");
    }
    const mapIds = new Set(settings.assets.maps
        .filter(map => map && map.playable)
        .map(map => map.id));
    const levelIds = new Set();
    levels.forEach((level, index) => {
        if (!level || !Number.isInteger(level.id) || level.id <= 0 ||
            levelIds.has(level.id) || (index > 0 && level.id <= levels[index - 1].id) ||
            typeof level.nameKey !== "string" || typeof level.mapId !== "string" ||
            !mapIds.has(level.mapId) || !Array.isArray(level.goals) || level.goals.length === 0 ||
            !Number.isFinite(level.reward) || level.reward < 0 ||
            level.goals.some(goal => !goal ||
                !["trick", "grind", "star", "push"].includes(goal.event) ||
                typeof goal.target !== "string" ||
                !Number.isInteger(goal.required) || goal.required <= 0 ||
                typeof goal.labelKey !== "string")) {
            throw new Error("settings.json bevat ongeldige leveldoelen.");
        }
        levelIds.add(level.id);
    });
    trickSystemSettings = settings.gameplay.trickSystem;
    if (!trickSystemSettings || !Number.isInteger(trickSystemSettings.comboWindowMs) ||
        trickSystemSettings.comboWindowMs <= 0 ||
        !Number.isFinite(trickSystemSettings.shuvit360Delta) ||
        trickSystemSettings.shuvit360Delta <= 0 ||
        !trickSystemSettings.basePoints || !Array.isArray(trickSystemSettings.combos) ||
        !trickSystemSettings.specialTrick) {
        throw new Error("settings.json mist geldige trick-combo- of score-instellingen.");
    }
    const trickPatterns = [...trickSystemSettings.combos, trickSystemSettings.specialTrick];
    if (Object.values(trickSystemSettings.basePoints).some(points =>
        !Number.isFinite(points) || points <= 0) ||
        trickPatterns.some(pattern => !pattern || typeof pattern.name !== "string" ||
            typeof pattern.labelKey !== "string" || !Array.isArray(pattern.sequence) ||
            pattern.sequence.length < 2 || !Number.isFinite(pattern.points) || pattern.points <= 0 ||
            pattern.sequence.some(key => typeof key !== "string" ||
                !Number.isFinite(trickSystemSettings.basePoints[key])))) {
        throw new Error("settings.json bevat ongeldige trick-combo's of scorewaarden.");
    }
    trickComboWindowMs = trickSystemSettings.comboWindowMs;
    shuvit360Delta = trickSystemSettings.shuvit360Delta;
    baseTrickPoints = trickSystemSettings.basePoints;

    PHYSICS_BOX_WIDTH = physics.boxWidth;
    PHYSICS_BOX_HEIGHT = physics.boxHeight;
    PHYSICS_BOX_DEPTH = physics.boxDepth;
    SHOW_PHYSICS_OUTLINE = physics.showOutline;
    pushpower = movement.pushPower;
    PUSH_DELAY = movement.pushDelayMs;
    maxSpeed = movement.maxSpeed;
    coastDeceleration = movement.coastDeceleration;
    brakeDeceleration = movement.brakeDeceleration;
    SlowDownPower = coastDeceleration;
    turnSpeed = movement.turnSpeed;
    jumpPower = movement.jumpImpulse;
    OLLIE_DURATION = movement.ollieDurationSeconds;
    cameraYaw = camera.initialYaw;
    cameraPitch = camera.initialPitch;
    MOUSE_PITCH_SENSITIVITY = tricks.mousePitchSensitivity;
    CAMERA_MOUSE_SENSITIVITY = camera.mouseSensitivity;
    FLIP_MOUSE_THRESHOLD = tricks.flipMouseThreshold;
    FLIP_DURATION = tricks.flipDurationSeconds;
    SHUVIT_DURATION = tricks.shuvitDurationSeconds;
    MANUAL_DURATION = tricks.manualDurationSeconds;
    MANUAL_FLICK_THRESHOLD = tricks.manualFlickThreshold;
    MANUAL_PITCH_SPEED = tricks.manualPitchSpeed;
    GRIND_HEIGHT_OFFSET = tricks.grindHeightOffset;
    GRIND_CYLINDER_DIAMETER = tricks.grindDetectionDiameter;
    GRIND_CYLINDER_HEIGHT = tricks.grindDetectionHeight;
    BOARD_LINE_LENGTH = tricks.boardLineLength;
    BOARD_LINE_OFFSET_Y = tricks.boardLineOffsetY;
    LANDING_ALIGNMENT_DEGREES = tricks.landingAlignmentDegrees;
    USERNAME_HIGHT = board.usernameHight;
    MAP_SCALE = board.mapScale;
    PREVIEW_SCALE = board.previewScale;
    PREVIEW_CAMERA_RADIUS = board.previewCameraRadius;
    PREVIEW_MIN_RADIUS = board.previewMinRadius;
    PREVIEW_MAX_RADIUS = board.previewMaxRadius;
    IDLE_MOTION_SCALE = board.idleMotionScale;
    AVAILABLE_WHEELS = wheels.map(wheel => wheel.id);
    LANGUAGE_OPTIONS = settings.languages.map(language => language.code);
    LANGUAGE_STRINGS = settings.translations;

    if (!AVAILABLE_WHEELS.every(name => typeof name === "string") ||
        !LANGUAGE_OPTIONS.every(code => LANGUAGE_STRINGS[code])) {
        throw new Error("settings.json bevat ongeldige wiel- of taalinstellingen.");
    }
    if (!Number.isFinite(USERNAME_HIGHT) || USERNAME_HIGHT <= 0 ||
        levels.some(level => !LANGUAGE_OPTIONS.every(code =>
            LANGUAGE_STRINGS[code][level.nameKey] &&
            level.goals.every(goal => LANGUAGE_STRINGS[code][goal.labelKey]))) ||
        trickPatterns.some(pattern => !LANGUAGE_OPTIONS.every(code =>
            LANGUAGE_STRINGS[code][pattern.labelKey])) ||
        !LANGUAGE_OPTIONS.every(code => LANGUAGE_STRINGS[code].trickImpossible) ||
        !settings.assets.maps.every(map => map && typeof map.id === "string" &&
            typeof map.path === "string" && typeof map.playable === "boolean" &&
            Array.isArray(map.spawnPosition) && map.spawnPosition.length === 3 &&
            map.spawnPosition.every(Number.isFinite))) {
        throw new Error("settings.json mist vertalingen, mapgegevens of een geldige usernameHight.");
    }
    if (new Set(AVAILABLE_WHEELS).size !== AVAILABLE_WHEELS.length ||
        wheels.some(wheel => !wheel || typeof wheel.id !== "string" ||
            !Number.isFinite(wheel.price) || wheel.price < 0)) {
        throw new Error("settings.json bevat ongeldige wielprijzen.");
    }
    if (!Object.values(settings.controls.keyBindings).every(isValidKeyBinding)) {
        throw new Error("settings.json bevat ongeldige toetsenbordinstellingen.");
    }
    if (!["menu", "levels", "settings", "grind", "boardslide", "impossible"].every(action =>
        Object.prototype.hasOwnProperty.call(settings.controls.keyBindings, action))) {
        throw new Error("settings.json mist toetsen voor een levelmenu of trick.");
    }
    if (!settings.controls.mouse || !["shuvit", "tricks"].every(action =>
        settings.controls.mouse[action] &&
        LANGUAGE_OPTIONS.every(code => typeof settings.controls.mouse[action][code] === "string"))) {
        throw new Error("settings.json bevat ongeldige muisbesturingsteksten.");
    }
    if (!AVAILABLE_WHEELS.includes(currentWheel)) currentWheel = AVAILABLE_WHEELS[0];
    ownedWheels = ownedWheels.filter(wheel => AVAILABLE_WHEELS.includes(wheel));
    if (!ownedWheels.includes(AVAILABLE_WHEELS[0])) ownedWheels.unshift(AVAILABLE_WHEELS[0]);
    if (readStoredValue("acidin_onboarding_complete") !== "true") {
        currentLanguage = settings.defaultLanguage || "en";
    } else if (!LANGUAGE_OPTIONS.includes(currentLanguage)) {
        currentLanguage = settings.defaultLanguage || "en";
    }
    if (!LANGUAGE_OPTIONS.includes(currentLanguage)) currentLanguage = LANGUAGE_OPTIONS[0];
    levelState = loadLevelState();

    const languageSelect = document.getElementById("languageSelect");
    if (languageSelect) {
        languageSelect.replaceChildren(...settings.languages.map(language => {
            const option = document.createElement("option");
            option.value = language.code;
            option.textContent = language.name;
            return option;
        }));
    }
}

function translate(key, values = {}) {
    const fallbackLanguage = LANGUAGE_STRINGS.en || {};
    const language = LANGUAGE_STRINGS[currentLanguage] || fallbackLanguage;
    const template = language[key] || fallbackLanguage[key] || key;
    return template.replace(/\{(\w+)\}/g, (_, name) => values[name] ?? "");
}

function controlPressed(action, inputMap) {
    const alternatives = getBindingAlternatives(GAME_SETTINGS?.controls?.keyBindings?.[action]);
    return alternatives.some(keys => keys.every(key => inputMap[key]));
}

function getFlipTrick(deltaX) {
    return deltaX > 0 ? "kickflip" : "heelflip";
}

function getTrickPatterns() {
    return [...trickSystemSettings.combos, trickSystemSettings.specialTrick];
}

function isSequenceMatch(events, sequence) {
    return events.length >= sequence.length &&
        sequence.every((key, index) => events[index].key === key);
}

function hasUnorderedMatch(events, sequence) {
    if (events.length < sequence.length) return false;
    const needed = {};
    for (const key of sequence) needed[key] = (needed[key] || 0) + 1;
    const found = {};
    for (const event of events) {
        if (needed[event.key]) {
            found[event.key] = (found[event.key] || 0) + 1;
        }
    }
    return Object.keys(needed).every(key => (found[key] || 0) >= needed[key]);
}

function setTrickMessage(key) {
    lastTrickMessage = key;
    updateScoreUI();
}

function getPendingScorePreview() {
    let preview = 0;
    let multiplier = comboMultiplier;
    for (const trick of pendingScoredTricks) {
        preview += trick.points * multiplier;
        multiplier += 1;
    }
    for (const event of trickInputBuffer) {
        preview += Number(baseTrickPoints[event.key]) * multiplier;
        multiplier += 1;
    }
    return preview;
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

function flushShuvitWheelInput() {
    if (shuvitWheelTimer !== null) {
        clearTimeout(shuvitWheelTimer);
        shuvitWheelTimer = null;
    }
    if (pendingShuvitWheelDelta === 0) return;

    const wheelDelta = pendingShuvitWheelDelta;
    pendingShuvitWheelDelta = 0;
    const side = wheelDelta > 0 ? "bs" : "fs";
    const turns = Math.abs(wheelDelta) >= shuvit360Delta ? 2 : 1;
    shuvitDir = wheelDelta < 0 ? 1 : -1;
    activeShuvitTurns = turns;
    isShuviting = true;
    shuvitProgress = 0;
    registerTrickInput(`shuvit_${side}_${turns === 2 ? 360 : 180}`, "trickShuvit");
}

function queueBaseTrick(event) {
    pendingScoredTricks.push({
        key: event.key,
        points: Number(baseTrickPoints[event.key]),
        special: false
    });
    setTrickMessage(event.labelKey);
}

function triggerSpecialTrick(special) {
    specialTrickTime = specialTrickDuration;
    setTrickMessage(special.labelKey);
}

function resolveTrickInputBuffer(now = performance.now(), force = false) {
    const patterns = getTrickPatterns();
    while (trickInputBuffer.length > 0) {
        const windowStart = now - trickComboWindowMs;
        const recent = trickInputBuffer.filter(e => e.time >= windowStart);

        // Zoek de langste/speciale combo die unordered past binnen het venster
        let bestMatch = null;
        let bestScore = -1;
        for (const pattern of patterns) {
            if (hasUnorderedMatch(recent, pattern.sequence)) {
                const score = pattern.sequence.length * 10 + (pattern.special ? 5 : 0);
                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = pattern;
                }
            }
        }

        if (bestMatch) {
            // Verwijder de gebruikte events (eerste voorkomens van de benodigde keys)
            const needed = {};
            for (const key of bestMatch.sequence) needed[key] = (needed[key] || 0) + 1;
            const toRemove = [];
            for (let i = 0; i < trickInputBuffer.length && Object.values(needed).some(v => v > 0); i++) {
                const key = trickInputBuffer[i].key;
                if (needed[key] > 0) {
                    needed[key]--;
                    toRemove.push(i);
                }
            }
            // Verwijder van achter naar voren
            for (let i = toRemove.length - 1; i >= 0; i--) {
                trickInputBuffer.splice(toRemove[i], 1);
            }

            pendingScoredTricks.push({
                key: bestMatch.name,
                points: Number(bestMatch.points),
                special: Boolean(bestMatch.special)
            });
            if (bestMatch.special) triggerSpecialTrick(bestMatch);
            else setTrickMessage(bestMatch.labelKey);
            continue;
        }

        // Geen combo: de oudste als losse trick
        const oldest = trickInputBuffer[0];
        if (force || (now - oldest.time) > trickComboWindowMs) {
            queueBaseTrick(trickInputBuffer.shift());
        } else {
            // Nog binnen venster, wacht op meer input
            updateScoreUI();
            return;
        }
    }
    updateScoreUI();
}

function registerTrickInput(key, labelKey = `trick${key[0].toUpperCase()}${key.slice(1)}`) {
    if (playerIsGrounded || !Number.isFinite(baseTrickPoints[key])) return;
    const time = performance.now();
    trickInputBuffer.push({ key, labelKey, time });
    resolveTrickInputBuffer(time);
}

function settleTrickLanding(isBail) {
    resolveTrickInputBuffer(performance.now(), true);
    if (isBail) {
        pendingScoredTricks = [];
        pendingLevelEvents = [];
        comboMultiplier = 1;
        setTrickMessage("bailMessage");
        return;
    }

    if (pendingScoredTricks.length === 0 && pendingLevelEvents.length === 0) {
        comboMultiplier = 1;
        updateScoreUI();
        return;
    }

    for (const trick of pendingScoredTricks) {
        bankedScore += trick.points * comboMultiplier;
        comboMultiplier += 1;
        addLevelProgress("trick", trick.key);
    }
    for (const event of pendingLevelEvents) {
        addLevelProgress(event.event, event.target);
    }
    pendingScoredTricks = [];
    pendingLevelEvents = [];
    updateScoreUI();
}

function isBailLanding(boardUp, velocity, boardRotation) {
    if (boardUp.y < 0.35) return true;

    const horizontalVelocity = new BABYLON.Vector3(velocity.x, 0, velocity.z);
    if (horizontalVelocity.lengthSquared() < 1) return false;

    const forward = BABYLON.Vector3.Forward().rotateByQuaternionToRef(
        boardRotation || BABYLON.Quaternion.Identity(),
        new BABYLON.Vector3()
    );
    forward.y = 0;
    if (forward.lengthSquared() < 0.0001) return true;
    forward.normalize();
    horizontalVelocity.normalize();
    const minimumAlignment = Math.cos(BABYLON.Tools.ToRadians(LANDING_ALIGNMENT_DEGREES));
    return BABYLON.Vector3.Dot(forward, horizontalVelocity) < minimumAlignment;
}

function beginCharacterRagdoll(velocity, boardPhysics) {
    if (isCharacterRagdolled) return;
    if (!characterRootNode || !characterSkeleton || typeof BABYLON.Ragdoll !== "function") {
        console.error("Ragdoll kon niet starten: character-skelet of Babylon Ragdoll API ontbreekt.");
        return;
    }

    boardAnimGroups.forEach(animation => animation.stop());
    currentBoardAnim = null;
    const worldMatrix = characterRootNode.computeWorldMatrix(true);
    const worldPosition = new BABYLON.Vector3();
    const worldRotation = new BABYLON.Quaternion();
    const worldScaling = new BABYLON.Vector3();
    worldMatrix.decompose(worldScaling, worldRotation, worldPosition);
    characterRootNode.parent = null;
    characterRootNode.position.copyFrom(worldPosition);
    characterRootNode.rotationQuaternion = worldRotation;
    characterRootNode.scaling.copyFrom(worldScaling);
    characterRootNode.computeWorldMatrix(true);

    const horizontalSpeedSquared = velocity.x * velocity.x + velocity.z * velocity.z;
    ragdollRecoveryYaw = horizontalSpeedSquared >= 1
        ? Math.atan2(velocity.x, velocity.z)
        : playerPhysicsMesh.rotationQuaternion?.toEulerAngles().y ?? playerPhysicsMesh.rotation.y;
    boardPhysics.body.setLinearVelocity(BABYLON.Vector3.Zero());
    boardPhysics.body.setAngularVelocity(BABYLON.Vector3.Zero());
    boardPhysics.body.setMotionType(BABYLON.PhysicsMotionType.ANIMATED);

    const characterScale = Math.abs(characterRootNode.scaling.x);
    const collider = (bone, width, height, depth, mass, joint) => ({
        bone,
        width: width * characterScale,
        height: height * characterScale,
        depth: depth * characterScale,
        mass,
        ...(joint ? { joint } : {})
    });
    const ballAndSocket = BABYLON.PhysicsConstraintType.BALL_AND_SOCKET;
    activeCharacterRagdoll = new BABYLON.Ragdoll(characterSkeleton, characterRootNode, [
        collider("root", 0.22, 0.14, 0.22, 6),
        collider("leg-left", 0.1, 0.24, 0.1, 1.5, ballAndSocket),
        collider("leg-right", 0.1, 0.24, 0.1, 1.5, ballAndSocket),
        collider("torso", 0.25, 0.32, 0.16, 4, ballAndSocket),
        collider("arm-left", 0.09, 0.22, 0.09, 1, ballAndSocket),
        collider("arm-right", 0.09, 0.22, 0.09, 1, ballAndSocket),
        collider("head", 0.15, 0.15, 0.15, 1, ballAndSocket)
    ]);
    activeCharacterRagdoll.ragdoll();
    isCharacterRagdolled = true;
    const bailOverlay = document.getElementById("bailOverlay");
    if (bailOverlay) bailOverlay.hidden = false;
}

function recoverCharacterFromRagdoll() {
    if (!isCharacterRagdolled) return false;

    activeCharacterRagdoll?.dispose();
    activeCharacterRagdoll = null;
    characterRootNode.parent = characterRootInitialState.parent;
    characterRootNode.position.copyFrom(characterRootInitialState.position);
    characterRootNode.rotation.copyFrom(characterRootInitialState.rotation);
    characterRootNode.rotationQuaternion = characterRootInitialState.rotationQuaternion?.clone() ?? null;
    characterRootNode.scaling.copyFrom(characterRootInitialState.scaling);

    characterBoneInitialStates.forEach(({ bone, node, position, rotation, rotationQuaternion, scaling }) => {
        if (!node) return;
        node.position.copyFrom(position);
        node.rotation.copyFrom(rotation);
        node.rotationQuaternion = rotationQuaternion?.clone() ?? null;
        node.scaling.copyFrom(scaling);
        bone.linkTransformNode(node);
    });
    characterSkeleton.computeAbsoluteMatrices(true);

    playerPhysicsMesh.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(0, ragdollRecoveryYaw, 0);
    playerPhysicsBody.setMotionType(BABYLON.PhysicsMotionType.DYNAMIC);
    playerPhysicsBody.setLinearVelocity(BABYLON.Vector3.Zero());
    playerPhysicsBody.setAngularVelocity(BABYLON.Vector3.Zero());
    isFlipping = false;
    isShuviting = false;
    isImpossible = false;
    if (boardParts?.board) boardParts.board.rotation.set(0, 0, 0);
    if (boardParts?.deck) boardParts.deck.rotation.x = 0;
    speed = 0;
    pendingScoredTricks = [];
    pendingLevelEvents = [];
    trickInputBuffer = [];
    comboMultiplier = 1;
    playerIsGrounded = false;
    isCharacterRagdolled = false;
    const bailOverlay = document.getElementById("bailOverlay");
    if (bailOverlay) bailOverlay.hidden = true;
    playBoardAnim("idle");
    updateScoreUI();
    return true;
}

function keyMatches(action, key) {
    const alternatives = getBindingAlternatives(GAME_SETTINGS?.controls?.keyBindings?.[action]);
    return alternatives.some(keys => keys.includes(key));
}

function getBindingLabel(action) {
    const binding = GAME_SETTINGS.controls.keyBindings[action] || [];
    return getBindingAlternatives(binding).map(keys => keys.map(key => {
        if (key === " ") return "Space";
        if (key === "arrowup") return "↑";
        if (key === "arrowdown") return "↓";
        if (key === "arrowleft") return "←";
        if (key === "arrowright") return "→";
        return key.toUpperCase();
    }).join(" + ")).join(" / ");
}

function playBoardAnim(name, loop = true, reverse = false, returnToIdle = true) {
    if (!boardAnimGroups.length) return false;
    const animationName = name.toLowerCase();
    const anim = boardAnimGroups.find(a => a.name.toLowerCase() === animationName)
        || boardAnimGroups.find(a => a.name.toLowerCase().includes(animationName));
    if (!anim || (anim === currentBoardAnim && loop)) return Boolean(anim);

    if (currentBoardAnimEndObserver && currentBoardAnim) {
        currentBoardAnim.onAnimationGroupEndObservable.remove(currentBoardAnimEndObserver);
        currentBoardAnimEndObserver = null;
    }
    boardAnimGroups.forEach(group => {
        if (group !== anim) group.stop();
    });
    anim.stop();
    currentBoardAnim = anim;
    if (!loop && returnToIdle && anim !== idleAnim && idleAnim) {
        currentBoardAnimEndObserver = anim.onAnimationGroupEndObservable.addOnce(() => {
            if (currentBoardAnim !== anim) return;
            currentBoardAnimEndObserver = null;
            playBoardAnim("idle");
        });
    }
    if (reverse) {
        anim.start(false, Math.abs(anim.speedRatio), anim.to, anim.from);
    } else {
        anim.play(loop);
    }
    return true;
}

function makeIdleMotionVisible(animationGroup) {
    const torsoTrack = animationGroup.targetedAnimations.find(({ target, animation }) =>
        target.name.toLowerCase() === "torso" && animation.targetProperty === "position"
    );
    if (!torsoTrack) {
        console.warn("Idle-animatie heeft geen torso-positie om zichtbaar te versterken.");
        return;
    }

    const keys = torsoTrack.animation.getKeys();
    const yValues = keys
        .filter(key => key.value instanceof BABYLON.Vector3)
        .map(key => key.value.y);
    if (yValues.length < 2) {
        console.warn("Idle-torso-track heeft onvoldoende positie-keyframes.");
        return;
    }

    const centerY = (Math.min(...yValues) + Math.max(...yValues)) / 2;
    const motionScale = IDLE_MOTION_SCALE;
    torsoTrack.animation.setKeys(keys.map(key => {
        if (!(key.value instanceof BABYLON.Vector3)) return key;
        const value = key.value.clone();
        value.y = centerY + (value.y - centerY) * motionScale;
        return { ...key, value };
    }));
    console.info(`Idle-torso-beweging versterkt (${motionScale}x) op de bestaande animatie.`);
}

async function loadWheelSet(name, parentNode, scene) {
    // Verwijder oude wielen
    wheelMeshes.forEach(m => m.dispose());
    wheelMeshes = [];

    try {
        const result = await BABYLON.SceneLoader.ImportMeshAsync("", GAME_SETTINGS.assets.wheelDirectory, name + ".glb", scene);
        const root = result.meshes[0];
        root.parent = parentNode;
        root.position.set(0, 0, 0);
        root.rotationQuaternion = null;
        root.rotation.set(0, 0, 0);
        root.isVisible = false; // root zelf verbergen, alleen de wielen tonen

        const frontTruck = boardParts && boardParts.frontTruck;
        const rearTruck = boardParts && boardParts.rearTruck;

        result.meshes.forEach(m => {
            if (m === root) return;
            m.isVisible = true;
            m.scaling.set(1, 1, 1);

            // Bepaal voor/achter op Z, behoud links/rechts (X)
            const localX = m.position.x;
            const localZ = m.position.z;
            if (localZ >= 0 && frontTruck) {
                m.parent = frontTruck;
                m.position.set(localX, 0, 0);
            } else if (rearTruck) {
                m.parent = rearTruck;
                m.position.set(localX, 0, 0);
            } else {
                m.parent = parentNode;
            }
            wheelMeshes.push(m);
        });

        console.log("Wielen verdeeld over trucks:", name);
        writeStoredValue("acidin_wheel", name);
        currentWheel = name;
        updateWheelUI();
        updateShopUI();
        updateBoardPreviewWheel(name).catch(error => {
            console.error("Previewwielen konden niet worden geladen:", error);
        });
    } catch (err) {
        console.warn("Kon wielen niet laden:", name, err);
    }
}

function cycleWheels(parentNode, scene) {
    const owned = AVAILABLE_WHEELS.filter(w => ownedWheels.includes(w));
    if (owned.length === 0) return;
    const idx = owned.indexOf(currentWheel);
    const next = owned[(idx + 1) % owned.length];
    loadWheelSet(next, parentNode, scene);
}

// ========== LEVEL REWARDS + WHEELS CURRENCY ==========
let wheelsCurrency = Math.max(0, Number.parseInt(readStoredValue("acidin_wheels_currency", "0"), 10) || 0);
let ownedWheels = readStoredJSON(
    "acidin_owned_wheels",
    ["white"],
    value => Array.isArray(value) && value.every(wheel => typeof wheel === "string")
);

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

        // Twee tonen voor een duidelijk "ding"
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

function saveWheelProgress() {
    writeStoredValue("acidin_wheels_currency", String(wheelsCurrency));
    writeStoredValue("acidin_owned_wheels", JSON.stringify(ownedWheels));
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

function refreshLevelStars() {
    if (!GAME_SETTINGS || !Array.isArray(collectiveObjects)) return;
    const level = getCurrentLevel();
    const starGoal = level.goals.find(goal => goal.event === "star");
    const starGoalIndex = starGoal ? level.goals.indexOf(starGoal) : -1;
    const collected = starGoalIndex >= 0 &&
        (levelState.progress[getLevelGoalProgressKey(level, starGoalIndex)] || 0) >= starGoal.required;
    collectiveObjects.forEach(mesh => {
        const starId = mesh.metadata?.levelStarId ?? mesh.name;
        const visible = Boolean(starGoal && !collected && !levelState.collectedStars.includes(starId));
        mesh.setEnabled(visible);
        mesh.isVisible = visible;
    });
}

function checkLevelStarPickups(playerPosition) {
    const level = getCurrentLevel();
    if (!level.goals.some(goal => goal.event === "star")) return;
    collectiveObjects.forEach(mesh => {
        const starId = mesh.metadata?.levelStarId ?? mesh.name;
        if (!mesh.isVisible || levelState.collectedStars.includes(starId)) return;
        if (BABYLON.Vector3.Distance(playerPosition, mesh.getAbsolutePosition()) >=
            GAME_SETTINGS.gameplay.starPickupRadius) return;
        levelState.collectedStars.push(starId);
        mesh.isVisible = false;
        mesh.setEnabled(false);
        addLevelProgress("star");
    });
}

async function loadLevelMap(scene, map, physics) {
    let result;
    try {
        result = await BABYLON.SceneLoader.ImportMeshAsync(
            "",
            "",
            map.path,
            scene,
            undefined,
            map.editorPark ? ".glb" : undefined
        );
    } finally {
        if (map.objectUrl) URL.revokeObjectURL(map.objectUrl);
    }
    activeMapAggregates.forEach(aggregate => aggregate.dispose());
    activeMapColliderMeshes.forEach(mesh => mesh.dispose(false, false));
    activeMapMeshes.forEach(mesh => mesh.dispose(true, false));
    activeMapAggregates = [];
    activeMapColliderMeshes = [];
    activeMapMeshes = result.meshes;
    collectiveObjects = [];
    grindableLines = [];

    result.meshes.forEach(mesh => {
        if (mesh.name === "__root__") {
            if (map.editorPark) {
                mesh.scaling.scaleInPlace(TEST_PARK_SCALE_MULTIPLIER);
            } else {
                mesh.scaling.setAll(MAP_SCALE);
                mesh.position.y -= 100;
            }
        }
    });
    result.meshes.forEach(mesh => {
        if (!mesh.geometry || mesh.name === "__root__") return;
        const name = mesh.name.toLowerCase();
        if (name.includes("grindable_line")) {
            grindableLines.push(mesh);
            mesh.isVisible = false;
            return;
        }
        if (name.includes("objective_collective")) {
            mesh.setEnabled(false);
            mesh.isVisible = false;
            mesh.metadata = { ...mesh.metadata, levelStarId: `${map.id}:${collectiveObjects.length}:${mesh.name}` };
            collectiveObjects.push(mesh);
            return;
        }
        const collisionMesh = createStaticTriangleCollider(mesh, scene);
        if (!collisionMesh) return;
        activeMapColliderMeshes.push(collisionMesh);
        activeMapAggregates.push(new BABYLON.PhysicsAggregate(
            collisionMesh,
            BABYLON.PhysicsShapeType.MESH,
            { mass: 0, friction: physics.mapFriction, restitution: physics.mapRestitution },
            scene
        ));
    });

    const mapChanged = activeMapId !== null && activeMapId !== map.id;
    activeMapId = map.id;
    if (mapChanged && playerPhysicsMesh) {
        playerPhysicsMesh.position.set(...map.spawnPosition);
        playerPhysicsMesh.rotationQuaternion = BABYLON.Quaternion.Identity();
        speed = 0;
        playerPhysicsBody?.setLinearVelocity(BABYLON.Vector3.Zero());
        playerPhysicsBody?.setAngularVelocity(BABYLON.Vector3.Zero());
    }
    refreshLevelStars();
    console.info(`Map geladen: ${map.id}; grindlijnen: ${grindableLines.length}; sterren: ${collectiveObjects.length}`);
}

function createStaticTriangleCollider(sourceMesh, scene) {
    sourceMesh.computeWorldMatrix(true);
    const sourcePositions = sourceMesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
    if (!sourcePositions || sourcePositions.length < 9) return null;

    const collider = new BABYLON.Mesh(`${sourceMesh.name}_physics`, scene);
    const positions = new Float32Array(sourcePositions.length);
    const sourcePoint = new BABYLON.Vector3();
    const worldPoint = new BABYLON.Vector3();
    const worldMatrix = sourceMesh.getWorldMatrix();
    for (let index = 0; index < sourcePositions.length; index += 3) {
        sourcePoint.set(sourcePositions[index], sourcePositions[index + 1], sourcePositions[index + 2]);
        BABYLON.Vector3.TransformCoordinatesToRef(sourcePoint, worldMatrix, worldPoint);
        positions[index] = worldPoint.x;
        positions[index + 1] = worldPoint.y;
        positions[index + 2] = worldPoint.z;
    }

    const indices = sourceMesh.getIndices();
    collider.setVerticesData(BABYLON.VertexBuffer.PositionKind, positions, false, 3);
    collider.setIndices(indices ? Array.from(indices) : Array.from(
        { length: positions.length / 3 },
        (_, index) => index
    ));
    collider.isVisible = false;
    collider.isPickable = false;
    collider.metadata = { editorOnly: true, sourceMesh: sourceMesh.name };
    collider.computeWorldMatrix(true);
    return collider;
}

function completeCurrentGrind() {
    if (currentGrindType) addLevelProgress("grind", currentGrindType);
    currentGrindType = null;
    currentGrindMesh = null;
}

function updateUsernameTag() {
    if (!usernameLabel) return;
    const texture = usernameLabel.texture;
    texture.clear();
    const fontSize = Math.max(24, Math.min(42, 42 * 18 / currentUsername.length));
    texture.drawText(currentUsername, null, 86, `bold ${fontSize}px system-ui`, "#ffffff", "transparent", true);
}

async function updateBoardPreviewWheel(name) {
    if (!previewScene || !previewBoardRoot) return;

    previewWheelMeshes.forEach(mesh => mesh.dispose());
    previewWheelMeshes = [];

    const result = await BABYLON.SceneLoader.ImportMeshAsync("", GAME_SETTINGS.assets.wheelDirectory, name + ".glb", previewScene);
    const root = result.meshes[0];
    root.parent = previewBoardRoot;
    root.position.set(0, 0, 0);
    root.rotationQuaternion = null;
    root.rotation.set(0, 0, 0);
    root.isVisible = false;

    const frontTruck = previewScene.getNodeByName("FrontTruck");
    const rearTruck = previewScene.getNodeByName("RearTruck");
    result.meshes.forEach(mesh => {
        if (mesh === root) return;
        mesh.isVisible = true;
        mesh.scaling.set(1, 1, 1);

        const localX = mesh.position.x;
        const localZ = mesh.position.z;
        if (localZ >= 0 && frontTruck) {
            mesh.parent = frontTruck;
            mesh.position.set(localX, 0, 0);
        } else if (rearTruck) {
            mesh.parent = rearTruck;
            mesh.position.set(localX, 0, 0);
        } else {
            mesh.parent = previewBoardRoot;
        }
        previewWheelMeshes.push(mesh);
    });
}

async function initBoardPreview() {
    const canvas = document.getElementById("boardPreview");
    if (!canvas) return;

    previewEngine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true });
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
    camera.attachControl(canvas, true);

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

function applyLightMode() {
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
let MAP_SCALE = 12;
const TEST_PARK_SCALE_MULTIPLIER = 5;
let PREVIEW_SCALE = 3.2;
let PREVIEW_CAMERA_RADIUS = 6;
let PREVIEW_MIN_RADIUS = 3;
let PREVIEW_MAX_RADIUS = 12;
let IDLE_MOTION_SCALE = 3;
let collectiveObjects = []; // global, wordt gevuld bij map load
let grindableLines = [];
let activeMapId = null;
let activeMapMeshes = [];
let activeMapAggregates = [];
let activeMapColliderMeshes = [];
let playerPhysicsMesh = null;
let playerPhysicsBody = null;

// Keyboard shortcuts open or close their dedicated menu panels.
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
function updateWheelUI() {
    const el = document.getElementById('currentWheel');
    if (el) el.textContent = currentWheel;
}

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

async function createGame() {
    const scene = new BABYLON.Scene(engine);
    scene.animationsEnabled = true;
    const { physics, camera: cameraSettings, board: boardSettings } = GAME_SETTINGS.gameplay;

    const havokInstance = await HavokPhysics();
    const havokPlugin = new BABYLON.HavokPlugin(true, havokInstance);
    scene.enablePhysics(new BABYLON.Vector3(0, physics.gravityY, 0), havokPlugin);

    scene.clearColor = new BABYLON.Color4(...boardSettings.gameClearDark, 1);

    // 1. CAMERA
    const camera = new BABYLON.ArcRotateCamera(
        "camera",
        cameraSettings.initialYaw,
        Math.PI / 3,
        cameraSettings.startingRadius,
        BABYLON.Vector3.Zero(),
        scene
    );
    camera.attachControl(canvas, true);
    camera.lowerBetaLimit = cameraSettings.minimumBeta;
    camera.upperBetaLimit = Math.PI / 2 - cameraSettings.maximumBetaOffset;
    camera.inputs.removeByType("ArcRotateCameraKeyboardMoveInput");
    camera.inputs.removeByType("ArcRotateCameraMouseWheelInput");
    camera.inputs.removeByType("ArcRotateCameraPointersInput");
    camera.fov = cameraSettings.fov;
    camera.maxZ = cameraSettings.maxZ;

    // Betrouwbare blauwe lucht
    const sky = BABYLON.MeshBuilder.CreateSphere("sky", { diameter: 1500, segments: 32 }, scene);
    const skyMat = new BABYLON.StandardMaterial("skyMat", scene);
    gameSkyMaterial = skyMat;
    skyMat.backFaceCulling = false;
    skyMat.disableLighting = true;
    skyMat.diffuseColor = new BABYLON.Color3(...boardSettings.skyDark);
    skyMat.emissiveColor = new BABYLON.Color3(...boardSettings.skyEmissiveDark);
    skyMat.specularColor = new BABYLON.Color3(0, 0, 0);
    sky.material = skyMat;
    sky.infiniteDistance = true;
    sky.isPickable = false;

    // Simpele wolken
    const cloudMat = new BABYLON.StandardMaterial("cloudMat", scene);
    cloudMat.diffuseColor = new BABYLON.Color3(1, 1, 1);
    cloudMat.emissiveColor = new BABYLON.Color3(0.9, 0.9, 0.95);
    cloudMat.alpha = 0.55;
    cloudMat.backFaceCulling = false;

    for (let i = 0; i < 8; i++) {
        const cloud = BABYLON.MeshBuilder.CreatePlane("cloud" + i, { size: 80 + Math.random() * 60 }, scene);
        cloud.material = cloudMat;
        cloud.position = new BABYLON.Vector3(
            (Math.random() - 0.5) * 400,
            40 + Math.random() * 30,
            (Math.random() - 0.5) * 400
        );
        cloud.rotation.x = Math.PI / 2;
        cloud.billboardMode = BABYLON.Mesh.BILLBOARDMODE_Y;
    }

    const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), scene);
    gameLight = light;
    applyLightMode();

    let activeMap = GAME_SETTINGS.assets.maps.find(map =>
        map.id === getCurrentLevel().mapId && map.playable);
    if (!activeMap) throw new Error(`Geen speelbare map gevonden voor level ${levelState.currentLevel}.`);
    if (TEST_PARK_ID) {
        const testPark = await readTestPark(TEST_PARK_ID);
        const objectUrl = URL.createObjectURL(testPark);
        activeMap = {
            id: TEST_PARK_ID,
            path: objectUrl,
            objectUrl,
            editorPark: true,
            playable: true,
            spawnPosition: [0, 5, 0]
        };
        const backToEditor = document.getElementById("backToParkEditor");
        backToEditor.hidden = false;
        backToEditor.href = new URL("MAP/index.html", location.href).href;
        backToEditor.addEventListener("click", event => {
            if (!window.opener || window.opener.closed) return;
            event.preventDefault();
            window.opener.focus();
        });
    }

    try {
        await loadLevelMap(scene, activeMap, physics);
        if (activeMap.editorPark) {
            const testGround = BABYLON.MeshBuilder.CreateGround("test-park-ground", {
                width: 500,
                height: 500
            }, scene);
            testGround.position.y = -0.25;
            testGround.isVisible = false;
            testGround.isPickable = false;
            activeMapAggregates.push(new BABYLON.PhysicsAggregate(
                testGround,
                BABYLON.PhysicsShapeType.BOX,
                { mass: 0, friction: physics.mapFriction, restitution: physics.mapRestitution },
                scene
            ));
        }
    } catch (err) {
        console.error(`Fout bij het laden van ${activeMap.path}:`, err);
        if (activeMap.editorPark) throw err;
        const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 200, height: 200 }, scene);
        const groundMaterial = new BABYLON.StandardMaterial("groundMaterial", scene);
        groundMaterial.diffuseColor = new BABYLON.Color3(0.5, 0.5, 0.5);
        ground.material = groundMaterial;
        new BABYLON.PhysicsAggregate(ground, BABYLON.PhysicsShapeType.BOX, { mass: 0, restitution: 0, friction: 0.5 }, scene);
    }

    async function readTestPark(testParkId) {
        if (!/^test-[0-9a-f-]{36}$/.test(testParkId)) {
            throw new Error("This test-park link is invalid. Return to MakeAPark and press Test park again.");
        }
        if (!("indexedDB" in window)) throw new Error("This browser cannot load a local test park.");
        const database = await new Promise((resolve, reject) => {
            const request = indexedDB.open("acidin-makeapark", 1);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error("Could not open local park storage."));
        });
        return new Promise((resolve, reject) => {
            const transaction = database.transaction("parks", "readonly");
            const request = transaction.objectStore("parks").get(testParkId);
            request.onsuccess = () => {
                const blob = request.result?.testGlb;
                if (blob instanceof Blob) resolve(blob);
                else reject(new Error("This test park is no longer available. Open MakeAPark and test it again."));
            };
            request.onerror = () => reject(request.error || new Error("Could not read the test park."));
            transaction.oncomplete = () => database.close();
            transaction.onerror = () => database.close();
        });
    }
    // 2. PHYSICS MESH
    const physicsMesh = BABYLON.MeshBuilder.CreateBox(
        "physicsMesh", 
        { width: PHYSICS_BOX_WIDTH, height: PHYSICS_BOX_HEIGHT, depth: PHYSICS_BOX_DEPTH }, 
        scene
    );
    playerPhysicsMesh = physicsMesh;
    physicsMesh.position.set(...activeMap.spawnPosition);
    physicsMesh.isVisible = false; 
    const usernamePlane = BABYLON.MeshBuilder.CreatePlane("usernameTag", {
        width: 3.2,
        height: 0.8
    }, scene);
    usernamePlane.position.y = physicsMesh.position.y + USERNAME_HIGHT;
    usernamePlane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
    usernamePlane.isPickable = false;
    const usernameTexture = new BABYLON.DynamicTexture("usernameTexture", { width: 512, height: 128 }, scene, true);
    const usernameMaterial = new BABYLON.StandardMaterial("usernameMaterial", scene);
    usernameMaterial.diffuseTexture = usernameTexture;
    usernameMaterial.opacityTexture = usernameTexture;
    usernameMaterial.emissiveColor = BABYLON.Color3.White();
    usernameMaterial.disableDepthWrite = true;
    usernameMaterial.backFaceCulling = false;
    usernamePlane.material = usernameMaterial;
    usernameLabel = { texture: usernameTexture, mesh: usernamePlane };
    updateUsernameTag();

    // Zichtbare grindCylinder die het board volgt
    const grindCylinder = BABYLON.MeshBuilder.CreateCylinder("grindCylinder", {
        diameter: GRIND_CYLINDER_DIAMETER,
        height: GRIND_CYLINDER_HEIGHT,
        tessellation: 16
    }, scene);
    const cylMat = new BABYLON.StandardMaterial("cylMat", scene);
    cylMat.diffuseColor = new BABYLON.Color3(0, 1, 0.4);
    cylMat.alpha = 0.35;
    cylMat.wireframe = true;
    grindCylinder.material = cylMat;
    grindCylinder.isPickable = false;
    grindCylinder.isVisible = false;

    // Dunne boardLine (het echte center van het board)
    const boardLine = BABYLON.MeshBuilder.CreateCylinder("boardLine", {
        diameter: 0.08,
        height: BOARD_LINE_LENGTH,
        tessellation: 8
    }, scene);
    const lineMat = new BABYLON.StandardMaterial("lineMat", scene);
    lineMat.diffuseColor = new BABYLON.Color3(1, 0.2, 0.2);
    lineMat.emissiveColor = new BABYLON.Color3(0.6, 0, 0);
    boardLine.material = lineMat;
    boardLine.isPickable = false;
    boardLine.isVisible = false;
    // Liggend maken (langs de lengte van het board)
    boardLine.rotation.x = Math.PI / 2;

    camera.lockedTarget = physicsMesh;

    // Camera follow
    const cameraDistance = cameraSettings.followDistance;
    const cameraSmoothness = cameraSettings.smoothness;
    const defaultPitch = cameraSettings.defaultPitch;
    scene.onBeforeRenderObservable.add(() => {
        const dt = engine.getDeltaTime() / 1000;
        const rotation = physicsMesh.rotationQuaternion;
        if (!rotation) return;
        const forward = BABYLON.Vector3.Forward().rotateByQuaternionToRef(rotation, new BABYLON.Vector3());
        forward.y = 0;
        forward.normalize();

        const boardYaw = Math.atan2(forward.x, forward.z);

        if (isLeftMouseDown && isPointerLocked) {
            cameraYaw += mouseDeltaX * CAMERA_MOUSE_SENSITIVITY;
            cameraPitch -= mouseDeltaY * CAMERA_MOUSE_SENSITIVITY;
            cameraPitch = Math.max(cameraSettings.minimumBeta, Math.min(Math.PI / 2 - cameraSettings.maximumBetaOffset, cameraPitch));
        } else {
            let yawDiff = boardYaw - cameraYaw;
            yawDiff = Math.atan2(Math.sin(yawDiff), Math.cos(yawDiff));
            cameraYaw += yawDiff * (1 - Math.exp(-cameraSmoothness * dt));
            cameraPitch += (defaultPitch - cameraPitch) * (1 - Math.exp(-cameraSmoothness * dt));
        }

        const horizontal = Math.cos(cameraPitch);
        const camDir = new BABYLON.Vector3(
            Math.sin(cameraYaw) * horizontal,
            -Math.sin(cameraPitch),
            Math.cos(cameraYaw) * horizontal
        );
        const targetPosition = physicsMesh.position.subtract(camDir.scale(cameraDistance));

        const t = 1 - Math.exp(-cameraSmoothness * dt);
        camera.position = BABYLON.Vector3.Lerp(camera.position, targetPosition, t);
        camera.setTarget(physicsMesh.position);

        // Cylinder + boardLine volgen het board
        grindCylinder.position.copyFrom(physicsMesh.position);
        grindCylinder.position.y += 0.2;
        if (physicsMesh.rotationQuaternion) {
            grindCylinder.rotationQuaternion = physicsMesh.rotationQuaternion.clone();
        }

        boardLine.position.copyFrom(physicsMesh.position);
        boardLine.position.y += BOARD_LINE_OFFSET_Y;
        if (physicsMesh.rotationQuaternion) {
            boardLine.rotationQuaternion = physicsMesh.rotationQuaternion.clone();
            const extra = BABYLON.Quaternion.FromEulerAngles(Math.PI / 2, 0, 0);
            boardLine.rotationQuaternion = physicsMesh.rotationQuaternion.multiply(extra);
        }
    });

    const boardPhysics = new BABYLON.PhysicsAggregate(
        physicsMesh, 
        BABYLON.PhysicsShapeType.BOX, 
        { mass: physics.mass, friction: physics.friction, restitution: physics.restitution },
        scene
    );
    playerPhysicsBody = boardPhysics.body;
    boardPhysics.body.setMotionType(BABYLON.PhysicsMotionType.DYNAMIC);
    boardPhysics.body.setLinearDamping(physics.linearDamping);
    boardPhysics.body.setAngularDamping(physics.angularDamping);
    // Lagere friction tijdens bewegen, anders blijft hij vastzitten
    const originalFriction = physics.friction;

    if (SHOW_PHYSICS_OUTLINE) {
        const viewer = new BABYLON.PhysicsViewer(scene);
        viewer.showBody(boardPhysics.body);
    }
    
    boardParts = { root: null, board: null, deck: null, frontTruck: null, rearTruck: null, wheels: { FL: null, FR: null, RL: null, RR: null } };
    gameScene = scene;

    try {
        const result = await BABYLON.SceneLoader.ImportMeshAsync("", "", GAME_SETTINGS.assets.board, scene);
        const skateboard = result.meshes[0];
        skateboard.parent = physicsMesh;
        boardParts.root = skateboard;
        characterRootNode = scene.getNodeByName("character-skate-boy");
        characterSkeleton = result.skeletons.find(skeleton =>
            skeleton.bones.some(bone => bone.name === "root") &&
            skeleton.bones.some(bone => bone.name === "torso")
        ) || null;

        // Animaties ophalen
        boardAnimGroups = result.animationGroups || [];
        console.table(boardAnimGroups.map(animation => ({
            naam: animation.name,
            begin: animation.from,
            einde: animation.to,
            targets: animation.targetedAnimations.length
        })));

        idleAnim = boardAnimGroups.find(a => {
            const n = a.name.toLowerCase();
            return n.includes("idle");
        });
        pushAnim = boardAnimGroups.find(a => {
            const n = a.name.toLowerCase();
            return n.includes("push");
        });
        ollieAnim = boardAnimGroups.find(a => a.name.toLowerCase().includes("ollie"));
        crouchAnim = boardAnimGroups.find(a => a.name.toLowerCase() === "crouch");
        uncrouchAnim = boardAnimGroups.find(a => a.name.toLowerCase() === "uncrouch");
        if (!crouchAnim && uncrouchAnim) {
            console.info(`Crouch gebruikt de omgekeerde "${uncrouchAnim.name}"-animatie.`);
        }
        if (ollieAnim) {
            ollieAnim.speedRatio = 2;
            console.info(`Ollie-animatie geladen: "${ollieAnim.name}"`);
        } else {
            console.warn("Ollie-animatie niet gevonden in het geladen skateboardmodel.", {
                gevonden: boardAnimGroups.map(animation => animation.name)
            });
        }

        // Stop alle animaties eerst
        boardAnimGroups.forEach(a => a.stop());
        currentBoardAnim = null;
        if (characterRootNode && characterSkeleton) {
            characterRootInitialState = {
                parent: characterRootNode.parent,
                position: characterRootNode.position.clone(),
                rotation: characterRootNode.rotation.clone(),
                rotationQuaternion: characterRootNode.rotationQuaternion?.clone() ?? null,
                scaling: characterRootNode.scaling.clone()
            };
            characterBoneInitialStates = characterSkeleton.bones.map(bone => {
                const node = bone.getTransformNode();
                return {
                    bone,
                    node,
                    position: node?.position.clone(),
                    rotation: node?.rotation.clone(),
                    rotationQuaternion: node?.rotationQuaternion?.clone() ?? null,
                    scaling: node?.scaling.clone()
                };
            });
        } else {
            console.warn("Character-ragdoll niet beschikbaar: het geladen model mist het skelet of character-root.");
        }
        function findByName(name) { return scene.getNodeByName(name); }
        boardParts.deck = findByName("Deck") || findByName("Skateboard_1");
        boardParts.frontTruck = findByName("FrontTruck");
        boardParts.rearTruck = findByName("RearTruck");
        boardParts.wheels.FL = findByName("WheelFL");
        boardParts.wheels.FR = findByName("WheelFR");
        boardParts.wheels.RL = findByName("WheelRL");
        boardParts.wheels.RR = findByName("WheelRR");

        if (boardParts.deck) {
            boardParts.board = new BABYLON.TransformNode("boardTrickPivot", scene);
            boardParts.board.parent = skateboard;
            boardParts.board.position.copyFrom(boardParts.deck.position);
            boardParts.board.rotation.set(0, 0, 0);
            boardParts.board.scaling.set(1, 1, 1);
            boardParts.deck.parent = boardParts.board;
            boardParts.deck.position.set(0, 0, 0);

            // Niet de rotatie forceren als er animaties zijn
            if (boardAnimGroups.length === 0) {
                boardParts.deck.rotationQuaternion = null; 
                boardParts.deck.rotation = new BABYLON.Vector3(0, 0, 0);
            }
            if (boardParts.frontTruck && boardParts.frontTruck.parent !== boardParts.deck) {
                boardParts.frontTruck.parent = boardParts.deck;
            }
            if (boardParts.rearTruck && boardParts.rearTruck.parent !== boardParts.deck) {
                boardParts.rearTruck.parent = boardParts.deck;
            }
        } else {
            console.warn("Skateboardmodel bevat geen boardnode voor visuele tricks.", {
                gevonden: result.meshes.map(mesh => mesh.name)
            });
        }

        // Root nooit forceren als er animaties op zitten
        // (animaties hebben de quaternion nodig)

        Object.values(boardParts.wheels).forEach(wheel => {
            if (wheel) {
                wheel.isVisible = false;
            }
        });

        // Laad gekozen wiel-set (vervangt de standaard wielen visueel)
        await loadWheelSet(currentWheel, skateboard, scene);

        if (idleAnim) {
            makeIdleMotionVisible(idleAnim);
            idleAnim.targetedAnimations.forEach(({ target }) => {
                if (!target) return;
                target.setEnabled(true);
                if (target.isVisible === false) target.isVisible = true;
            });
            idleAnim.setWeightForAllAnimatables(1);
            idleAnim.speedRatio = 1;
            playBoardAnim("idle");
            console.info("Idle gestart na board-setup:", idleAnim.name);
        } else {
            console.warn("Geen idle animatie gevonden!");
        }

    } catch (err) {
        console.error("Failed to load models/skateboard.glb:", err);
        physicsMesh.isVisible = true;
        const fallbackMat = new BABYLON.StandardMaterial("fallback", scene);
        fallbackMat.diffuseColor = new BABYLON.Color3(0.1, 0.65, 0.38);
        physicsMesh.material = fallbackMat;
    }

    // --- INPUT MANAGEMENT ---
    const inputMap = {};
    let canOllie = false;
    scene.onKeyboardObservable.add((kbInfo) => {
        if (isCharacterRagdolled) {
            if (kbInfo.type === BABYLON.KeyboardEventTypes.KEYDOWN) {
                recoverCharacterFromRagdoll();
                canOllie = false;
                Object.keys(inputMap).forEach(key => { inputMap[key] = false; });
            }
            return;
        }
        if (document.getElementById("onboarding")?.classList.contains("open")) return;
        const key = kbInfo.event.key.toLowerCase();
        if (kbInfo.type === BABYLON.KeyboardEventTypes.KEYDOWN) {
            const wasAlreadyDown = inputMap[key] === true;
            inputMap[key] = true;

            if (keyMatches("crouch", key) && !wasAlreadyDown) {
                if (crouchAnim) {
                    playBoardAnim("crouch", false, false, false);
                } else if (uncrouchAnim) {
                    playBoardAnim("uncrouch", false, true, false);
                } else {
                    console.warn("Geen crouch- of uncrouch-animatie gevonden in het skateboardmodel.");
                }
            }

            if (keyMatches("push", key)) {
                const now = performance.now();
                if (now - lastPushTime < PUSH_DELAY) return; // delay
                lastPushTime = now;

                const oldSpeed = speed;
                speed = Math.min(speed + pushpower, maxSpeed);

                if (speed > oldSpeed) {
                    if (pushAnim) playBoardAnim("push", false);
                    addLevelProgress("push", "push");
                }
            }
            if (keyMatches("switchWheels", key)) {
                // Wissel wiel-set
                if (boardParts.root) {
                    cycleWheels(boardParts.root, scene);
                }
            }
            if (isGrinding && keyMatches("boardslide", key) && controlPressed("boardslide", inputMap)) {
                currentGrindType = "boardslide";
                const yaw = Math.atan2(grindAxis.x, grindAxis.z) + Math.PI / 2;
                physicsMesh.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(0, yaw, 0);
            }
            if (keyMatches("grind", key) && !isGrinding) {
                console.log("Q ingedrukt - check grindCylinder vs grindable_line");
                let hitLine = null;
                for (const line of grindableLines) {
                    if (grindCylinder.intersectsMesh(line, false)) {
                        hitLine = line;
                        break;
                    }
                }
                if (hitLine) {
                    isGrinding = true;
                    currentGrindMesh = hitLine;
                    currentGrindType = controlPressed("boardslide", inputMap) ? "boardslide" : "50-50";
                    console.log("Grind gestart op:", hitLine.name);

                    // Richting van de lijn (langste as)
                    const bb = hitLine.getBoundingInfo().boundingBox;
                    const size = bb.extendSizeWorld.scale(2);
                    if (size.x >= size.y && size.x >= size.z) {
                        grindAxis = new BABYLON.Vector3(1, 0, 0);
                    } else if (size.z >= size.x && size.z >= size.y) {
                        grindAxis = new BABYLON.Vector3(0, 0, 1);
                    } else {
                        grindAxis = new BABYLON.Vector3(0, 1, 0);
                    }
                    if (hitLine.rotationQuaternion) {
                        grindAxis = grindAxis.rotateByQuaternionToRef(hitLine.rotationQuaternion, new BABYLON.Vector3());
                    } else if (hitLine.rotation) {
                        const q = BABYLON.Quaternion.FromEulerAngles(hitLine.rotation.x, hitLine.rotation.y, hitLine.rotation.z);
                        grindAxis = grindAxis.rotateByQuaternionToRef(q, new BABYLON.Vector3());
                    }
                    grindAxis.y = 0;
                    if (grindAxis.length() > 0.01) grindAxis.normalize();
                    else grindAxis.set(0, 0, 1);

                    // Neem huidige board-positie als start, maar we centreren straks via boardLine
                    grindOrigin = physicsMesh.position.clone();

                    // Board meteen rechtzetten
                    const yaw = Math.atan2(grindAxis.x, grindAxis.z) +
                        (currentGrindType === "boardslide" ? Math.PI / 2 : 0);
                    physicsMesh.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(0, yaw, 0);
                } else {
                    console.log("Geen grindable_line geraakt door de cylinder.");
                }
            }
            if (keyMatches("impossible", key) && !wasAlreadyDown && !playerIsGrounded && !isImpossible) {
                isImpossible = true;
                impossibleProgress = 0;
                registerTrickInput("impossible");
            }
            if (keyMatches("ollie", key) && controlPressed("ollie", inputMap) &&
                canOllie && ollieTimer <= 0) {
                canOllie = false;
                if (isGrinding) {
                    isGrinding = false;
                    completeCurrentGrind();
                    boardPhysics.body.disablePreStep = true;
                }
                const impulseVector = new BABYLON.Vector3(0, jumpPower, 0);
                boardPhysics.body.applyImpulse(impulseVector, physicsMesh.absolutePosition);
                if (ollieTimer <= 0) {
                    ollieTimer = OLLIE_DURATION;
                    if (ollieAnim) playBoardAnim("ollie", false);
                    pendingLevelEvents.push({ event: "trick", target: "ollie" });
                }
            }
        } else if (kbInfo.type === BABYLON.KeyboardEventTypes.KEYUP) {
            const wasAlreadyDown = inputMap[key] === true;
            inputMap[key] = false;
            if (keyMatches("crouch", key) && wasAlreadyDown && uncrouchAnim) {
                playBoardAnim("uncrouch", false);
            }
        }
    });
    window.addEventListener("blur", () => {
        Object.keys(inputMap).forEach(key => { inputMap[key] = false; });
        isLeftMouseDown = false;
        mouseDeltaX = 0;
        mouseDeltaY = 0;
    });
    document.addEventListener("pointerdown", (event) => {
        if (!isCharacterRagdolled) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        recoverCharacterFromRagdoll();
        canOllie = false;
        Object.keys(inputMap).forEach(key => { inputMap[key] = false; });
    }, true);

    // --- MUIS / POINTER LOCK / WHEEL ---
    canvas.addEventListener("click", () => {
        if (isCharacterRagdolled) return;
        getAudioCtx(); // unlock audio
        if (document.pointerLockElement !== canvas) {
            canvas.requestPointerLock();
        }
    });
    canvas.addEventListener("mousedown", (e) => {
        if (e.button === 0) isLeftMouseDown = true;
    });
    canvas.addEventListener("mouseup", (e) => {
        if (e.button === 0) isLeftMouseDown = false;
    });
    window.addEventListener("mouseup", (e) => {
        if (e.button === 0) isLeftMouseDown = false;
    });
    document.addEventListener("pointerlockchange", () => {
        isPointerLocked = document.pointerLockElement === canvas;
    }, false);
    document.addEventListener("mousemove", (e) => {
        if (isPointerLocked) {
            flushShuvitWheelInput();
            mouseDeltaX += e.movementX || 0;
            mouseDeltaY += e.movementY || 0;
        }
    }, false);

    canvas.addEventListener("wheel", (e) => {
        e.preventDefault();
        if (!isPointerLocked || e.deltaY === 0) return;
        const delta = e.deltaY * (e.deltaMode === 1 ? 100 : e.deltaMode === 2 ? window.innerHeight : 1);
        if (pendingShuvitWheelDelta !== 0 &&
            Math.sign(pendingShuvitWheelDelta) !== Math.sign(delta)) {
            flushShuvitWheelInput();
        }
        pendingShuvitWheelDelta += delta;
        if (Math.abs(pendingShuvitWheelDelta) >= shuvit360Delta) {
            flushShuvitWheelInput();
            return;
        }
        if (shuvitWheelTimer !== null) clearTimeout(shuvitWheelTimer);
        shuvitWheelTimer = setTimeout(flushShuvitWheelInput, SHUVIT_WHEEL_GESTURE_MS);
    }, { passive: false });

    // --- GAME LOOP ---
    scene.onBeforeRenderObservable.add(() => {
        const dt = engine.getDeltaTime() / 1000;
        const currentVelocity = boardPhysics.body.getLinearVelocity();
        if (usernameLabel) {
            usernameLabel.mesh.position.copyFrom(isCharacterRagdolled && characterRootNode
                ? characterRootNode.getAbsolutePosition()
                : physicsMesh.position);
            usernameLabel.mesh.position.y += USERNAME_HIGHT;
        }
        if (isCharacterRagdolled) return;

        // Minimap (throttled)
        minimapTimer += dt;
        const mm = document.getElementById("minimapCanvas");
        if (mm && minimapTimer > 0.07) {
            minimapTimer = 0;
            const ctx = mm.getContext("2d");
            const w = mm.width, h = mm.height;
            ctx.clearRect(0, 0, w, h);
            ctx.fillStyle = "rgba(20, 24, 32, 0.9)";
            ctx.fillRect(0, 0, w, h);

            const scale = 1.8;
            const cx = w / 2, cy = h / 2;
            const px = physicsMesh.position.x;
            const pz = physicsMesh.position.z;

            if (getCurrentLevel().goals.some(goal => goal.event === "star")) {
                ctx.fillStyle = "#fbbf24";
                collectiveObjects.forEach(obj => {
                    if (!obj.isVisible) return;
                    const pos = obj.getAbsolutePosition();
                    const x = cx + (pos.x - px) * scale;
                    const y = cy + (pos.z - pz) * scale;
                    if (x > 4 && x < w - 4 && y > 4 && y < h - 4) {
                        ctx.beginPath();
                        ctx.arc(x, y, 3, 0, Math.PI * 2);
                        ctx.fill();
                    }
                });
            }

            // Player
            ctx.fillStyle = "#4ade80";
            ctx.beginPath();
            ctx.arc(cx, cy, 4, 0, Math.PI * 2);
            ctx.fill();
        }

        checkLevelStarPickups(physicsMesh.position);
        
        // Grind: volg de lijn (tube)
        if (isGrinding && currentGrindMesh) {
            const toBoard = physicsMesh.position.subtract(grindOrigin);
            const along = BABYLON.Vector3.Dot(toBoard, grindAxis);
            const projected = grindOrigin.add(grindAxis.scale(along));

            // Check of we nog op de lijn zitten (cylinder intersect)
            const stillOn = grindCylinder.intersectsMesh(currentGrindMesh, false);

            if (!stillOn) {
                console.log("Grind beëindigd");
                isGrinding = false;
                completeCurrentGrind();
                boardPhysics.body.disablePreStep = true;
            } else {
                // Centreer het board zodat de boardLine exact op de grindable_line ligt
                // 1. Huidige positie van de boardLine
                const boardLinePos = boardLine.getAbsolutePosition();

                // 2. Projecteer die positie op de rail-as
                const toLine = boardLinePos.subtract(grindOrigin);
                const along = BABYLON.Vector3.Dot(toLine, grindAxis);
                const pointOnRail = grindOrigin.add(grindAxis.scale(along));

                // 3. Verschil berekenen en het hele board verschuiven
                const offset = pointOnRail.subtract(boardLinePos);
                offset.y = 0; // alleen horizontaal centreren (hoogte apart)

                const targetPos = physicsMesh.position.add(offset);
                // Hoogte zachtjes naar de rail
                targetPos.y = BABYLON.Scalar.Lerp(physicsMesh.position.y, pointOnRail.y + GRIND_HEIGHT_OFFSET, 0.25);

                boardPhysics.body.disablePreStep = false;
                physicsMesh.position.copyFrom(targetPos);

                // Update origin zodat we blijven volgen
                grindOrigin.addInPlace(offset);

                const grindSpeed = Math.max(speed, 12);
                const vel = grindAxis.scale(grindSpeed);
                boardPhysics.body.setLinearVelocity(new BABYLON.Vector3(vel.x, 0, vel.z));
                boardPhysics.body.setAngularVelocity(BABYLON.Vector3.Zero());

                const yaw = Math.atan2(grindAxis.x, grindAxis.z) +
                    (currentGrindType === "boardslide" ? Math.PI / 2 : 0);
                physicsMesh.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(0, yaw, 0);
            }
        } else if (boardPhysics.body.disablePreStep === false) {
            boardPhysics.body.disablePreStep = true;
        }

        // Ground check
        let isGrounded = false;
        const groundRayOrigin = physicsMesh.position.clone();
        groundRayOrigin.y += 0.2;
        const groundRay = new BABYLON.Ray(groundRayOrigin, BABYLON.Vector3.Down(), 0.8);
        const groundHit = scene.pickWithRay(groundRay, (m) => m !== physicsMesh && m !== grindCylinder && m !== boardLine);
        isGrounded = !!(groundHit && groundHit.hit);
        const wasGrounded = playerIsGrounded;
        playerIsGrounded = isGrounded;
        resolveTrickInputBuffer();
        if (!wasGrounded && isGrounded) {
            const boardUp = physicsMesh.rotationQuaternion
                ? BABYLON.Vector3.Up().rotateByQuaternionToRef(
                    physicsMesh.rotationQuaternion,
                    new BABYLON.Vector3()
                )
                : BABYLON.Vector3.Up();
            const isBail = isBailLanding(boardUp, currentVelocity, physicsMesh.rotationQuaternion);
            settleTrickLanding(isBail);
            if (isBail) beginCharacterRagdoll(currentVelocity, boardPhysics);
        }
        if (isGrounded && Math.abs(currentVelocity.y) < 1 && ollieTimer <= 0) {
            canOllie = true;
        }

        // Muur-bail via snelheidsval + anti-stuck
        if (!isCharacterRagdolled && !isGrinding) {
            const prevSpeed = window.prevHorizontalSpeed || 0;
            const currSpeed = Math.sqrt(currentVelocity.x * currentVelocity.x + currentVelocity.z * currentVelocity.z);
            window.prevHorizontalSpeed = currSpeed;

            // Alleen bail bij échte muur-impact (heel plotselinge val + nog steeds snel)
            if (prevSpeed > 18 && currSpeed < prevSpeed * 0.35 && currSpeed > 4) {
                speed = 0;
                boardPhysics.body.setLinearVelocity(BABYLON.Vector3.Zero());
                beginCharacterRagdoll(currentVelocity, boardPhysics);
            }

            // Vastzitten fixen door positie hard te zetten (zelfde als grind)
            if (currSpeed < 1.2 && speed < 2) {
                const origin = physicsMesh.position.add(new BABYLON.Vector3(0, 0.45, 0));
                const filter = m => m !== physicsMesh && m !== grindCylinder && m !== boardLine;
                const dirs = [
                    new BABYLON.Vector3(1, 0, 0), new BABYLON.Vector3(-1, 0, 0),
                    new BABYLON.Vector3(0, 0, 1), new BABYLON.Vector3(0, 0, -1),
                    new BABYLON.Vector3(0.7, 0, 0.7), new BABYLON.Vector3(-0.7, 0, 0.7),
                    new BABYLON.Vector3(0.7, 0, -0.7), new BABYLON.Vector3(-0.7, 0, -0.7)
                ];

                for (const dir of dirs) {
                    const hit = scene.pickWithRay(new BABYLON.Ray(origin, dir, 0.5), filter);
                    if (hit?.hit) {
                        const n = hit.getNormal(true);
                        if (n && n.y < 0.5) {
                            const push = n.clone();
                            push.y = 0.15;
                            push.normalize();

                            // Zelfde methode als grind: physics volgt de positie
                            boardPhysics.body.disablePreStep = false;
                            physicsMesh.position.addInPlace(push.scale(0.3));
                            boardPhysics.body.setLinearVelocity(BABYLON.Vector3.Zero());
                            boardPhysics.body.setAngularVelocity(BABYLON.Vector3.Zero());
                            speed = 0;
                            break;
                        }
                    }
                }
            }
        }

        let angularVel = new BABYLON.Vector3(0, 0, 0);
        
        if (!isGrinding) {
            let isVertical = false;
            const rotQuat = physicsMesh.rotationQuaternion;
            if (rotQuat) {
                const boardUp = BABYLON.Vector3.Up().rotateByQuaternionToRef(rotQuat, new BABYLON.Vector3());
                isVertical = Math.abs(boardUp.y) < 0.4;
            }

            if (controlPressed("left", inputMap)) {
                if (isVertical && rotQuat) {
                    const localY = BABYLON.Vector3.Up().rotateByQuaternionToRef(rotQuat, new BABYLON.Vector3());
                    angularVel = localY.scale(-turnSpeed * 1);
                } else {
                    angularVel.y = -turnSpeed;
                }
            } else if (controlPressed("right", inputMap)) {
                if (isVertical && rotQuat) {
                    const localY = BABYLON.Vector3.Up().rotateByQuaternionToRef(rotQuat, new BABYLON.Vector3());
                    angularVel = localY.scale(turnSpeed * 1);
                } else {
                    angularVel.y = turnSpeed;
                }
            } else if (controlPressed("backward", inputMap)) {
                SlowDownPower = brakeDeceleration;
            } else {
                angularVel.y = 0;
                SlowDownPower = coastDeceleration;
            }

            // Muis: pitch alleen in de lucht, manuals ook op de grond
            if (isPointerLocked && !isLeftMouseDown && (mouseDeltaX !== 0 || mouseDeltaY !== 0)) {
                if (rotQuat) {
                    // Pitch alleen in de lucht
                    if (!isGrounded) {
                        const worldPitchAxis = BABYLON.Vector3.Right().rotateByQuaternionToRef(rotQuat, new BABYLON.Vector3());
                        const pitchAmount = -mouseDeltaY * MOUSE_PITCH_SENSITIVITY;
                        angularVel.addInPlace(worldPitchAxis.scale(pitchAmount));
                    }

                    if (isGrounded && !isManualing && Math.abs(mouseDeltaY) > MANUAL_FLICK_THRESHOLD) {
                        isManualing = true;
                        manualDir = mouseDeltaY < 0 ? 1 : -1;
                        manualProgress = 0;
                    }

                    if (!isGrounded && !isFlipping &&
                        Math.abs(mouseDeltaX) > FLIP_MOUSE_THRESHOLD) {
                        const flipCount = Math.max(1, Math.floor(Math.abs(mouseDeltaX) / FLIP_MOUSE_THRESHOLD));
                        isFlipping = true;
                        flipDir = mouseDeltaX > 0 ? 1 : -1;
                        flipProgress = 0;
                        currentFlipCount = flipCount;
                        activeFlipType = getFlipTrick(mouseDeltaX);
                        for (let i = 0; i < flipCount; i++) {
                            registerTrickInput(activeFlipType);
                        }
                    }
                }
                mouseDeltaX = 0;
                mouseDeltaY = 0;
            } else if (isLeftMouseDown) {
                mouseDeltaX = 0;
                mouseDeltaY = 0;
            }

            // Manual uitvoeren (ook op de grond)
            if (isManualing && rotQuat) {
                manualProgress += dt / MANUAL_DURATION;
                if (manualProgress >= 1) {
                    isManualing = false;
                } else {
                    const pitchAxis = BABYLON.Vector3.Right().rotateByQuaternionToRef(rotQuat, new BABYLON.Vector3());
                    angularVel.addInPlace(pitchAxis.scale(manualDir * MANUAL_PITCH_SPEED));
                }
            }

            // Op de grond: sterk afremmen van rare rotaties (voorkomt vastzitten tegen muren)
            if (isGrounded && !isVertical) {
                angularVel.x *= 0.1;
                angularVel.z *= 0.1;
                // Extra: als het board te scheef staat, zachtjes rechtzetten
                if (rotQuat) {
                    const up = BABYLON.Vector3.Up().rotateByQuaternionToRef(rotQuat, new BABYLON.Vector3());
                    if (up.y < 0.85) {
                        const correction = new BABYLON.Vector3(-up.z, 0, up.x).scale(2.5);
                        angularVel.addInPlace(correction);
                    }
                }
            }

            boardPhysics.body.setAngularVelocity(angularVel);
        }

        // Beweging via velocity-blend
        if (!isGrinding) {
            const rotationQuat = physicsMesh.rotationQuaternion;
            if (rotationQuat) {
                const forward = BABYLON.Vector3.Forward().rotateByQuaternionToRef(rotationQuat, new BABYLON.Vector3());
                forward.y = 0;
                if (forward.lengthSquared() > 0.0001) forward.normalize();

                const currentVel = boardPhysics.body.getLinearVelocity();
                let targetX = 0;
                let targetZ = 0;

                if (speed > 0) {
                    const desired = forward.scale(speed);
                    targetX = desired.x;
                    targetZ = desired.z;
                    speed = Math.max(0, speed - SlowDownPower * dt * 60);
                }

                const blend = 0.5;
                boardPhysics.body.setLinearVelocity(new BABYLON.Vector3(
                    BABYLON.Scalar.Lerp(currentVel.x, targetX, blend),
                    currentVel.y,
                    BABYLON.Scalar.Lerp(currentVel.z, targetZ, blend)
                ));
            }
        }
        // Visuele shuvit
        if (boardParts.board && isShuviting) {
            shuvitProgress += dt / SHUVIT_DURATION;
            if (shuvitProgress >= 1) {
                isShuviting = false;
                boardParts.board.rotation.y = 0;
            } else {
                boardParts.board.rotation.y = shuvitDir * shuvitProgress * Math.PI * activeShuvitTurns;
            }
        }

        // Ollie + flip visueel
        if (boardParts.deck) {
            const boardRotation = boardParts.board || boardParts.deck;
            if (ollieTimer > 0) {
                ollieTimer -= dt;
                const progress = (OLLIE_DURATION - ollieTimer) / OLLIE_DURATION;
                if (progress < 0.3) {
                    const t = progress / 0.3;
                    boardRotation.rotation.x = BABYLON.Scalar.Lerp(0, -0.4, t);
                } else {
                    const t = (progress - 0.3) / 0.7;
                    boardRotation.rotation.x = BABYLON.Scalar.Lerp(-0.4, 0, t);
                }
            } else if (!isFlipping) {
                boardRotation.rotation.x = 0;
            }

            if (isFlipping) {
                flipProgress += dt / FLIP_DURATION;
                if (flipProgress >= 1) {
                    isFlipping = false;
                    flipProgress = 0;
                    currentFlipCount = 1;
                    if (boardParts.board) boardParts.board.rotation.set(0, 0, 0);
                } else if (boardParts.board) {
                    boardParts.board.rotation.z = flipDir * flipProgress * Math.PI * 2 * currentFlipCount;
                }
            } else if (boardParts.board) {
                boardParts.board.rotation.z = 0;
            }

            if (isImpossible) {
                impossibleProgress += dt / FLIP_DURATION;
                if (impossibleProgress >= 1) {
                    isImpossible = false;
                    impossibleProgress = 0;
                    if (boardParts.board && !isShuviting) boardParts.board.rotation.y = 0;
                } else if (boardParts.board && !isShuviting) {
                    boardParts.board.rotation.y = Math.PI * 2 * impossibleProgress;
                }
            }
        }

        if (specialTrickTime > 0) {
            specialTrickTime = Math.max(0, specialTrickTime - dt);
            const progress = 1 - specialTrickTime / specialTrickDuration;
            if (boardParts.board) {
                boardParts.board.rotation.y = Math.PI * 4 * progress;
                boardParts.board.rotation.z = Math.PI * 2 * progress;
                const pulse = 1 + 0.18 * Math.sin(progress * Math.PI);
                boardParts.board.scaling.set(pulse, pulse, pulse);
                if (specialTrickTime === 0) {
                    boardParts.board.scaling.set(1, 1, 1);
                    if (!isFlipping && !isShuviting) boardParts.board.rotation.set(0, 0, 0);
                }
            }
        }

        // Wielen
        if (speed > 0 && !isGrinding) {
            const wheelRotationAmount = speed * dt * 2.0;
            Object.values(boardParts.wheels).forEach(wheel => {
                if (wheel) {
                    wheel.rotation.x += wheelRotationAmount;
                }
            });
        }
    });

    return scene;
}

loadGameSettings().then(() => {
    applyLanguage();
    return createGame();
}).then((scene) => {
    console.log("Game geladen, laadscherm verbergen");
    hideLoadingScreen();
    updateWheelUI();
    updateShopUI();
    updateLevelUI();
    setupFirstRunOnboarding();
    initBoardPreview().catch((error) => {
        console.error("Skateboardpreview kon niet worden geladen:", error);
    });
    applyLightMode();
    engine.runRenderLoop(() => { scene.render(); });
}).catch((error) => {
    console.error("Failed to initialize game:", error);
    showLoadingError(error);
});

window.addEventListener("resize", () => { engine.resize(); });

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