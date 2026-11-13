// ========== GLOBALE VARIABELEN & ENGINE ==========
const mass = 15;
const canvas = document.getElementById("renderCanvas");
const engine = new BABYLON.Engine(canvas, true);
let loadingScreenTimeout = null;
let loadingRemovalTimeout = null;
let minimapTimer = 0;

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

// Grind state + cylinder
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

// Character & Ragdoll state
let characterRootNode = null;
let characterSkeleton = null;
let characterRootInitialState = null;
let characterBoneInitialStates = [];
let activeCharacterRagdoll = null;
let isCharacterRagdolled = false;
let ragdollRecoveryYaw = 0;

// Board customization & Scene referenties
let AVAILABLE_WHEELS = [];
let currentWheel = readStoredValue("acidin_wheel", "white");
let wheelMeshes = [];
let wheelsCurrency = Math.max(0, Number.parseInt(readStoredValue("acidin_wheels_currency", "0"), 10) || 0);
let ownedWheels = readStoredJSON(
    "acidin_owned_wheels",
    ["white"],
    value => Array.isArray(value) && value.every(wheel => typeof wheel === "string")
);

let boardAnimGroups = [];
let idleAnim = null;
let pushAnim = null;
let ollieAnim = null;
let crouchAnim = null;
let uncrouchAnim = null;
let currentBoardAnim = null;
let currentBoardAnimEndObserver = null;
let boardParts = { root: null, board: null, deck: null, frontTruck: null, rearTruck: null, wheels: { FL: null, FR: null, RL: null, RR: null } };

let gameScene = null;
let gameCamera = null;
let gameSkyMaterial = null;
let gameLight = null;
let grindCylinder = null;
let boardLine = null;
let boardPhysics = null;
let originalFriction = 0.5;

let previewEngine = null;
let previewScene = null;
let previewBoardRoot = null;
let previewWheelMeshes = [];
let isLightMode = readStoredValue("acidin_light_mode") === "true";
let LANGUAGE_OPTIONS = ["en", "nl", "es", "de", "fr"];
let currentLanguage = readStoredValue("acidin_language", "en");
if (!LANGUAGE_OPTIONS.includes(currentLanguage)) currentLanguage = "en";
let LANGUAGE_STRINGS = {};

let MAP_SCALE = 12;
const TEST_PARK_SCALE_MULTIPLIER = 5;
let PREVIEW_SCALE = 3.2;
let PREVIEW_CAMERA_RADIUS = 6;
let PREVIEW_MIN_RADIUS = 3;
let PREVIEW_MAX_RADIUS = 12;
let IDLE_MOTION_SCALE = 3;
let collectiveObjects = [];
let grindableLines = [];
let activeMapId = null;
let activeMapMeshes = [];
let activeMapAggregates = [];
let activeMapColliderMeshes = [];
let playerPhysicsMesh = null;
let playerPhysicsBody = null;

// ========== LOCAL STORAGE HELPERS ==========
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

// ========== KEYBINDINGS & VERTALING HELPERS ==========
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
// ========== SETTINGS.JSON LADEN ==========
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
    originalFriction = physics.friction;
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
// ========== SCORE & TRICK SYSTEEM ==========
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

        const oldest = trickInputBuffer[0];
        if (force || (now - oldest.time) > trickComboWindowMs) {
            queueBaseTrick(trickInputBuffer.shift());
        } else {
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

function completeCurrentGrind() {
    if (currentGrindType) addLevelProgress("grind", currentGrindType);
    currentGrindType = null;
    currentGrindMesh = null;
}

// ========== RAGDOLL LOGICA ==========
function beginCharacterRagdoll(velocity, boardPhysicsObj) {
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
    boardPhysicsObj.body.setLinearVelocity(BABYLON.Vector3.Zero());
    boardPhysicsObj.body.setAngularVelocity(BABYLON.Vector3.Zero());
    boardPhysicsObj.body.setMotionType(BABYLON.PhysicsMotionType.ANIMATED);

    const characterScale = Math.abs(characterRootNode.scaling.x);
    const collider = (bone, width, height, depth, massVal, joint) => ({
        bone,
        width: width * characterScale,
        height: height * characterScale,
        depth: depth * characterScale,
        mass: massVal,
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
// ========== SCENE & WERELD OPBOUW ==========
async function setupWorld(scene) {
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
    gameCamera = camera;

    // 2. LUCHT & WOLKEN
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

    // 3. SPELER PHYSICS MESH & LABELS
    const physicsMesh = BABYLON.MeshBuilder.CreateBox(
        "physicsMesh",
        { width: PHYSICS_BOX_WIDTH, height: PHYSICS_BOX_HEIGHT, depth: PHYSICS_BOX_DEPTH },
        scene
    );
    playerPhysicsMesh = physicsMesh;
    physicsMesh.isVisible = false;
    camera.lockedTarget = physicsMesh;

    const usernamePlane = BABYLON.MeshBuilder.CreatePlane("usernameTag", {
        width: 3.2 * 2,
        height: 0.8 * 2
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

    // 4. GRIND HULPLIJNEN
    grindCylinder = BABYLON.MeshBuilder.CreateCylinder("grindCylinder", {
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

    boardLine = BABYLON.MeshBuilder.CreateCylinder("boardLine", {
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
    boardLine.rotation.x = Math.PI / 2;

    // 5. HAVOK PHYSICS BODY
    boardPhysics = new BABYLON.PhysicsAggregate(
        physicsMesh,
        BABYLON.PhysicsShapeType.BOX,
        { mass: physics.mass, friction: physics.friction, restitution: physics.restitution },
        scene
    );
    playerPhysicsBody = boardPhysics.body;
    boardPhysics.body.setMotionType(BABYLON.PhysicsMotionType.DYNAMIC);
    boardPhysics.body.setLinearDamping(physics.linearDamping);
    boardPhysics.body.setAngularDamping(physics.angularDamping);

    if (SHOW_PHYSICS_OUTLINE) {
        const viewer = new BABYLON.PhysicsViewer(scene);
        viewer.showBody(boardPhysics.body);
    }

    
}
