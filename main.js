const canvas = document.getElementById("renderCanvas");
const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
const keys = {};
const menuOverlay = document.getElementById("menuOverlay");
const menuStatus = document.getElementById("menuStatus");
const previewStatus = document.getElementById("previewStatus");
const lightModeToggle = document.getElementById("lightModeToggle");

let menuOpen = false;
let lightMode = false;
let gameScene = null;
let hemisphereLight = null;
let previewEngine = null;
let previewPromise = null;

function setLightMode(enabled) {
    lightMode = enabled;
    document.body.classList.toggle("light-mode", enabled);
    lightModeToggle.checked = enabled;
    if (gameScene && hemisphereLight) {
        gameScene.clearColor = enabled
            ? new BABYLON.Color4(0.66, 0.76, 0.88, 1)
            : new BABYLON.Color4(0.1, 0.15, 0.25, 1);
        hemisphereLight.intensity = enabled ? 1.4 : 0.9;
    }
}

function setActivePanel(panelName) {
    const titles = {
        missions: "Missies",
        tasks: "Taken",
        shop: "Shop",
        settings: "Instellingen"
    };
    document.querySelectorAll(".nav-button").forEach(button => {
        button.setAttribute("aria-selected", String(button.dataset.panel === panelName));
    });
    document.querySelectorAll(".menu-panel").forEach(panel => {
        panel.hidden = panel.dataset.content !== panelName;
    });
    document.getElementById("menuTitle").textContent = titles[panelName];
    menuStatus.textContent = "";
    if (panelName === "shop") loadBoardPreview();
}

function showMenu(panelName = "missions") {
    menuOpen = true;
    Object.keys(keys).forEach(key => { keys[key] = false; });
    menuOverlay.classList.add("open");
    menuOverlay.setAttribute("aria-hidden", "false");
    setActivePanel(panelName);
}

function hideMenu() {
    menuOpen = false;
    Object.keys(keys).forEach(key => { keys[key] = false; });
    menuOverlay.classList.remove("open");
    menuOverlay.setAttribute("aria-hidden", "true");
}

document.getElementById("openMenu").addEventListener("click", () => showMenu());
document.getElementById("closeMenu").addEventListener("click", hideMenu);
document.querySelectorAll(".nav-button").forEach(button => {
    button.addEventListener("click", () => setActivePanel(button.dataset.panel));
});
document.querySelectorAll("[data-message]").forEach(button => {
    button.addEventListener("click", () => {
        menuStatus.textContent = button.dataset.message;
    });
});
lightModeToggle.addEventListener("change", () => setLightMode(lightModeToggle.checked));
menuOverlay.addEventListener("click", event => {
    if (event.target === menuOverlay) hideMenu();
});
document.addEventListener("keydown", event => {
    const target = event.target;
    const isTyping = target instanceof HTMLElement &&
        (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
    if (isTyping) return;
    if (event.key.toLowerCase() === "i") {
        event.preventDefault();
        if (menuOpen) hideMenu();
        else showMenu("settings");
    } else if (event.key === "Escape" && menuOpen) {
        hideMenu();
    }
});

async function loadBoardPreview() {
    if (previewPromise) return previewPromise;
    previewPromise = (async () => {
        const previewCanvas = document.getElementById("boardPreview");
        previewEngine = new BABYLON.Engine(previewCanvas, true, { preserveDrawingBuffer: true, stencil: true });
        const previewScene = new BABYLON.Scene(previewEngine);
        previewScene.clearColor = new BABYLON.Color4(0.09, 0.12, 0.17, 1);

        const camera = new BABYLON.ArcRotateCamera(
            "boardPreviewCamera",
            -Math.PI / 2.4,
            Math.PI / 2.4,
            5,
            BABYLON.Vector3.Zero(),
            previewScene
        );
        camera.lowerRadiusLimit = 3;
        camera.upperRadiusLimit = 8;
        camera.wheelPrecision = 50;
        camera.attachControl(previewCanvas, true);

        const light = new BABYLON.HemisphericLight("boardPreviewLight", new BABYLON.Vector3(0, 1, 0), previewScene);
        light.intensity = 1.2;
        new BABYLON.DirectionalLight("boardPreviewFill", new BABYLON.Vector3(-1, -2, 1), previewScene).intensity = 0.5;

        const boardResult = await BABYLON.SceneLoader.ImportMeshAsync("", "models/", "skateboard.glb", previewScene);
        const board = boardResult.meshes[0];
        const boardRoot = new BABYLON.TransformNode("boardPreviewRoot", previewScene);
        board.parent = boardRoot;
        board.scaling.scaleInPlace(1 / 40);
        boardRoot.rotation.y = Math.PI / 2;
        previewStatus.textContent = "Sleep om het board te draaien · scroll om in te zoomen";

        previewEngine.runRenderLoop(() => {
            boardRoot.rotation.y += previewEngine.getDeltaTime() / 1000 * 0.35;
            previewScene.render();
        });
    })().catch(error => {
        previewPromise = null;
        previewStatus.textContent = "De 3D-preview kon niet worden geladen. Controleer of models/skateboard.glb bereikbaar is.";
        console.error("Skateboard-preview laden mislukt:", error);
    });
    return previewPromise;
}

async function createScene() {
    const scene = new BABYLON.Scene(engine);
    gameScene = scene;
    scene.clearColor = new BABYLON.Color4(0.1, 0.15, 0.25, 1);

    const camera = new BABYLON.UniversalCamera("camera", new BABYLON.Vector3(0, 3, -8), scene);
    camera.setTarget(BABYLON.Vector3.Zero());
    camera.attachControl(canvas, true);
    camera.minZ = 0.1;

    hemisphereLight = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0.5, 1, 0.5), scene);
    hemisphereLight.intensity = lightMode ? 1.4 : 0.9;
    if (lightMode) scene.clearColor = new BABYLON.Color4(0.66, 0.76, 0.88, 1);

    const havok = await HavokPhysics();
    scene.enablePhysics(new BABYLON.Vector3(0, -9.81, 0), new BABYLON.HavokPlugin(true, havok));

    // Map importeren
    const mapResult = await BABYLON.SceneLoader.ImportMeshAsync("", "models/", "map.glb", scene);
    const mapRoot = mapResult.meshes[0];
    mapRoot.scaling.setAll(20);
    mapRoot.computeWorldMatrix(true);

    for (const mesh of mapResult.meshes) {
        if (!mesh.getTotalVertices || mesh.getTotalVertices() === 0) continue;
        try {
            new BABYLON.PhysicsAggregate(mesh, BABYLON.PhysicsShapeType.MESH, { mass: 0, friction: 0.9 }, scene);
        } catch (e) {
            console.warn("Map physics:", mesh.name, e);
        }
    }

    // Safety Ground
    const ground = BABYLON.MeshBuilder.CreateBox("safetyGround", { width: 500, height: 4, depth: 500 }, scene);
    ground.position.y = -10;
    ground.isVisible = false;
    ground.isPickable = false;
    new BABYLON.PhysicsAggregate(ground, BABYLON.PhysicsShapeType.BOX, { mass: 0 }, scene);

    // Skateboard visuele mesh en root node
    const boardResult = await BABYLON.SceneLoader.ImportMeshAsync("", "models/", "skateboard.glb", scene);
    const boardVisual = new BABYLON.TransformNode("boardVisual", scene);
    const board = boardResult.meshes[0];
    board.parent = boardVisual;
    board.scaling.scaleInPlace(1 / 40);

    // Fysieke Collider voor het board (We maken deze iets korter/hoger zodat hij niet vastloopt in de ramp)
    const collider = BABYLON.MeshBuilder.CreateBox("boardCollider", { width: 1.4, height: 0.4, depth: 3.2 }, scene);
    collider.position.set(0, 8, 0);
    collider.isVisible = false;
    collider.isPickable = false;

    const aggregate = new BABYLON.PhysicsAggregate(collider, BABYLON.PhysicsShapeType.BOX, { mass: 2, friction: 0.4 }, scene);
    const body = aggregate.body;
    body.setLinearDamping(0.1);
    
    // We zetten angular damping extreem hoog om te zorgen dat de physics box ZELF altijd plat blijft staan 
    // en niet gaat tollen. De visuele mesh doet al het rotatiewerk.
    body.setAngularDamping(20); 

    scene.onKeyboardObservable.add(info => {
        const k = info.event.key.toLowerCase();
        if (menuOpen) {
            if (info.type === BABYLON.KeyboardEventTypes.KEYUP) keys[k] = false;
            return;
        }
        if (info.type === BABYLON.KeyboardEventTypes.KEYDOWN) keys[k] = true;
        if (info.type === BABYLON.KeyboardEventTypes.KEYUP) keys[k] = false;
    });

    let yaw = 0;
    let pitch = 0;
    let lean = 0;
    let jumpLock = false;
    const speed = 9;
    const turnSpeed = 2.4;

    pitch = BABYLON.Tools.ToRadians(pitch); 
    // Kortere raycast-afstand vanaf het board (6 is te lang, dan denkt hij in de lucht al dat hij een ramp raakt)
    function raycast(origin) {
        return scene.pickWithRay(new BABYLON.Ray(origin, new BABYLON.Vector3(0, -1, 0), 2.5), mesh =>
            mesh !== collider &&
            mesh !== ground &&
            mesh.isEnabled() &&
            mesh.isPickable &&
            mesh.getTotalVertices &&
            mesh.getTotalVertices() > 0
        );
    }

    scene.onBeforeRenderObservable.add(() => {
        const dt = Math.min(engine.getDeltaTime() / 1000, 0.033);
        const pos = collider.absolutePosition;

        // Draaien (Yaw) - we resetten de physics rotatie rond de Y-as om tollen te voorkomen
        const turn = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0);
        yaw += turn * turnSpeed * dt;

        const forward = new BABYLON.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
        const distance = 1.2; // Afstand naar voor- en achterkant voor de raycasts
        const startY = 0.5;

        // Raycasts uitvoeren vlak boven het board
        const frontRayOrigin = pos.add(forward.scale(distance)).add(new BABYLON.Vector3(0, startY, 0));
        const backRayOrigin = pos.subtract(forward.scale(distance)).add(new BABYLON.Vector3(0, startY, 0));

        const front = raycast(frontRayOrigin);
        const back = raycast(backRayOrigin);

        let targetPitch = 0;
        let isGrounded = false;

        if (front?.hit && back?.hit && front.pickedPoint && back.pickedPoint) {
            isGrounded = true;
            // Bereken de hoek op basis van het hoogteverschil tussen de twee raycast punten
            targetPitch = Math.atan2(front.pickedPoint.y - back.pickedPoint.y, distance * 2);
            targetPitch = BABYLON.Scalar.Clamp(targetPitch, -0.9, 0.9);
        } else if (front?.hit || back?.hit) {
            isGrounded = true; // Tenminste één kant raakt de grond
        }

        // Als we in de lucht hangen (geen hits), herstelt de pitch zich langzaam naar 0 (recht)
        if (!front?.hit && !back?.hit) {
            targetPitch = 0;
        }

        // Vloeiende overgang van de rotatiehoeken (lerp)
        lean = BABYLON.Scalar.Lerp(lean, -turn * 0.15, Math.min(1, dt * 8));

        // Update de positie van de visuele mesh naar de fysieke collider
        boardVisual.position.copyFrom(pos);
        
        // Pas de rotatie ALLEEN toe op de visuele mesh! De physics box blijft stabiel.
        board.rotationQuaternion = BABYLON.Quaternion.RotationYawPitchRoll(yaw, pitch, lean);

        // Snelheid en beweging verwerken
        const vel = body.getLinearVelocity();
        let vx = vel.x;
        let vz = vel.z;

        if (keys.w || keys.arrowup) {
            vx = forward.x * speed;
            vz = forward.z * speed;
        } else if (keys.s || keys.arrowdown) {
            vx = -forward.x * 4;
            vz = -forward.z * 4;
        } else {
            // Natuurlijk uitrollen op de grond
            if (isGrounded) {
                vx *= Math.max(0, 1 - 2 * dt);
                vz *= Math.max(0, 1 - 2 * dt);
            }
        }

        // Behoud altijd de vel.y (zwaartekracht!) zodat je naar beneden valt
        body.setLinearVelocity(new BABYLON.Vector3(vx, vel.y, vz));

        // Springen (Ollie)
        if (keys[" "] && !jumpLock) {
            jumpLock = true;
            if (isGrounded && vel.y < 1.0) {
                body.applyImpulse(new BABYLON.Vector3(0, 6.5, 0), pos);
            }
        }
        if (!keys[" "]) jumpLock = false;

        // Camera volgt de visuele mesh
        const target = pos.add(new BABYLON.Vector3(0, 0.8, 0));
        camera.position = BABYLON.Vector3.Lerp(
            camera.position,
            target.add(forward.scale(-6)).add(new BABYLON.Vector3(0, 2.3, 0)),
            Math.min(1, dt * 5)
        );
        camera.setTarget(target);
    });

    return scene;
}

createScene().then(scene => {
    engine.runRenderLoop(() => scene.render());
}).catch(console.error);

window.addEventListener("resize", () => engine.resize());
window.addEventListener("resize", () => previewEngine?.resize());
