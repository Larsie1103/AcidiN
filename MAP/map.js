"use strict";

const CATEGORIES = {
    Ramps: [
        "bowl-corner-inner", "bowl-corner-inner-low", "bowl-corner-outer",
        "bowl-corner-outer-low", "bowl-platform", "bowl-side", "bowl-side-low",
        "half-pipe", "half-pipe-low", "ramp", "slope-smooth", "steps"
    ],
    Rails: [
        "obstacle-box-grind", "obstacle-middle-rail", "rail-curve",
        "rail-high-curve", "rail-high", "rail-low-end", "rail-low",
        "rail-slope-smooth", "rail-slope", "ramp-rail", "steps-rail"
    ],
    Benches: ["bench", "benches"],
    Extra: [
        "fence", "floor-concrete", "floor-wood", "obstacle-box",
        "obstacle-corner", "obstacle-end", "obstacle-middle", "plank",
        "structure-platform", "structure-wood-platform", "structure-wood"
    ]
};

const ASSET_LABELS = {
    "bowl-corner-inner": "Bowl corner (inner)",
    "bowl-corner-inner-low": "Bowl corner (inner, low)",
    "bowl-corner-outer": "Bowl corner (outer)",
    "bowl-corner-outer-low": "Bowl corner (outer, low)",
    "bowl-platform": "Bowl platform",
    "bowl-side": "Bowl side",
    "bowl-side-low": "Bowl side (low)",
    "floor-concrete": "Concrete floor",
    "floor-wood": "Wood floor",
    "half-pipe": "Half-pipe",
    "half-pipe-low": "Half-pipe (low)",
    "obstacle-box-grind": "Grind box",
    "obstacle-middle-rail": "Middle rail obstacle",
    "rail-high-curve": "High curved rail",
    "rail-high": "High rail",
    "rail-low-end": "Low rail end",
    "rail-low": "Low rail",
    "rail-slope-smooth": "Smooth sloped rail",
    "rail-slope": "Sloped rail",
    "ramp-rail": "Ramp rail",
    "slope-smooth": "Smooth slope",
    "structure-platform": "Platform",
    "structure-wood-platform": "Wood platform",
    "structure-wood": "Wood structure",
    "steps-rail": "Steps with rail"
};

const ASSETS = Object.fromEntries(
    Object.entries(CATEGORIES).flatMap(([category, ids]) =>
        ids.map(id => [id, {
            id,
            category,
            file: `${id}.glb`,
            label: ASSET_LABELS[id] || id.replaceAll("-", " ")
        }])
    )
);

const DATABASE_NAME = "acidin-makeapark";
const DATABASE_VERSION = 1;
const STORE_NAME = "parks";
const PARK_KEY = "current";
const DEFAULT_BUILT_IN_SCALE = 4;
const FALLBACK_ASSET_COLORS = {
    Ramps: [0.78, 0.34, 0.19],
    Rails: [0.52, 0.62, 0.68],
    Benches: [0.67, 0.45, 0.23],
    Extra: [0.38, 0.55, 0.39]
};

const canvas = document.getElementById("renderCanvas");
const statusMessage = document.getElementById("statusMessage");
const fileInput = document.getElementById("fileInput");
const assetList = document.getElementById("assetList");
const categoryList = document.getElementById("categoryList");
const dropHint = document.getElementById("dropHint");
const selectedName = document.getElementById("selectedName");

const engine = new BABYLON.Engine(canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true,
    adaptToDeviceRatio: true
});
const scene = new BABYLON.Scene(engine);
scene.clearColor = new BABYLON.Color4(0.13, 0.17, 0.14, 1);
scene.ambientColor = new BABYLON.Color3(0.45, 0.49, 0.42);

const camera = new BABYLON.ArcRotateCamera(
    "editor-camera",
    -Math.PI / 3,
    1.08,
    28,
    new BABYLON.Vector3(0, 0, 0),
    scene
);
camera.lowerRadiusLimit = 7;
camera.upperRadiusLimit = 100;
camera.wheelPrecision = 48;
camera.angularSensibilityX = 1800;
camera.angularSensibilityY = 1800;
camera.panningSensibility = 900;
camera.inertia = 0.78;
camera.attachControl(canvas, true);

const hemiLight = new BABYLON.HemisphericLight(
    "editor-hemi-light",
    new BABYLON.Vector3(0, 1, 0),
    scene
);
hemiLight.intensity = 0.9;
hemiLight.groundColor = new BABYLON.Color3(0.19, 0.23, 0.18);

const keyLight = new BABYLON.DirectionalLight(
    "editor-key-light",
    new BABYLON.Vector3(-0.45, -1, 0.35),
    scene
);
keyLight.position.set(12, 24, -12);
keyLight.intensity = 1.4;

const ground = BABYLON.MeshBuilder.CreateGround("editor-ground", {
    width: 120,
    height: 120,
    subdivisions: 1
}, scene);
ground.isPickable = true;
ground.metadata = { editorOnly: false};

const groundTexture = new BABYLON.DynamicTexture("editor-ground-grid", 512, scene, false);
const gridContext = groundTexture.getContext();
gridContext.fillStyle = "#687064";
gridContext.fillRect(0, 0, 512, 512);
gridContext.strokeStyle = "rgba(224, 238, 215, 0.13)";
gridContext.lineWidth = 1;
for (let coordinate = 0; coordinate <= 512; coordinate += 32) {
    gridContext.beginPath();
    gridContext.moveTo(coordinate, 0);
    gridContext.lineTo(coordinate, 512);
    gridContext.stroke();
    gridContext.beginPath();
    gridContext.moveTo(0, coordinate);
    gridContext.lineTo(512, coordinate);
    gridContext.stroke();
}
gridContext.strokeStyle = "rgba(165, 231, 118, 0.35)";
gridContext.lineWidth = 2;
gridContext.beginPath();
gridContext.moveTo(256, 0);
gridContext.lineTo(256, 512);
gridContext.stroke();
gridContext.beginPath();
gridContext.moveTo(0, 256);
gridContext.lineTo(512, 256);
gridContext.stroke();
groundTexture.update();
groundTexture.uScale = 12;
groundTexture.vScale = 12;

const groundMaterial = new BABYLON.StandardMaterial("editor-ground-material", scene);
groundMaterial.diffuseTexture = groundTexture;
groundMaterial.specularColor = new BABYLON.Color3(0.06, 0.07, 0.06);
groundMaterial.roughness = 0.98;
ground.material = groundMaterial;

const highlightLayer = new BABYLON.HighlightLayer("editor-selection", scene);
highlightLayer.innerGlow = false;
highlightLayer.outerGlow = true;
highlightLayer.blurHorizontalSize = 0.6;
highlightLayer.blurVerticalSize = 0.6;

const gizmoManager = new BABYLON.GizmoManager(scene);
gizmoManager.usePointerToAttachGizmos = false;
gizmoManager.positionGizmoEnabled = true;
const OBJECT_SNAP_DISTANCE = 0.6;
const snapToggleButton = document.getElementById("snapButton");
gizmoManager.gizmos.positionGizmo.onDragObservable.add(snapSelectedItemToNearbyObjects);
let transformMode = "move";
let gizmoOrientation = "world";
let copiedItem = null;
const HISTORY_LIMIT = 100;
const undoStack = [];
const redoStack = [];
let historyBusy = false;
let gizmoHistorySnapshot = null;
[
    gizmoManager.gizmos.positionGizmo,
    gizmoManager.gizmos.rotationGizmo,
    gizmoManager.gizmos.scaleGizmo
].forEach(gizmo => {
    if (!gizmo) return;
    gizmo.onDragStartObservable.add(() => {
        gizmoHistorySnapshot = historyBusy ? null : captureEditorState();
    });
    gizmo.onDragEndObservable.add(() => {
        if (gizmoHistorySnapshot) commitHistoryChange(gizmoHistorySnapshot);
        gizmoHistorySnapshot = null;
    });
});

const modelContainers = new Map();
const items = new Map();
const customAssets = new Map();
let selectedItemId = null;
let nextItemNumber = 1;
let activeCategory = "Ramps";
let textureAtlasAvailable;
let textureFallbackReported = false;
let snapEnabled = false;

function updateHistoryButtons() {
    document.getElementById("undoButton").disabled = historyBusy || undoStack.length === 0;
    document.getElementById("redoButton").disabled = historyBusy || redoStack.length === 0;
}

function captureEditorState() {
    return {
        items: serializePark(),
        selectedItemId
    };
}

function commitHistoryChange(before) {
    if (JSON.stringify(before) === JSON.stringify(captureEditorState())) return;
    undoStack.push(before);
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    redoStack.length = 0;
    updateHistoryButtons();
}

async function restoreEditorState(state) {
    historyBusy = true;
    updateHistoryButtons();
    try {
        gizmoManager.attachToNode(null);
        highlightLayer.removeAllMeshes();
        items.forEach(item => item.root.dispose(false, false));
        items.clear();
        selectedItemId = null;
        for (const item of state.items) {
            await instantiateItem(
                item.assetId,
                item.label,
                new BABYLON.Vector3(...item.position),
                item.id,
                item
            );
        }
        setSelectedItem(state.selectedItemId);
    } finally {
        historyBusy = false;
        updateHistoryButtons();
    }
}

async function undo() {
    if (historyBusy || undoStack.length === 0) return;
    const current = captureEditorState();
    const previous = undoStack.pop();
    redoStack.push(current);
    updateHistoryButtons();
    try {
        await restoreEditorState(previous);
    } catch (error) {
        redoStack.pop();
        undoStack.push(previous);
        updateHistoryButtons();
        throw error;
    }
}

async function redo() {
    if (historyBusy || redoStack.length === 0) return;
    const current = captureEditorState();
    const next = redoStack.pop();
    undoStack.push(current);
    updateHistoryButtons();
    try {
        await restoreEditorState(next);
    } catch (error) {
        undoStack.pop();
        redoStack.push(next);
        updateHistoryButtons();
        throw error;
    }
}

function handleHistoryError(action, error) {
    console.error(`Could not ${action} MakeAPark change:`, error);
    showStatus(`Could not ${action}: ${error.message}`, true);
}

function showStatus(message, isError = false) {
    statusMessage.textContent = message;
    statusMessage.classList.toggle("error", isError);
}

function newItemId() {
    const id = `park-piece-${nextItemNumber}`;
    nextItemNumber += 1;
    return id;
}

function updateSelectedPanel() {
    const item = selectedItemId ? items.get(selectedItemId) : null;
    selectedName.textContent = item ? item.label : "Nothing selected";
}

function updateGizmoOrientation() {
    const matchAttachedRotation = gizmoOrientation === "local";
    [
        gizmoManager.gizmos.positionGizmo,
        gizmoManager.gizmos.rotationGizmo,
        gizmoManager.gizmos.scaleGizmo
    ].forEach(gizmo => {
        if (gizmo) gizmo.updateGizmoRotationToMatchAttachedMesh = matchAttachedRotation;
    });
    document.getElementById("worldOrientationButton").setAttribute(
        "aria-pressed",
        String(gizmoOrientation === "world")
    );
    document.getElementById("localOrientationButton").setAttribute(
        "aria-pressed",
        String(gizmoOrientation === "local")
    );
}

function setTransformMode(mode) {
    if (!["move", "rotate", "scale"].includes(mode)) return;
    transformMode = mode;
    gizmoManager.positionGizmoEnabled = mode === "move";
    gizmoManager.rotationGizmoEnabled = mode === "rotate";
    gizmoManager.scaleGizmoEnabled = mode === "scale";
    ["move", "rotate", "scale"].forEach(tool => {
        document.getElementById(`${tool}ToolButton`).setAttribute(
            "aria-pressed",
            String(tool === mode)
        );
    });
    showStatus(`${mode[0].toUpperCase()}${mode.slice(1)} tool · ${gizmoOrientation} axes.`);
}

function setGizmoOrientation(orientation) {
    gizmoOrientation = orientation;
    updateGizmoOrientation();
    showStatus(`${gizmoOrientation[0].toUpperCase()}${gizmoOrientation.slice(1)} gizmo axes.`);
}

function updateSnapButton() {
    snapToggleButton.setAttribute("aria-pressed", String(snapEnabled));
    snapToggleButton.textContent = `Object Snap: ${snapEnabled ? "On" : "Off"} (S)`;
}

function toggleSnap() {
    snapEnabled = !snapEnabled;
    updateSnapButton();
    showStatus(`Object snapping ${snapEnabled ? "on" : "off"}.`);
}

function getItemWorldBounds(item) {
    item.root.computeWorldMatrix(true);
    const bounds = {
        minimum: new BABYLON.Vector3(Infinity, Infinity, Infinity),
        maximum: new BABYLON.Vector3(-Infinity, -Infinity, -Infinity)
    };
    let hasBounds = false;

    item.root.getChildMeshes(false).forEach(mesh => {
        if (!mesh.isEnabled() || !mesh.getBoundingInfo) return;
        mesh.computeWorldMatrix(true);
        const box = mesh.getBoundingInfo().boundingBox;
        if (!Number.isFinite(box.minimumWorld.x) || !Number.isFinite(box.maximumWorld.x)) return;
        bounds.minimum.minimizeInPlace(box.minimumWorld);
        bounds.maximum.maximizeInPlace(box.maximumWorld);
        hasBounds = true;
    });

    return hasBounds ? bounds : null;
}

function getClosestSnapOffset(sourceBounds, targetBounds, axis) {
    const center = (bounds, key) => (bounds.minimum[key] + bounds.maximum[key]) / 2;
    const sourceAnchors = [
        sourceBounds.minimum[axis],
        center(sourceBounds, axis),
        sourceBounds.maximum[axis]
    ];
    const targetAnchors = [
        targetBounds.minimum[axis],
        center(targetBounds, axis),
        targetBounds.maximum[axis]
    ];
    let closestOffset = null;

    sourceAnchors.forEach(sourceAnchor => {
        targetAnchors.forEach(targetAnchor => {
            const offset = targetAnchor - sourceAnchor;
            if (Math.abs(offset) <= OBJECT_SNAP_DISTANCE &&
                (closestOffset === null || Math.abs(offset) < Math.abs(closestOffset))) {
                closestOffset = offset;
            }
        });
    });

    return closestOffset;
}

function snapSelectedItemToNearbyObjects() {
    if (!snapEnabled || !selectedItemId) return false;
    const selected = items.get(selectedItemId);
    if (!selected) return false;
    const selectedBounds = getItemWorldBounds(selected);
    if (!selectedBounds) return false;

    const offsets = { x: null, y: null, z: null };
    items.forEach(item => {
        if (item.id === selected.id) return;
        const targetBounds = getItemWorldBounds(item);
        if (!targetBounds) return;

        ["x", "y", "z"].forEach(axis => {
            const offset = getClosestSnapOffset(selectedBounds, targetBounds, axis);
            if (offset !== null &&
                (offsets[axis] === null || Math.abs(offset) < Math.abs(offsets[axis]))) {
                offsets[axis] = offset;
            }
        });
    });

    let snapped = false;
    Object.entries(offsets).forEach(([axis, offset]) => {
        if (offset === null || Math.abs(offset) < 0.0001) return;
        selected.root.position[axis] += offset;
        snapped = true;
    });
    if (snapped) selected.root.computeWorldMatrix(true);
    return snapped;
}

function setSelectedItem(itemId) {
    if (selectedItemId && items.has(selectedItemId)) {
        items.get(selectedItemId).root.getChildMeshes(false).forEach(mesh => {
            highlightLayer.removeMesh(mesh);
        });
    }

    selectedItemId = itemId && items.has(itemId) ? itemId : null;
    const selected = selectedItemId ? items.get(selectedItemId) : null;
    if (selected) {
        selected.root.getChildMeshes(false).forEach(mesh => {
            if (mesh.isVisible) highlightLayer.addMesh(mesh, new BABYLON.Color3(0.65, 1, 0.35));
        });
    }
    gizmoManager.attachToNode(selected?.root || null);
    updateSelectedPanel();
}

function setNodeItemMetadata(node, itemId) {
    node.metadata = { ...(node.metadata || {}), editorItemId: itemId };
    if (node instanceof BABYLON.AbstractMesh) node.isPickable = true;
    if (node.getChildren) {
        node.getChildren().forEach(child => setNodeItemMetadata(child, itemId));
    }
}

function itemIdFromNode(node) {
    let current = node;
    while (current) {
        if (current.metadata?.editorItemId) return current.metadata.editorItemId;
        current = current.parent;
    }
    return null;
}

async function hasTextureAtlas() {
    if (textureAtlasAvailable !== undefined) return textureAtlasAvailable;
    const response = await fetch("models/Textures/colormap.png", { method: "HEAD" });
    textureAtlasAvailable = response.ok;
    return textureAtlasAvailable;
}

function makeUntexturedGLB(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    if (bytes.byteLength < 20 || bytes[0] !== 0x67 || bytes[1] !== 0x6c ||
        bytes[2] !== 0x54 || bytes[3] !== 0x46) {
        throw new Error("A skatepark model is not a valid GLB file.");
    }

    const view = new DataView(arrayBuffer);
    const jsonLength = view.getUint32(12, true);
    const jsonType = view.getUint32(16, true);
    if (jsonType !== 0x4e4f534a || 20 + jsonLength > bytes.byteLength) {
        throw new Error("A skatepark model has an invalid GLB header.");
    }

    const document = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)).trim());
    const hasExternalImages = document.images?.some(image =>
        typeof image.uri === "string" && !image.uri.startsWith("data:")
    );
    if (!hasExternalImages) return arrayBuffer;

    for (const material of document.materials || []) {
        const pbr = material.pbrMetallicRoughness || {};
        delete pbr.baseColorTexture;
        delete pbr.metallicRoughnessTexture;
        material.pbrMetallicRoughness = {
            ...pbr,
            baseColorFactor: pbr.baseColorFactor || [0.76, 0.81, 0.72, 1]
        };
        delete material.normalTexture;
        delete material.occlusionTexture;
        delete material.emissiveTexture;
    }
    document.images = [];
    document.textures = [];

    const jsonBytes = new TextEncoder().encode(JSON.stringify(document));
    const paddedLength = Math.ceil(jsonBytes.byteLength / 4) * 4;
    const suffix = bytes.subarray(20 + jsonLength);
    const output = new Uint8Array(20 + paddedLength + suffix.byteLength);
    const outputView = new DataView(output.buffer);
    outputView.setUint32(0, 0x46546c67, true);
    outputView.setUint32(4, 2, true);
    outputView.setUint32(8, output.byteLength, true);
    outputView.setUint32(12, paddedLength, true);
    outputView.setUint32(16, 0x4e4f534a, true);
    output.fill(0x20, 20, 20 + paddedLength);
    output.set(jsonBytes, 20);
    output.set(suffix, 20 + paddedLength);
    return output.buffer;
}

function colorFallbackMaterials(container, assetId) {
    const colorValues = FALLBACK_ASSET_COLORS[ASSETS[assetId]?.category];
    if (!colorValues) return;
    const color = new BABYLON.Color3(...colorValues);
    container.materials.forEach(material => {
        if (material.albedoColor) material.albedoColor.copyFrom(color);
        if (material.diffuseColor) material.diffuseColor.copyFrom(color);
    });
}

function loadAssetContainer(assetId) {
    if (modelContainers.has(assetId)) return modelContainers.get(assetId);

    const loadPromise = (async () => {
        let url;
        let revokeUrl = false;
        let useFallbackColors = false;
        if (ASSETS[assetId]) {
            url = `models/${ASSETS[assetId].file}`;
            if (!(await hasTextureAtlas())) {
                useFallbackColors = true;
                const response = await fetch(url);
                if (!response.ok) throw new Error(`Could not load ${ASSETS[assetId].file}: HTTP ${response.status}`);
                const fallbackGLB = makeUntexturedGLB(await response.arrayBuffer());
                url = URL.createObjectURL(new Blob([fallbackGLB], { type: "model/gltf-binary" }));
                revokeUrl = true;
                if (!textureFallbackReported) {
                    textureFallbackReported = true;
                    showStatus("The model texture atlas is missing; built-in pieces use neutral fallback colors.");
                }
            }
        } else {
            const blob = customAssets.get(assetId);
            if (!blob) throw new Error(`The imported model "${assetId}" is missing.`);
            url = URL.createObjectURL(blob);
            revokeUrl = true;
        }

        try {
            const container = await BABYLON.SceneLoader.LoadAssetContainerAsync(
                "",
                url,
                scene,
                undefined,
                ".glb"
            );
            if (useFallbackColors) colorFallbackMaterials(container, assetId);
            return container;
        } finally {
            if (revokeUrl) URL.revokeObjectURL(url);
        }
    })();

    modelContainers.set(assetId, loadPromise);
    loadPromise.catch(() => modelContainers.delete(assetId));
    return loadPromise;
}

async function instantiateItem(assetId, label, position, itemId = newItemId(), transform = null) {
    const container = await loadAssetContainer(assetId);
    const instance = container.instantiateModelsToScene(
        name => `${name}_${itemId}`,
        false
    );
    const root = new BABYLON.TransformNode(`${itemId}_group`, scene);
    root.metadata = { editorItemId: itemId, editorAssetId: assetId };
    instance.rootNodes.forEach(node => {
        node.parent = root;
        setNodeItemMetadata(node, itemId);
    });

    if (transform) {
        root.position.set(...transform.position);
        root.rotation.set(...transform.rotation);
        root.scaling.set(...transform.scaling);
    } else {
        root.position.copyFrom(position);
        if (ASSETS[assetId]) root.scaling.setAll(DEFAULT_BUILT_IN_SCALE);
    }

    const item = { id: itemId, assetId, label, root };
    items.set(itemId, item);
    const numericId = Number(itemId.match(/(\d+)$/)?.[1]);
    if (Number.isFinite(numericId)) nextItemNumber = Math.max(nextItemNumber, numericId + 1);
    setSelectedItem(itemId);
    return item;
}

function pickGroundPoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX === undefined ? rect.width / 2 : clientX - rect.left;
    const y = clientY === undefined ? rect.height / 2 : clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;

    const pick = scene.pick(
        x * engine.getRenderWidth() / rect.width,
        y * engine.getRenderHeight() / rect.height,
        mesh => mesh.isPickable && (mesh === ground || mesh.metadata?.editorOnly !== true),
        false,
        camera
    );
    if (pick?.hit && pick.pickedPoint) return pick.pickedPoint.clone();
    const fallback = new BABYLON.Vector3(0, 0, 0);
    return clientX === undefined ? fallback : null;
}

async function placeAsset(assetId, point = pickGroundPoint()) {
    if (!point) {
        showStatus("Drop the piece onto the 3D park to place it.", true);
        return;
    }
    const asset = ASSETS[assetId];
    if (!asset) throw new Error(`Unknown skatepark piece: ${assetId}`);
    showStatus(`Loading ${asset.label}...`);
    const before = captureEditorState();
    await instantiateItem(assetId, asset.label, point);
    commitHistoryChange(before);
    showStatus(`${asset.label} added. Drag it from the list to place another.`);
}

function renderCategories() {
    categoryList.replaceChildren();
    Object.keys(CATEGORIES).forEach(category => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "category-button";
        button.textContent = category;
        button.setAttribute("aria-pressed", String(category === activeCategory));
        button.classList.toggle("active", category === activeCategory);
        button.addEventListener("click", () => {
            activeCategory = category;
            renderCategories();
            renderAssetList();
        });
        categoryList.append(button);
    });
}

function renderAssetList() {
    assetList.replaceChildren();
    CATEGORIES[activeCategory].forEach(assetId => {
        const asset = ASSETS[assetId];
        const button = document.createElement("button");
        button.type = "button";
        button.className = "asset-card";
        button.draggable = true;
        button.dataset.assetId = assetId;
        button.title = `Drag ${asset.label} into the park, or click to place it`;

        const icon = document.createElement("span");
        icon.className = "asset-icon";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = activeCategory === "Rails" ? "━" :
            activeCategory === "Benches" ? "▰" :
                activeCategory === "Ramps" ? "◢" : "▦";
        const name = document.createElement("span");
        name.className = "asset-name";
        name.textContent = asset.label;
        button.append(icon, name);

        button.addEventListener("click", () => {
            placeAsset(assetId).catch(error => {
                console.error("Could not place skatepark piece:", error);
                showStatus(`Could not load ${asset.label}: ${error.message}`, true);
            });
        });
        button.addEventListener("dragstart", event => {
            event.dataTransfer.effectAllowed = "copy";
            event.dataTransfer.setData("text/plain", `makeapark:${assetId}`);
            dropHint.classList.add("visible");
        });
        button.addEventListener("dragend", () => {
            dropHint.classList.remove("visible");
        });
        assetList.append(button);
    });
}

function removeSelectedItem() {
    const item = selectedItemId ? items.get(selectedItemId) : null;
    if (!item) return;
    const before = captureEditorState();
    highlightLayer.removeAllMeshes();
    gizmoManager.attachToNode(null);
    item.root.dispose(false, false);
    items.delete(item.id);
    selectedItemId = null;
    updateSelectedPanel();
    commitHistoryChange(before);
    showStatus(`${item.label} removed.`);
}

async function rotateSelectedItem() {
    const item = selectedItemId ? items.get(selectedItemId) : null;
    if (!item) return;
    const before = captureEditorState();
    item.root.rotation.y += Math.PI / 2;
    commitHistoryChange(before);
    showStatus(`${item.label} rotated 90°.`);
}

function copySelectedItem() {
    const item = selectedItemId ? items.get(selectedItemId) : null;
    if (!item) {
        showStatus("Select an object before copying.", true);
        return;
    }
    if (!ASSETS[item.assetId] && !customAssets.has(item.assetId)) {
        showStatus("This imported piece cannot be copied because its GLB data is unavailable.", true);
        return false;
    }
    copiedItem = {
        assetId: item.assetId,
        label: item.label,
        transform: {
            position: [item.root.position.x, item.root.position.y, item.root.position.z],
            rotation: [item.root.rotation.x, item.root.rotation.y, item.root.rotation.z],
            scaling: [item.root.scaling.x, item.root.scaling.y, item.root.scaling.z]
        }
    };
    showStatus(`${item.label} copied. Paste to place an exact copy at the same position.`);
    return true;
}

async function pasteCopiedItem() {
    if (!copiedItem) {
        showStatus("Copy an object before pasting.", true);
        return;
    }
    if (!ASSETS[copiedItem.assetId] && !customAssets.has(copiedItem.assetId)) {
        throw new Error("The copied GLB data is no longer available.");
    }
    const before = captureEditorState();
    const item = await instantiateItem(
        copiedItem.assetId,
        `${copiedItem.label} copy`,
        new BABYLON.Vector3(),
        newItemId(),
        copiedItem.transform
    );
    commitHistoryChange(before);
    showStatus(`${item.label} pasted at the original position, rotation, and scale.`);
    return item;
}

function openDatabase() {
    return new Promise((resolve, reject) => {
        if (!("indexedDB" in window)) {
            reject(new Error("This browser does not support local park storage."));
            return;
        }
        const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                database.createObjectStore(STORE_NAME, { keyPath: "id" });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("Could not open park storage."));
    });
}

async function readSavedPark() {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readonly");
        const request = transaction.objectStore(STORE_NAME).get(PARK_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error("Could not read the saved park."));
        transaction.oncomplete = () => database.close();
        transaction.onerror = () => database.close();
    });
}

async function writeSavedPark(record) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readwrite");
        transaction.objectStore(STORE_NAME).put(record);
        transaction.oncomplete = () => {
            database.close();
            resolve();
        };
        transaction.onerror = () => {
            database.close();
            reject(transaction.error || new Error("Could not save this park."));
        };
        transaction.onabort = () => {
            database.close();
            reject(transaction.error || new Error("Saving this park was cancelled."));
        };
    });
}

async function listSavedParks() {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readonly");
        const request = transaction.objectStore(STORE_NAME).getAll();
        request.onsuccess = () => resolve(request.result
            .filter(record => typeof record.id === "string" && record.id.startsWith("park:"))
            .sort((left, right) => (right.savedAt || "").localeCompare(left.savedAt || "")));
        request.onerror = () => reject(request.error || new Error("Could not list saved parks."));
        transaction.oncomplete = () => database.close();
        transaction.onerror = () => database.close();
    });
}

function serializePark() {
    return [...items.values()].map(item => ({
        id: item.id,
        assetId: item.assetId,
        label: item.label,
        position: [item.root.position.x, item.root.position.y, item.root.position.z],
        rotation: [item.root.rotation.x, item.root.rotation.y, item.root.rotation.z],
        scaling: [item.root.scaling.x, item.root.scaling.y, item.root.scaling.z]
    }));
}

function makeParkCode(existingCodes = new Set()) {
    let code;
    do {
        const random = crypto.getRandomValues(new Uint32Array(1))[0];
        code = `MP-${random.toString(36).toUpperCase().padStart(7, "0").slice(-7)}`;
    } while (existingCodes.has(code));
    return code;
}

function parkRecord(name, code, savedAt = new Date().toISOString()) {
    const parkItems = serializePark();
    const usedAssetIds = new Set(parkItems.map(item => item.assetId));
    return {
        id: `park:${code}`,
        code,
        name,
        version: 2,
        savedAt,
        items: parkItems,
        customFiles: Object.fromEntries(
            [...customAssets.entries()].filter(([assetId]) => usedAssetIds.has(assetId))
        )
    };
}

function setParkManagerMessage(message, isError = false) {
    const element = document.getElementById("parkManagerMessage");
    element.textContent = message;
    element.style.color = isError ? "#ffaaa0" : "";
}

async function saveParkAs() {
    try {
        const name = document.getElementById("parkNameInput").value.trim();
        if (!name) {
            setParkManagerMessage("Enter a name for this park first.", true);
            return;
        }
        const existingParks = await listSavedParks();
        const code = makeParkCode(new Set(existingParks.map(park => park.code)));
        const record = parkRecord(name, code);
        await writeSavedPark(record);
        await writeSavedPark({
            id: PARK_KEY,
            version: record.version,
            savedAt: record.savedAt,
            libraryCode: code,
            items: record.items,
            customFiles: record.customFiles
        });
        document.getElementById("parkNameInput").value = "";
        setParkManagerMessage(`${name} saved. Park code: ${code}`);
        showStatus(`${name} saved on this device. Code: ${code}`);
        await renderSavedParks();
    } catch (error) {
        console.error("Could not save MakeAPark park:", error);
        setParkManagerMessage(`Could not save park: ${error.message}`, true);
    }
}

async function loadParkRecord(record, statusPrefix = "Loaded", persistCurrent = true) {
    if (!Array.isArray(record.items)) throw new Error("The saved park data is not valid.");
    customAssets.clear();
    Object.entries(record.customFiles || {}).forEach(([id, blob]) => customAssets.set(id, blob));
    const itemsToLoad = record.version >= 2 ? record.items : record.items.map(item => ({
        ...item,
        scaling: item.scaling.map(scale => ASSETS[item.assetId] ? scale * DEFAULT_BUILT_IN_SCALE : scale)
    }));
    await restoreEditorState({ items: itemsToLoad, selectedItemId: null });
    undoStack.length = 0;
    redoStack.length = 0;
    updateHistoryButtons();
    if (persistCurrent) {
        await writeSavedPark({
            id: PARK_KEY,
            version: 2,
            savedAt: record.savedAt || new Date().toISOString(),
            libraryCode: record.code || record.libraryCode || null,
            items: itemsToLoad,
            customFiles: record.customFiles || {}
        });
    }
    showStatus(`${statusPrefix} ${record.name || "park"}${record.code ? ` (${record.code})` : ""}.`);
}

function bytesToBase64Url(bytes) {
    let binary = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function base64UrlToBytes(value) {
    const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
    const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
    return Uint8Array.from(binary, character => character.charCodeAt(0));
}

async function encodeSharePayload(payload) {
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    if ("CompressionStream" in window) {
        const compressed = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
        return `g${bytesToBase64Url(new Uint8Array(await new Response(compressed).arrayBuffer()))}`;
    }
    return `j${bytesToBase64Url(bytes)}`;
}

async function decodeSharePayload(encoded) {
    if (!encoded || !["g", "j"].includes(encoded[0])) throw new Error("This park link has an unsupported format.");
    let bytes = base64UrlToBytes(encoded.slice(1));
    if (encoded[0] === "g") {
        if (!("DecompressionStream" in window)) throw new Error("This browser cannot open compressed park links. Update your browser and try again.");
        const decompressed = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
        bytes = new Uint8Array(await new Response(decompressed).arrayBuffer());
    }
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    if (payload.version !== 1 || !Array.isArray(payload.items)) throw new Error("This park link contains invalid park data.");
    return payload;
}

async function sharePark(record) {
    const customFiles = {};
    for (const [assetId, blob] of Object.entries(record.customFiles || {})) {
        if (!(blob instanceof Blob)) throw new Error(`The imported piece "${assetId}" cannot be shared.`);
        customFiles[assetId] = {
            type: blob.type || "model/gltf-binary",
            data: bytesToBase64Url(new Uint8Array(await blob.arrayBuffer()))
        };
    }
    const payload = {
        version: 1,
        code: record.code,
        name: record.name,
        items: record.items,
        customFiles
    };
    const encoded = await encodeSharePayload(payload);
    const shareUrl = `${location.origin}${location.pathname}#park=${encoded}`;
    if (shareUrl.length > 1_800_000) {
        throw new Error("This park is too large for a share link. Export it as a GLB file instead.");
    }
    const input = document.getElementById("shareLinkInput");
    input.value = shareUrl;
    document.getElementById("copyShareLinkButton").disabled = false;
    setParkManagerMessage(`Park code: ${record.code}. The link contains its park data.`);
}

async function renderSavedParks() {
    const list = document.getElementById("savedParksList");
    list.replaceChildren();
    const parks = await listSavedParks();
    if (!parks.length) {
        const empty = document.createElement("p");
        empty.textContent = "No saved parks yet. Enter a name above to save this park.";
        list.append(empty);
        return;
    }
    parks.forEach(park => {
        const row = document.createElement("div");
        row.className = "park-entry";
        const info = document.createElement("div");
        info.className = "park-entry-info";
        const name = document.createElement("strong");
        name.textContent = park.name || "Untitled park";
        const metadata = document.createElement("span");
        metadata.textContent = `${park.code} · ${park.items?.length || 0} pieces`;
        info.append(name, metadata);
        const actions = document.createElement("div");
        actions.className = "park-entry-actions";
        const loadButton = document.createElement("button");
        loadButton.className = "button";
        loadButton.type = "button";
        loadButton.textContent = "Open";
        loadButton.addEventListener("click", () => {
            loadParkRecord(park).then(() => document.getElementById("parksDialog").close())
                .catch(error => {
                    console.error("Could not open saved park:", error);
                    setParkManagerMessage(`Could not open park: ${error.message}`, true);
                });
        });
        const shareButton = document.createElement("button");
        shareButton.className = "button";
        shareButton.type = "button";
        shareButton.textContent = "Share";
        shareButton.addEventListener("click", () => {
            sharePark(park).catch(error => {
                console.error("Could not create park share link:", error);
                setParkManagerMessage(`Could not share park: ${error.message}`, true);
            });
        });
        const deleteButton = document.createElement("button");
        deleteButton.className = "button";
        deleteButton.type = "button";
        deleteButton.textContent = "Delete";
        deleteButton.addEventListener("click", async () => {
            if (!window.confirm(`Delete "${park.name}" from this device?`)) return;
            try {
                await deleteSavedPark(park.id);
                const currentPark = await readSavedPark();
                if (currentPark?.libraryCode === park.code) {
                    await writeSavedPark({ ...currentPark, libraryCode: null });
                }
                await renderSavedParks();
                setParkManagerMessage(`${park.name} deleted from this device.`);
            } catch (error) {
                console.error("Could not delete saved park:", error);
                setParkManagerMessage(`Could not delete park: ${error.message}`, true);
            }
        });
        actions.append(loadButton, shareButton, deleteButton);
        row.append(info, actions);
        list.append(row);
    });
}

async function deleteSavedPark(id) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readwrite");
        transaction.objectStore(STORE_NAME).delete(id);
        transaction.oncomplete = () => {
            database.close();
            resolve();
        };
        transaction.onerror = () => {
            database.close();
            reject(transaction.error || new Error("Could not delete this saved park."));
        };
    });
}

async function restorePark() {
    const sharedPrefix = "#park=";
    if (location.hash.startsWith(sharedPrefix)) {
        const payload = await decodeSharePayload(location.hash.slice(sharedPrefix.length));
        const customFiles = Object.fromEntries(Object.entries(payload.customFiles || {}).map(([assetId, file]) => [
            assetId,
            new Blob([base64UrlToBytes(file.data)], { type: file.type || "model/gltf-binary" })
        ]));
        const sharedPark = {
            version: 2,
            name: payload.name || "Shared park",
            code: payload.code,
            items: payload.items,
            customFiles
        };
        await loadParkRecord(sharedPark, "Opened shared park", false);
        return;
    }

    const savedPark = await readSavedPark();
    if (!savedPark) return;
    await loadParkRecord(savedPark, "Restored");
    if (savedPark.items.length && !Object.prototype.hasOwnProperty.call(savedPark, "libraryCode")) {
        const parks = await listSavedParks();
        const code = makeParkCode(new Set(parks.map(park => park.code)));
        const migrated = {
            ...savedPark,
            id: `park:${code}`,
            code,
            name: "My park",
            libraryCode: undefined
        };
        await writeSavedPark(migrated);
        await writeSavedPark({ ...savedPark, libraryCode: code });
    }
}

async function createParkBlob() {
    if (!BABYLON.GLTF2Export?.GLBAsync) {
        throw new Error("The GLB exporter did not load. Check your internet connection and reload MakeAPark.");
    }
    const result = await BABYLON.GLTF2Export.GLBAsync(scene, "makeapark", {
        shouldExportNode: node => node.metadata?.editorOnly !== true
    });
    const blob = result.glTFFiles["makeapark.glb"];
    if (!(blob instanceof Blob)) throw new Error("The GLB exporter did not return a park file.");
    return blob;
}

async function exportPark() {
    showStatus("Preparing your GLB park file...");
    const blob = await createParkBlob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "makeapark.glb";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showStatus("Park exported as makeapark.glb.");
}

async function testPark() {
    const testWindow = window.open("about:blank", "_blank");
    if (!testWindow) {
        throw new Error("The test window was blocked. Allow pop-ups for this site and try again.");
    }
    try {
        showStatus("Preparing your park for a skate test...");
        const testGlb = await createParkBlob();
        const testParkId = `test-${crypto.randomUUID()}`;
        await writeSavedPark({
            id: testParkId,
            testGlb,
            createdAt: new Date().toISOString()
        });
        const testUrl = new URL("../index.html", window.location.href);
        testUrl.searchParams.set("testPark", testParkId);
        testWindow.location.href = testUrl.href;
        showStatus("Opening your park in the skate game...");
    } catch (error) {
        testWindow.close();
        throw error;
    }
}

function importParkFile(file, point = new BABYLON.Vector3(0, 0, 0)) {
    if (!file || !file.name.toLowerCase().endsWith(".glb")) {
        showStatus("Choose a .glb park file to import.", true);
        return Promise.resolve();
    }
    const assetId = `imported-${crypto.randomUUID()}`;
    customAssets.set(assetId, file);
    const before = captureEditorState();
    showStatus(`Importing ${file.name}...`);
    return instantiateItem(assetId, file.name.replace(/\.glb$/i, ""), point)
        .then(() => {
            commitHistoryChange(before);
            showStatus(`${file.name} imported. Save the park to keep it on this device.`);
        })
        .catch(error => {
            customAssets.delete(assetId);
            modelContainers.delete(assetId);
            throw error;
        });
}

function eventPointOnPark(event) {
    return pickGroundPoint(event.clientX, event.clientY);
}

function configureDragDrop() {
    canvas.addEventListener("dragenter", event => {
        event.preventDefault();
        dropHint.classList.add("visible");
    });
    canvas.addEventListener("dragover", event => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
    });
    canvas.addEventListener("dragleave", event => {
        if (!canvas.contains(event.relatedTarget)) {
            dropHint.classList.remove("visible");
        }
    });
    canvas.addEventListener("drop", event => {
        event.preventDefault();
        dropHint.classList.remove("visible");
        const point = eventPointOnPark(event);
        const droppedAsset = event.dataTransfer.getData("text/plain");
        if (droppedAsset.startsWith("makeapark:")) {
            const assetId = droppedAsset.slice("makeapark:".length);
            placeAsset(assetId, point).catch(error => {
                console.error("Could not drop skatepark piece:", error);
                showStatus(`Could not place piece: ${error.message}`, true);
            });
            return;
        }
        const file = event.dataTransfer.files[0];
        if (file) {
            importParkFile(file, point).catch(error => {
                console.error("Could not import GLB park:", error);
                showStatus(`Could not import GLB: ${error.message}`, true);
            });
        }
    });
}

scene.onPointerObservable.add(pointerInfo => {
    if (pointerInfo.type !== BABYLON.PointerEventTypes.POINTERDOWN ||
        pointerInfo.event.button !== 0) return;
    const pick = scene.pick(
        scene.pointerX,
        scene.pointerY,
        mesh => mesh.isPickable && mesh.metadata?.editorOnly !== true,
        false,
        camera
    );
    setSelectedItem(pick?.hit ? itemIdFromNode(pick.pickedMesh) : null);
});

document.getElementById("rotateButton").addEventListener("click", () => {
    rotateSelectedItem().catch(error => {
        console.error("Could not rotate selected piece:", error);
        showStatus(`Could not rotate piece: ${error.message}`, true);
    });
});
document.getElementById("moveToolButton").addEventListener("click", () => setTransformMode("move"));
document.getElementById("rotateToolButton").addEventListener("click", () => setTransformMode("rotate"));
document.getElementById("scaleToolButton").addEventListener("click", () => setTransformMode("scale"));
document.getElementById("worldOrientationButton").addEventListener("click", () => setGizmoOrientation("world"));
document.getElementById("localOrientationButton").addEventListener("click", () => setGizmoOrientation("local"));
document.getElementById("copyButton").addEventListener("click", copySelectedItem);
document.getElementById("pasteButton").addEventListener("click", () => {
    pasteCopiedItem().catch(error => {
        console.error("Could not paste copied piece:", error);
        showStatus(`Could not paste piece: ${error.message}`, true);
    });
});
document.getElementById("deleteButton").addEventListener("click", removeSelectedItem);
document.getElementById("saveButton").addEventListener("click", () => {
    renderSavedParks().then(() => document.getElementById("parksDialog").showModal())
        .catch(error => {
            console.error("Could not list saved parks:", error);
            showStatus(`Could not list saved parks: ${error.message}`, true);
        });
});
document.getElementById("saveParkAsButton").addEventListener("click", saveParkAs);
document.getElementById("closeParksDialogButton").addEventListener("click", () => {
    document.getElementById("parksDialog").close();
});
document.getElementById("copyShareLinkButton").addEventListener("click", async () => {
    const input = document.getElementById("shareLinkInput");
    try {
        await navigator.clipboard.writeText(input.value);
        setParkManagerMessage("Share link copied to clipboard.");
    } catch (error) {
        input.focus();
        input.select();
        setParkManagerMessage("Clipboard access was denied. The link is selected; press Ctrl+C to copy it.", true);
    }
});
document.getElementById("undoButton").addEventListener("click", () => {
    undo().catch(error => handleHistoryError("undo", error));
});
document.getElementById("redoButton").addEventListener("click", () => {
    redo().catch(error => handleHistoryError("redo", error));
});
snapToggleButton.addEventListener("click", toggleSnap);
document.getElementById("exportButton").addEventListener("click", () => {
    exportPark().catch(error => {
        console.error("Could not export MakeAPark GLB:", error);
        showStatus(`Could not export GLB: ${error.message}`, true);
    });
});
document.getElementById("testParkButton").addEventListener("click", () => {
    testPark().catch(error => {
        console.error("Could not start MakeAPark play test:", error);
        showStatus(`Could not test park: ${error.message}`, true);
    });
});
document.getElementById("importButton").addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) {
        importParkFile(file).catch(error => {
            console.error("Could not import MakeAPark GLB:", error);
            showStatus(`Could not import GLB: ${error.message}`, true);
        });
    }
    fileInput.value = "";
});

window.addEventListener("keydown", event => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLElement && event.target.isContentEditable) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        const action = event.shiftKey ? redo : undo;
        const name = event.shiftKey ? "redo" : "undo";
        action().catch(error => handleHistoryError(name, error));
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo().catch(error => handleHistoryError("redo", error));
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
        if (copySelectedItem()) event.preventDefault();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
        event.preventDefault();
        pasteCopiedItem().catch(error => {
            console.error("Could not paste copied piece:", error);
            showStatus(`Could not paste piece: ${error.message}`, true);
        });
    } else if (!event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "s" && !event.repeat) {
        event.preventDefault();
        toggleSnap();
    } else if (!event.ctrlKey && !event.metaKey && event.key === "1") {
        setTransformMode("move");
    } else if (!event.ctrlKey && !event.metaKey && event.key === "2") {
        setTransformMode("rotate");
    } else if (!event.ctrlKey && !event.metaKey && event.key === "3") {
        setTransformMode("scale");
    } else if (!event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "r" && !event.repeat) {
        event.preventDefault();
        rotateSelectedItem();
    } else if ((event.key === "Delete" || event.key === "Backspace") && selectedItemId) {
        event.preventDefault();
        removeSelectedItem();
    } else if (event.key === "Escape") {
        setSelectedItem(null);
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        savePark();
    }
});

updateSnapButton();
renderCategories();
renderAssetList();
configureDragDrop();

engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());

restorePark().catch(error => {
    console.error("Could not restore saved MakeAPark:", error);
    showStatus(`Could not restore saved park: ${error.message}`, true);
});
