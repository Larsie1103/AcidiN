// ========== ANIMATIES ==========
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
// ========== WIELEN IMPORTEREN ==========
async function loadWheelSet(name, parentNode, scene) {
    wheelMeshes.forEach(m => m.dispose());
    wheelMeshes = [];

    try {
        const result = await BABYLON.SceneLoader.ImportMeshAsync("", GAME_SETTINGS.assets.wheelDirectory, name + ".glb", scene);
        const root = result.meshes[0];
        root.parent = parentNode;
        root.position.set(0, 0, 0);
        root.rotationQuaternion = null;
        root.rotation.set(0, 0, 0);
        root.isVisible = false;

        const frontTruck = boardParts && boardParts.frontTruck;
        const rearTruck = boardParts && boardParts.rearTruck;

        result.meshes.forEach(m => {
            if (m === root) return;
            m.isVisible = true;
            m.scaling.set(1, 1, 1);

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

// ========== SKATEBOARD & CHARACTER MODEL ==========
async function loadPlayerModels(scene) {
    try {
        const result = await BABYLON.SceneLoader.ImportMeshAsync("", "", GAME_SETTINGS.assets.board, scene);
        const skateboard = result.meshes[0];
        skateboard.parent = playerPhysicsMesh;
        boardParts.root = skateboard;
        characterRootNode = scene.getNodeByName("character-skate-boy");
        characterSkeleton = result.skeletons.find(skeleton =>
            skeleton.bones.some(bone => bone.name === "root") &&
            skeleton.bones.some(bone => bone.name === "torso")
        ) || null;

        boardAnimGroups = result.animationGroups || [];
        console.table(boardAnimGroups.map(animation => ({
            naam: animation.name,
            begin: animation.from,
            einde: animation.to,
            targets: animation.targetedAnimations.length
        })));

        idleAnim = boardAnimGroups.find(a => a.name.toLowerCase().includes("idle"));
        pushAnim = boardAnimGroups.find(a => a.name.toLowerCase().includes("push"));
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

        Object.values(boardParts.wheels).forEach(wheel => {
            if (wheel) wheel.isVisible = false;
        });

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
        playerPhysicsMesh.isVisible = true;
        const fallbackMat = new BABYLON.StandardMaterial("fallback", scene);
        fallbackMat.diffuseColor = new BABYLON.Color3(0.1, 0.65, 0.38);
        playerPhysicsMesh.material = fallbackMat;
    }
}

// ========== MAPS & STERREN ==========
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

async function initInitialMap(scene) {
    const { physics } = GAME_SETTINGS.gameplay;
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
            spawnPosition: [0, 5, 0] // <-- Zorg dat [0, 5, 0] hier staat
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

    // Zet positie én forceer Havok om deze direct over te nemen
    if (playerPhysicsBody) playerPhysicsBody.disablePreStep = false;
    playerPhysicsMesh.position.set(...activeMap.spawnPosition);
    playerPhysicsMesh.computeWorldMatrix(true);
    if (playerPhysicsBody) {
        playerPhysicsBody.setLinearVelocity(BABYLON.Vector3.Zero());
        playerPhysicsBody.setAngularVelocity(BABYLON.Vector3.Zero());
    }

    playerPhysicsMesh.position.set(...activeMap.spawnPosition);

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
