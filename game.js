const canvas = document.getElementById("renderCanvas");
const engine = new BABYLON.Engine(canvas, true);

function hideLoadingScreen() {
    const el = document.getElementById("loadingScreen");
    if (!el) return;
    el.classList.add("hidden");
    setTimeout(() => {
        if (el.parentNode) el.remove();
    }, 450);
}

// Veiligheid: laadscherm altijd weghalen na max 12 seconden
setTimeout(hideLoadingScreen, 12000);

// --- VERKORTE PHYSICS BOX VOOR RAMPS ---
const PHYSICS_BOX_WIDTH = 2.5;
const PHYSICS_BOX_HEIGHT = 0.4;
const PHYSICS_BOX_DEPTH = 4.5;

const SHOW_PHYSICS_OUTLINE = false;

let speed = 0; 
let pushpower = 7;        
let maxSpeed = 70;        
let SlowDownPower = 0.05; 
let turnSpeed = 2;        
let jumpPower = 300;       

let ollieTimer = 0;
const OLLIE_DURATION = 0.4; 

// --- MUIS CONTROLS ---
const MOUSE_PITCH_SENSITIVITY = 0.04;
const MOUSE_ROLL_SENSITIVITY = 0.12;
const CAMERA_MOUSE_SENSITIVITY = 0.005;
const FLIP_MOUSE_THRESHOLD = 38;
const FLIP_DURATION = 0.45;
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

// Shuvit state (alleen visueel)
let isShuviting = false;
let shuvitDir = 0;
let shuvitProgress = 0;
const SHUVIT_DURATION = 0.32;

// Manual state
let isManualing = false;
let manualDir = 0;
let manualProgress = 0;
const MANUAL_DURATION = 0.55;
const MANUAL_FLICK_THRESHOLD = 42;
const MANUAL_PITCH_SPEED = 3.2;

// Grind state + cylinder (pas deze 3 waardes aan voor de grootte)
let isGrinding = false;
let currentGrindMesh = null;
let grindAxis = new BABYLON.Vector3(0, 0, 1);
let grindOrigin = new BABYLON.Vector3();
const GRIND_HEIGHT_OFFSET = 0.35;
const GRIND_CYLINDER_DIAMETER = 10.2;   // detectie-volume
const GRIND_CYLINDER_HEIGHT = 2.5;
const BOARD_LINE_LENGTH = 4.2;         // lengte van de boardLine (pas aan)
const BOARD_LINE_OFFSET_Y = -0.15;

// ========== BOARD CUSTOMIZATION ==========
const AVAILABLE_WHEELS = [
    "white",
    "peach",
    "blue",
    "light_blue",
    "light_green",
    "orange",
    "pink",
    "purple",
    "yellow"
];
let currentWheel = localStorage.getItem("acidin_wheel") || "white";
if (!AVAILABLE_WHEELS.includes(currentWheel)) currentWheel = "white";
let wheelMeshes = [];

let boardParts = null;
let gameScene = null;

async function loadWheelSet(name, parentNode, scene) {
    // Verwijder oude wielen
    wheelMeshes.forEach(m => m.dispose());
    wheelMeshes = [];

    try {
        const result = await BABYLON.SceneLoader.ImportMeshAsync("", "models/wheels/", name + ".glb", scene);
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
        localStorage.setItem("acidin_wheel", name);
        currentWheel = name;
        updateWheelUI();
        updateTaskUI();
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

// ========== TASKS + WHEELS CURRENCY ==========
let wheelsCurrency = parseInt(localStorage.getItem("acidin_wheels_currency") || "0", 10);
let ownedWheels = JSON.parse(localStorage.getItem("acidin_owned_wheels") || '["white"]');
if (!ownedWheels.includes("white")) ownedWheels.unshift("white");

let ALL_TASKS = [];
let activeTasks = []; // de 4 taken die je nu ziet
let taskProgress = JSON.parse(localStorage.getItem("acidin_task_progress") || "{}");

async function loadTasks() {
    try {
        const res = await fetch("tasks.json");
        ALL_TASKS = await res.json();
    } catch (e) {
        console.warn("tasks.json niet geladen, fallback");
        ALL_TASKS = [
            { id: "grind5", label: "Start 5 grinds", target: 5, reward: 8, type: "grind" },
            { id: "flip8", label: "Doe 8 flips", target: 8, reward: 10, type: "tricks" }
        ];
    }
    // Start met 4 random taken
    activeTasks = [];
    refillActiveTasks();
    updateTaskUI();
}

function refillActiveTasks() {
    const used = new Set(activeTasks.map(t => t.id));
    while (activeTasks.length < 4 && ALL_TASKS.length > 0) {
        const available = ALL_TASKS.filter(t => !used.has(t.id));
        if (available.length === 0) break;
        const pick = available[Math.floor(Math.random() * available.length)];
        activeTasks.push(pick);
        used.add(pick.id);
        if (!taskProgress[pick.id]) taskProgress[pick.id] = 0;
    }
}

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

function playTaskCompleteSound() {
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

function saveTasks() {
    localStorage.setItem("acidin_wheels_currency", String(wheelsCurrency));
    localStorage.setItem("acidin_owned_wheels", JSON.stringify(ownedWheels));
    localStorage.setItem("acidin_task_progress", JSON.stringify(taskProgress));
}

function addTaskProgress(type, amount = 1) {
    let changed = false;
    const completed = [];

    activeTasks.forEach(task => {
        if (task.type !== type && task.type !== "tricks") return;
        const current = taskProgress[task.id] || 0;
        if (current >= task.target) return;
        taskProgress[task.id] = Math.min(task.target, current + amount);
        if (taskProgress[task.id] >= task.target && current < task.target) {
            wheelsCurrency += task.reward;
            completed.push(task.id);
            playTaskCompleteSound();
        }
        changed = true;
    });

    // Vervang voltooide taken
    if (completed.length > 0) {
        activeTasks = activeTasks.filter(t => !completed.includes(t.id));
        refillActiveTasks();
    }

    if (changed) {
        saveTasks();
        updateTaskUI();
    }
}

function updateTaskUI() {
    const countEl = document.getElementById("wheelsCount");
    if (countEl) countEl.textContent = wheelsCurrency;

    const previewName = document.getElementById("previewWheelName");
    if (previewName) previewName.textContent = currentWheel;

    const taskList = document.getElementById("taskList");
    if (taskList) {
        taskList.innerHTML = activeTasks.map(task => {
            const prog = taskProgress[task.id] || 0;
            const done = prog >= task.target;
            return `<div class="task-item">
                <span>${task.label}</span>
                <span class="reward">${done ? "✓" : prog + "/" + task.target} · +${task.reward}</span>
            </div>`;
        }).join("") || "<div style='color:#666;padding:10px 0;'>Geen taken meer...</div>";
    }

    const shopList = document.getElementById("shopList");
    if (shopList) {
        const prices = {
            white: 0,
            peach: 12,
            blue: 15,
            light_blue: 15,
            light_green: 15,
            orange: 18,
            pink: 18,
            purple: 20,
            yellow: 20
        };
        shopList.innerHTML = AVAILABLE_WHEELS.map(name => {
            const owned = ownedWheels.includes(name);
            const price = prices[name] || 20;
            const equipped = currentWheel === name;
            return `<div class="shop-item">
                <span>${name}${equipped ? " (aan)" : ""}</span>
                ${owned
                    ? `<button class="buy-btn owned" onclick="equipWheel('${name}')">Equip</button>`
                    : `<button class="buy-btn" onclick="buyWheel('${name}', ${price})" ${wheelsCurrency < price ? "disabled" : ""}>${price} wheels</button>`
                }
            </div>`;
        }).join("");
    }
}

window.buyWheel = function (name, price) {
    if (wheelsCurrency < price || ownedWheels.includes(name)) return;
    wheelsCurrency -= price;
    ownedWheels.push(name);
    saveTasks();
    updateTaskUI();
};

window.equipWheel = function (name) {
    if (!ownedWheels.includes(name)) return;
    if (boardParts && boardParts.root && gameScene) {
        loadWheelSet(name, boardParts.root, gameScene);
    }
    updateTaskUI();
};

let taskMenuOpen = false;
function toggleTaskMenu() {
    taskMenuOpen = !taskMenuOpen;
    const el = document.getElementById("taskMenu");
    if (el) el.classList.toggle("open", taskMenuOpen);
    if (taskMenuOpen && document.pointerLockElement) {
        document.exitPointerLock();
    }
    updateTaskUI();
}
window.startRushFromUI = function () {
    const slider = document.getElementById("rushSlider");
    const count = slider ? parseInt(slider.value, 10) : 5;
    startRush(count);
    toggleTaskMenu(); // sluit menu zodat je kunt spelen
};

// ========== RUSHES / COLLECTIBLES ==========
let rushActive = false;
let rushObjects = [];
let rushCollected = 0;
let rushTarget = 0;
let rushTimeLeft = 0;
const RUSH_TIME = 180;
let collectiveObjects = []; // global, wordt gevuld bij map load

function startRush(count) {
    if (rushActive || collectiveObjects.length === 0) return;
    const available = [...collectiveObjects];
    // Shuffle
    for (let i = available.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [available[i], available[j]] = [available[j], available[i]];
    }
    rushTarget = Math.min(count, available.length);
    rushObjects = available.slice(0, rushTarget);
    rushCollected = 0;
    rushTimeLeft = RUSH_TIME;
    rushActive = true;

    rushObjects.forEach(m => { m.isVisible = true; });
    updateRushUI();
    console.log("Rush gestart:", rushTarget, "objecten");
}

function endRush(success) {
    rushActive = false;
    rushObjects.forEach(m => { m.isVisible = false; });
    if (success) {
        wheelsCurrency += rushCollected;
        saveTasks();
        playTaskCompleteSound();
        console.log("Rush geslaagd! +" + rushCollected + " wheels");
    } else {
        console.log("Rush mislukt, geen wheels");
    }
    rushObjects = [];
    updateRushUI();
    updateTaskUI();
}

function updateRushUI() {
    const el = document.getElementById("rushStatus");
    if (!el) return;
    if (!rushActive) {
        el.textContent = "Geen actieve rush";
        el.style.color = "#888";
        return;
    }
    const m = Math.floor(rushTimeLeft / 60);
    const s = Math.floor(rushTimeLeft % 60).toString().padStart(2, "0");
    el.textContent = `${rushCollected} / ${rushTarget}  ·  ${m}:${s}`;
    el.style.color = rushTimeLeft < 30 ? "#f87171" : "#4ade80";
}

function checkRushPickup(playerPos) {
    if (!rushActive) return;
    for (let i = rushObjects.length - 1; i >= 0; i--) {
        const obj = rushObjects[i];
        if (!obj.isVisible) continue;
        const dist = BABYLON.Vector3.Distance(playerPos, obj.getAbsolutePosition());
        if (dist < 2.2) {
            obj.isVisible = false;
            rushCollected++;
            rushObjects.splice(i, 1);
            if (rushCollected >= rushTarget) {
                endRush(true);
            }
        }
    }
}

// T opent/sluit het menu altijd (ook bij pointer lock)
document.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "t") {
        e.preventDefault();
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }
        // kleine delay zodat pointer lock eerst vrij is
        setTimeout(() => toggleTaskMenu(), 50);
    }
});
let dailyChallenge = null;
let dailyProgress = 0;
let dailyCompleted = false;

function getDateKey() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function seededRandom(seed) {
    let s = 0;
    for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) >>> 0;
    return function () {
        s = (s * 1664525 + 1013904223) >>> 0;
        return (s >>> 0) / 4294967296;
    };
}

function generateDailyChallenge() {
    const dateKey = getDateKey();
    const rng = seededRandom(dateKey + '-acidin-v2');
    const roll = rng();

    const types = [
        () => {
            const target = 2 + Math.floor(rng() * 4); // 2-5
            return { type: 'kickflip', target, label: `Doe ${target} kickflips`, dateKey };
        },
        () => {
            const target = 2 + Math.floor(rng() * 3); // 2-4
            return { type: 'heelflip', target, label: `Doe ${target} heelflips`, dateKey };
        },
        () => {
            const target = 3 + Math.floor(rng() * 4); // 3-6
            return { type: 'grind', target, label: `Start ${target} grinds (Q)`, dateKey };
        },
        () => {
            const target = 3 + Math.floor(rng() * 3); // 3-5
            return { type: 'shuvit', target, label: `Doe ${target} shuvits`, dateKey };
        },
        () => {
            const target = 4 + Math.floor(rng() * 5); // 4-8
            return { type: 'tricks', target, label: `Land ${target} tricks`, dateKey };
        }
    ];

    const index = Math.floor(roll * types.length);
    return types[index]();
}

function loadDailyChallenge() {
    const dateKey = getDateKey();
    dailyChallenge = generateDailyChallenge();
    dailyProgress = 0;
    dailyCompleted = false;

    try {
        const saved = localStorage.getItem('acidin_daily_' + dateKey);
        if (saved === 'done') {
            dailyCompleted = true;
            dailyProgress = dailyChallenge.target;
        }
    } catch (e) {}

    updateDailyUI();
}

function updateDailyUI() {
    const labelEl = document.getElementById('dailyLabel');
    const progEl = document.getElementById('dailyProgress');
    if (!labelEl || !progEl || !dailyChallenge) return;

    labelEl.textContent = dailyChallenge.label;
    if (dailyCompleted) {
        progEl.textContent = 'Voltooid';
        progEl.classList.add('done');
    } else {
        progEl.textContent = `${dailyProgress} / ${dailyChallenge.target}`;
        progEl.classList.remove('done');
    }
}

function updateWheelUI() {
    const el = document.getElementById('currentWheel');
    if (el) el.textContent = currentWheel;
}

function addDailyProgress(type, amount = 1) {
    if (!dailyChallenge || dailyCompleted) return;
    if (dailyChallenge.type !== type && dailyChallenge.type !== 'tricks') return;

    // tricks telt alles
    if (dailyChallenge.type === 'tricks' || dailyChallenge.type === type) {
        dailyProgress = Math.min(dailyChallenge.target, dailyProgress + amount);
        if (dailyProgress >= dailyChallenge.target) {
            dailyCompleted = true;
            try {
                localStorage.setItem('acidin_daily_' + dailyChallenge.dateKey, 'done');
            } catch (e) {}
        }
        updateDailyUI();
    }
}

// Debug: nieuwe daily forceren
// new_daily()           → random
// new_daily('kickflip') → specifieke
window.new_daily = function (forceType) {
    const dateKey = getDateKey();
    localStorage.removeItem('acidin_daily_' + dateKey);

    if (forceType) {
        const targets = { kickflip: 3, heelflip: 3, grind: 4, shuvit: 3, tricks: 6 };
        const labels = {
            kickflip: `Doe ${targets.kickflip} kickflips`,
            heelflip: `Doe ${targets.heelflip} heelflips`,
            grind: `Start ${targets.grind} grinds (Q)`,
            shuvit: `Doe ${targets.shuvit} shuvits`,
            tricks: `Land ${targets.tricks} tricks`
        };
        dailyChallenge = {
            type: forceType,
            target: targets[forceType] || 3,
            label: labels[forceType] || forceType,
            dateKey
        };
        dailyProgress = 0;
        dailyCompleted = false;
    } else {
        loadDailyChallenge();
        return;
    }
    updateDailyUI();
    console.log('Daily geforceerd:', dailyChallenge);
};

async function createGame() {
    const scene = new BABYLON.Scene(engine);
    
    const havokInstance = await HavokPhysics();
    const havokPlugin = new BABYLON.HavokPlugin(true, havokInstance);
    scene.enablePhysics(new BABYLON.Vector3(0, -26.0, 0), havokPlugin);
    
    scene.clearColor = new BABYLON.Color4(0.53, 0.75, 0.98, 1);

    // 1. CAMERA
    const camera = new BABYLON.ArcRotateCamera(
        "camera",
        -Math.PI / 2,
        Math.PI / 3,
        12,
        BABYLON.Vector3.Zero(),
        scene
    );
    camera.attachControl(canvas, true);
    camera.lowerBetaLimit = 0.1;
    camera.upperBetaLimit = Math.PI / 2 - 0.05;
    camera.inputs.removeByType("ArcRotateCameraKeyboardMoveInput");
    camera.inputs.removeByType("ArcRotateCameraMouseWheelInput");
    camera.inputs.removeByType("ArcRotateCameraPointersInput");
    camera.fov = 0.85;
    camera.maxZ = 5000;

    // Betrouwbare blauwe lucht
    const sky = BABYLON.MeshBuilder.CreateSphere("sky", { diameter: 1500, segments: 32 }, scene);
    const skyMat = new BABYLON.StandardMaterial("skyMat", scene);
    skyMat.backFaceCulling = false;
    skyMat.disableLighting = true;
    skyMat.diffuseColor = new BABYLON.Color3(0.45, 0.68, 0.98);
    skyMat.emissiveColor = new BABYLON.Color3(0.4, 0.62, 0.95);
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
    light.intensity = 0.9;

    let grindableLines = [];

    // --- MAP.GLB ---
    try {
        const mapResult = await BABYLON.SceneLoader.ImportMeshAsync("", "models/maps/", "map.glb", scene);
        mapResult.meshes.forEach((mesh) => {
            if (mesh.name === "__root__") {
                mesh.scaling = new BABYLON.Vector3(12, 12, 12);
                mesh.position.y -= 100;
            }
        });
        mapResult.meshes.forEach((mesh) => {
            if (mesh.geometry && mesh.name !== "__root__") {
                new BABYLON.PhysicsAggregate(
                    mesh,
                    BABYLON.PhysicsShapeType.MESH, 
                    { mass: 0, friction: 0.5, restitution: 0.1 }, 
                    scene
                );

                const n = mesh.name.toLowerCase();
                if (n.includes("grindable_line")) {
                    grindableLines.push(mesh);
                    mesh.isVisible = false;
                }
                if (n.includes("objective_collective")) {
                    collectiveObjects.push(mesh);
                    mesh.isVisible = false;
                }
            }
        });
        console.log("Grindable lines:", grindableLines.length, "| Collectives:", collectiveObjects.length);
    } catch (err) {
        console.error("Fout bij het laden van models/map.glb:", err);
        const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 200, height: 200 }, scene);
        const groundMaterial = new BABYLON.StandardMaterial("groundMaterial", scene);
        groundMaterial.diffuseColor = new BABYLON.Color3(0.5, 0.5, 0.5);
        ground.material = groundMaterial;
        new BABYLON.PhysicsAggregate(ground, BABYLON.PhysicsShapeType.BOX, { mass: 0, restitution: 0, friction: 0.5 }, scene);
    }

    // 2. PHYSICS MESH
    const physicsMesh = BABYLON.MeshBuilder.CreateBox(
        "physicsMesh", 
        { width: PHYSICS_BOX_WIDTH, height: PHYSICS_BOX_HEIGHT, depth: PHYSICS_BOX_DEPTH }, 
        scene
    );
    physicsMesh.position.set(0, 15, 0); 
    physicsMesh.isVisible = false; 

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
    const cameraDistance = 42;
    const cameraSmoothness = 3;
    const defaultPitch = 0.45;
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
            cameraPitch = Math.max(0.1, Math.min(Math.PI / 2 - 0.1, cameraPitch));
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
            // Extra rotatie zodat hij langs de lengte ligt
            const extra = BABYLON.Quaternion.FromEulerAngles(Math.PI / 2, 0, 0);
            boardLine.rotationQuaternion = physicsMesh.rotationQuaternion.multiply(extra);
        }
    });

    const boardPhysics = new BABYLON.PhysicsAggregate(
        physicsMesh, 
        BABYLON.PhysicsShapeType.BOX, 
        { mass: 15, friction: 0, restitution: 0.05 }, 
        scene
    );
    boardPhysics.body.setMotionType(BABYLON.PhysicsMotionType.DYNAMIC);
    boardPhysics.body.setLinearDampening = 0.1;
    boardPhysics.body.setAngularDampening = 0.8;

    if (SHOW_PHYSICS_OUTLINE) {
        const viewer = new BABYLON.PhysicsViewer(scene);
        viewer.showBody(boardPhysics.body);
    }
    
    boardParts = { root: null, deck: null, frontTruck: null, rearTruck: null, wheels: { FL: null, FR: null, RL: null, RR: null } };
    gameScene = scene;

    try {
        const result = await BABYLON.SceneLoader.ImportMeshAsync("", "models/full_boards/", "skateboard.glb", scene);
        const skateboard = result.meshes[0];
        skateboard.parent = physicsMesh;
        boardParts.root = skateboard;
        function findByName(name) { return scene.getNodeByName(name); }
        boardParts.deck = findByName("Deck") || findByName("Skateboard_1");
        boardParts.frontTruck = findByName("FrontTruck");
        boardParts.rearTruck = findByName("RearTruck");
        boardParts.wheels.FL = findByName("WheelFL");
        boardParts.wheels.FR = findByName("WheelFR");
        boardParts.wheels.RL = findByName("WheelRL");
        boardParts.wheels.RR = findByName("WheelRR");

        if (boardParts.deck) {
            boardParts.deck.rotationQuaternion = null; 
            boardParts.deck.rotation = new BABYLON.Vector3(0, 0, 0);
            // Zorg dat trucks child zijn van het deck (zodat ollie alles meeneemt)
            if (boardParts.frontTruck && boardParts.frontTruck.parent !== boardParts.deck) {
                boardParts.frontTruck.parent = boardParts.deck;
            }
            if (boardParts.rearTruck && boardParts.rearTruck.parent !== boardParts.deck) {
                boardParts.rearTruck.parent = boardParts.deck;
            }
        }

        Object.values(boardParts.wheels).forEach(wheel => {
            if (wheel) {
                wheel.rotationQuaternion = null;
                wheel.rotation = new BABYLON.Vector3(0, 0, 0);
                wheel.isVisible = false; // originele wielen verbergen
            }
        });

        if (boardParts.root) {
            boardParts.root.rotationQuaternion = null;
            boardParts.root.rotation = new BABYLON.Vector3(0, 0, 0);
        }

        // Laad gekozen wiel-set (vervangt de standaard wielen visueel)
        await loadWheelSet(currentWheel, skateboard, scene);

    } catch (err) {
        console.error("Failed to load models/skateboard.glb:", err);
        physicsMesh.isVisible = true;
        const fallbackMat = new BABYLON.StandardMaterial("fallback", scene);
        fallbackMat.diffuseColor = new BABYLON.Color3(0.1, 0.65, 0.38);
        physicsMesh.material = fallbackMat;
    }

    // --- INPUT MANAGEMENT ---
    const inputMap = {};
    scene.onKeyboardObservable.add((kbInfo) => {
        const key = kbInfo.event.key.toLowerCase();
        if (kbInfo.type === BABYLON.KeyboardEventTypes.KEYDOWN) {
            inputMap[key] = true;
            if (key === " " || key === "spacebar") {
                speed = Math.min(speed + pushpower, maxSpeed);
            }
            if (key === "v") {
                // Wissel wiel-set
                if (boardParts.root) {
                    cycleWheels(boardParts.root, scene);
                }
            }
            if (key === "q" && !isGrinding) {
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
                    console.log("Grind gestart op:", hitLine.name);
                    addDailyProgress('grind');
                    addTaskProgress('grind');

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
                    const yaw = Math.atan2(grindAxis.x, grindAxis.z);
                    physicsMesh.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(0, yaw, 0);
                } else {
                    console.log("Geen grindable_line geraakt door de cylinder.");
                }
            }
            if ((key === "w" && inputMap["shift"]) || (key === "shift" && inputMap["w"])) {
                if (isGrinding) {
                    isGrinding = false;
                    currentGrindMesh = null;
                    boardPhysics.body.disablePreStep = true;
                }
                const impulseVector = new BABYLON.Vector3(0, jumpPower, 0);
                boardPhysics.body.applyImpulse(impulseVector, physicsMesh.absolutePosition);
                if (ollieTimer <= 0) {
                    ollieTimer = OLLIE_DURATION;
                }
            }
        } else if (kbInfo.type === BABYLON.KeyboardEventTypes.KEYUP) {
            inputMap[key] = false;
            if (key === " " || key === "spacebar") {
                inputMap["spacebar"] = false;
            }
        }
    });

    // --- MUIS / POINTER LOCK / WHEEL ---
    canvas.addEventListener("click", () => {
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
            mouseDeltaX += e.movementX || 0;
            mouseDeltaY += e.movementY || 0;
        }
    }, false);

    canvas.addEventListener("wheel", (e) => {
        e.preventDefault();
        if (!isPointerLocked || isShuviting) return;
        shuvitDir = e.deltaY < 0 ? 1 : -1;
        isShuviting = true;
        shuvitProgress = 0;
        addDailyProgress('shuvit');
        addDailyProgress('tricks');
        addTaskProgress('shuvit');
        addTaskProgress('tricks');
    }, { passive: false });

    // --- GAME LOOP ---
    scene.onBeforeRenderObservable.add(() => {
        const dt = engine.getDeltaTime() / 1000;
        const currentVelocity = boardPhysics.body.getLinearVelocity();

        // Minimap
        const mm = document.getElementById("minimapCanvas");
        if (mm) {
            const ctx = mm.getContext("2d");
            const w = mm.width, h = mm.height;
            ctx.clearRect(0, 0, w, h);
            ctx.fillStyle = "rgba(20, 24, 32, 0.9)";
            ctx.fillRect(0, 0, w, h);

            const scale = 1.8;
            const cx = w / 2, cy = h / 2;
            const px = physicsMesh.position.x;
            const pz = physicsMesh.position.z;

            // Collectibles
            if (rushActive) {
                ctx.fillStyle = "#fbbf24";
                rushObjects.forEach(obj => {
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

        // Rush timer + pickup
        if (rushActive) {
            rushTimeLeft -= dt;
            checkRushPickup(physicsMesh.position);
            if (rushTimeLeft <= 0) {
                endRush(false);
            }
            if (Math.floor(rushTimeLeft) !== Math.floor(rushTimeLeft + dt)) {
                updateRushUI();
            }
        }
        
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
                currentGrindMesh = null;
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

                const yaw = Math.atan2(grindAxis.x, grindAxis.z);
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

        let angularVel = new BABYLON.Vector3(0, 0, 0);

        if (!isGrinding) {
            let isVertical = false;
            const rotQuat = physicsMesh.rotationQuaternion;
            if (rotQuat) {
                const boardUp = BABYLON.Vector3.Up().rotateByQuaternionToRef(rotQuat, new BABYLON.Vector3());
                isVertical = Math.abs(boardUp.y) < 0.4;
            }

            if (inputMap["a"] || inputMap["arrowleft"]) {
                if (isVertical && rotQuat) {
                    const localY = BABYLON.Vector3.Up().rotateByQuaternionToRef(rotQuat, new BABYLON.Vector3());
                    angularVel = localY.scale(-turnSpeed * 4.5);
                } else {
                    angularVel.y = -turnSpeed;
                }
            } else if (inputMap["d"] || inputMap["arrowright"]) {
                if (isVertical && rotQuat) {
                    const localY = BABYLON.Vector3.Up().rotateByQuaternionToRef(rotQuat, new BABYLON.Vector3());
                    angularVel = localY.scale(turnSpeed * 4.5);
                } else {
                    angularVel.y = turnSpeed;
                }
            } else if (inputMap["s"] || inputMap["arrowdown"]) {
                SlowDownPower = 0.8;
            } else {
                angularVel.y = 0;
                SlowDownPower = 0.05;
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

                    // Manual mag op de grond én in de lucht
                    if (!isManualing && Math.abs(mouseDeltaY) > MANUAL_FLICK_THRESHOLD) {
                        isManualing = true;
                        manualDir = mouseDeltaY < 0 ? 1 : -1;
                        manualProgress = 0;
                        addTaskProgress('manual');
                    }

                    // Flips alleen in de lucht
                    if (!isFlipping && Math.abs(mouseDeltaX) > FLIP_MOUSE_THRESHOLD && !isGrounded) {
                        isFlipping = true;
                        flipDir = mouseDeltaX > 0 ? 1 : -1;
                        flipProgress = 0;
                        // +1 = kickflip, -1 = heelflip (pas aan als de richting anders is)
                        const flipType = flipDir > 0 ? 'kickflip' : 'heelflip';
                        addDailyProgress(flipType);
                        addDailyProgress('tricks');
                        addTaskProgress(flipType);
                        addTaskProgress('tricks');
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

        // Normale lineaire beweging
        if (!isGrinding) {
            const rotationQuat = physicsMesh.rotationQuaternion;
            if (rotationQuat) {
                const forwardDirection = new BABYLON.Vector3();
                BABYLON.Vector3.Forward().rotateByQuaternionToRef(rotationQuat, forwardDirection);
                
                if (speed > 0) {
                    const targetForwardVel = forwardDirection.scale(speed);
                    currentVelocity.x = targetForwardVel.x;
                    currentVelocity.z = targetForwardVel.z;
                    boardPhysics.body.setLinearVelocity(currentVelocity);
                    speed -= SlowDownPower;
                } else {
                    speed = 0;
                    boardPhysics.body.setLinearVelocity(new BABYLON.Vector3(
                        currentVelocity.x * 0.95, 
                        currentVelocity.y,
                        currentVelocity.z * 0.95
                    ));
                }
                const extraGravityForce = new BABYLON.Vector3(0, -15.0, 0); 
                boardPhysics.body.applyForce(extraGravityForce, physicsMesh.absolutePosition);
            }
        }

        // Visuele shuvit
        if (boardParts.root && isShuviting) {
            shuvitProgress += dt / SHUVIT_DURATION;
            if (shuvitProgress >= 1) {
                isShuviting = false;
                boardParts.root.rotation.y = shuvitDir * Math.PI;
            } else {
                boardParts.root.rotation.y = shuvitDir * shuvitProgress * Math.PI;
            }
        }

        // Ollie + flip visueel
        if (boardParts.deck) {
            if (ollieTimer > 0) {
                ollieTimer -= dt;
                const progress = (OLLIE_DURATION - ollieTimer) / OLLIE_DURATION;
                if (progress < 0.3) {
                    const t = progress / 0.3;
                    boardParts.deck.rotation.x = BABYLON.Scalar.Lerp(0, -0.4, t);
                } else {
                    const t = (progress - 0.3) / 0.7;
                    boardParts.deck.rotation.x = BABYLON.Scalar.Lerp(-0.4, 0, t);
                }
            } else if (!isFlipping) {
                boardParts.deck.rotation.x = 0;
            }

            if (isFlipping) {
                flipProgress += dt / FLIP_DURATION;
                if (flipProgress >= 1) {
                    isFlipping = false;
                    flipProgress = 0;
                    boardParts.deck.rotation.z = 0;
                } else {
                    boardParts.deck.rotation.z = flipDir * flipProgress * Math.PI * 2;
                }
            } else {
                boardParts.deck.rotation.z = 0;
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

createGame().then((scene) => {
    console.log("Game geladen, laadscherm verbergen");
    hideLoadingScreen();
    loadDailyChallenge();
    loadTasks();
    updateWheelUI();
    updateTaskUI();
    engine.runRenderLoop(() => { scene.render(); });
}).catch((error) => {
    console.error("Failed to initialize game:", error);
    hideLoadingScreen();
    const el = document.getElementById("loadingScreen");
    if (el) {
        el.classList.remove("hidden");
        el.innerHTML = `
            <div style="text-align:center;color:#f87171;font-family:system-ui;">
                <h2>Fout bij laden</h2>
                <p>${error.message || error}</p>
            </div>`;
    }
});

window.addEventListener("resize", () => { engine.resize(); });