// ========== INPUT & GAME LOOP ==========
function setupGameLoop(scene) {
    const { camera: cameraSettings } = GAME_SETTINGS.gameplay;
    const cameraDistance = cameraSettings.followDistance;
    const cameraSmoothness = cameraSettings.smoothness;
    const defaultPitch = cameraSettings.defaultPitch;

    // 1. CAMERA & HULPLIJNEN UPDATE (ELKE FRAME)
    scene.onBeforeRenderObservable.add(() => {
        const dt = engine.getDeltaTime() / 1000;
        const rotation = playerPhysicsMesh.rotationQuaternion;
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
        const targetPosition = playerPhysicsMesh.position.subtract(camDir.scale(cameraDistance));

        const t = 1 - Math.exp(-cameraSmoothness * dt);
        gameCamera.position = BABYLON.Vector3.Lerp(gameCamera.position, targetPosition, t);
        gameCamera.setTarget(playerPhysicsMesh.position);

        grindCylinder.position.copyFrom(playerPhysicsMesh.position);
        grindCylinder.position.y += 0.2;
        if (playerPhysicsMesh.rotationQuaternion) {
            grindCylinder.rotationQuaternion = playerPhysicsMesh.rotationQuaternion.clone();
        }

        boardLine.position.copyFrom(playerPhysicsMesh.position);
        boardLine.position.y += BOARD_LINE_OFFSET_Y;
        if (playerPhysicsMesh.rotationQuaternion) {
            boardLine.rotationQuaternion = playerPhysicsMesh.rotationQuaternion.clone();
            const extra = BABYLON.Quaternion.FromEulerAngles(Math.PI / 2, 0, 0);
            boardLine.rotationQuaternion = playerPhysicsMesh.rotationQuaternion.multiply(extra);
        }
    });

    // 2. TOETSENBORD & MUIS CONTROLS
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
            if (now - lastPushTime < PUSH_DELAY) return;
            lastPushTime = now;

            const oldSpeed = speed;
            speed = Math.min(speed + pushpower, maxSpeed);

            if (speed > oldSpeed) {
                if (pushAnim) playBoardAnim("push", false);
                addLevelProgress("push", "push");
            }
        }

        if (keyMatches("switchWheels", key)) {
            if (boardParts.root) {
                cycleWheels(boardParts.root, scene);
            }
        }

        if (isGrinding && keyMatches("boardslide", key) && controlPressed("boardslide", inputMap)) {
            currentGrindType = "boardslide";
            const yaw = Math.atan2(grindAxis.x, grindAxis.z) + Math.PI / 2;
            playerPhysicsMesh.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(0, yaw, 0);
        }

        if (keyMatches("grind", key) && !isGrinding) {
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

                grindOrigin = playerPhysicsMesh.position.clone();

                const yaw = Math.atan2(grindAxis.x, grindAxis.z) +
                    (currentGrindType === "boardslide" ? Math.PI / 2 : 0);
                playerPhysicsMesh.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(0, yaw, 0);
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
            boardPhysics.body.applyImpulse(impulseVector, playerPhysicsMesh.absolutePosition);
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

canvas.addEventListener("click", () => {
    if (isCharacterRagdolled) return;
    getAudioCtx();
    if (document.pointerLockElement !== canvas) {
        canvas.requestPointerLock();
    }
});

canvas.addEventListener("mousedown", (e) => { if (e.button === 0) isLeftMouseDown = true; });
canvas.addEventListener("mouseup", (e) => { if (e.button === 0) isLeftMouseDown = false; });
window.addEventListener("mouseup", (e) => { if (e.button === 0) isLeftMouseDown = false; });

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
    // 3. HOOFD GAME LOOP (ELKE FRAME)
    scene.onBeforeRenderObservable.add(() => {
        const dt = engine.getDeltaTime() / 1000;
        const currentVelocity = boardPhysics.body.getLinearVelocity();

        if (usernameLabel) {
            usernameLabel.mesh.position.copyFrom(isCharacterRagdolled && characterRootNode
                ? characterRootNode.getAbsolutePosition()
                : playerPhysicsMesh.position);
            usernameLabel.mesh.position.y += USERNAME_HIGHT;
        }
        if (isCharacterRagdolled) return;

        // Minimap
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
            const px = playerPhysicsMesh.position.x;
            const pz = playerPhysicsMesh.position.z;

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

            ctx.fillStyle = "#4ade80";
            ctx.beginPath();
            ctx.arc(cx, cy, 4, 0, Math.PI * 2);
            ctx.fill();
        }

        checkLevelStarPickups(playerPhysicsMesh.position);

        // Grind logica
        if (isGrinding && currentGrindMesh) {
            const stillOn = grindCylinder.intersectsMesh(currentGrindMesh, false);

            if (!stillOn) {
                isGrinding = false;
                completeCurrentGrind();
                boardPhysics.body.disablePreStep = true;
            } else {
                const boardLinePos = boardLine.getAbsolutePosition();
                const toLine = boardLinePos.subtract(grindOrigin);
                const along = BABYLON.Vector3.Dot(toLine, grindAxis);
                const pointOnRail = grindOrigin.add(grindAxis.scale(along));

                const offset = pointOnRail.subtract(boardLinePos);
                offset.y = 0;

                const targetPos = playerPhysicsMesh.position.add(offset);
                targetPos.y = BABYLON.Scalar.Lerp(playerPhysicsMesh.position.y, pointOnRail.y + GRIND_HEIGHT_OFFSET, 0.25);

                boardPhysics.body.disablePreStep = false;
                playerPhysicsMesh.position.copyFrom(targetPos);
                grindOrigin.addInPlace(offset);

                const grindSpeed = Math.max(speed, 12);
                const vel = grindAxis.scale(grindSpeed);
                boardPhysics.body.setLinearVelocity(new BABYLON.Vector3(vel.x, 0, vel.z));
                boardPhysics.body.setAngularVelocity(BABYLON.Vector3.Zero());

                const yaw = Math.atan2(grindAxis.x, grindAxis.z) +
                    (currentGrindType === "boardslide" ? Math.PI / 2 : 0);
                playerPhysicsMesh.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(0, yaw, 0);
            }
        } else if (boardPhysics.body.disablePreStep === false) {
            boardPhysics.body.disablePreStep = true;
        }

        // Ground check
        const groundRayOrigin = playerPhysicsMesh.position.clone();
        groundRayOrigin.y += 0.2;
        const groundRay = new BABYLON.Ray(groundRayOrigin, BABYLON.Vector3.Down(), 0.8);
        const groundHit = scene.pickWithRay(groundRay, (m) => m !== playerPhysicsMesh && m !== grindCylinder && m !== boardLine);
        const isGrounded = !!(groundHit && groundHit.hit);
        const wasGrounded = playerIsGrounded;
        playerIsGrounded = isGrounded;
        resolveTrickInputBuffer();

        if (!wasGrounded && isGrounded) {
            const boardUp = playerPhysicsMesh.rotationQuaternion
                ? BABYLON.Vector3.Up().rotateByQuaternionToRef(
                    playerPhysicsMesh.rotationQuaternion,
                    new BABYLON.Vector3()
                )
                : BABYLON.Vector3.Up();
            const isBail = isBailLanding(boardUp, currentVelocity, playerPhysicsMesh.rotationQuaternion);
            settleTrickLanding(isBail);
            if (isBail) beginCharacterRagdoll(currentVelocity, boardPhysics);
        }
        if (isGrounded && Math.abs(currentVelocity.y) < 1 && ollieTimer <= 0) {
            canOllie = true;
        }

        // Muur-bail & anti-stuck
        if (!isCharacterRagdolled && !isGrinding) {
            const prevSpeed = window.prevHorizontalSpeed || 0;
            const currSpeed = Math.sqrt(currentVelocity.x * currentVelocity.x + currentVelocity.z * currentVelocity.z);
            window.prevHorizontalSpeed = currSpeed;

            if (prevSpeed > 18 && currSpeed < prevSpeed * 0.35 && currSpeed > 4) {
                speed = 0;
                boardPhysics.body.setLinearVelocity(BABYLON.Vector3.Zero());
                beginCharacterRagdoll(currentVelocity, boardPhysics);
            }

            if (currSpeed < 1.2 && speed < 2) {
                const origin = playerPhysicsMesh.position.add(new BABYLON.Vector3(0, 0.45, 0));
                const filter = m => m !== playerPhysicsMesh && m !== grindCylinder && m !== boardLine;
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

                            boardPhysics.body.disablePreStep = false;
                            playerPhysicsMesh.position.addInPlace(push.scale(0.3));
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
            const rotQuat = playerPhysicsMesh.rotationQuaternion;
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

            // Muis tricks & pitch
            if (isPointerLocked && !isLeftMouseDown && (mouseDeltaX !== 0 || mouseDeltaY !== 0)) {
                if (rotQuat) {
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

                    if (!isGrounded && !isFlipping && Math.abs(mouseDeltaX) > FLIP_MOUSE_THRESHOLD) {
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

            // Manual uitvoeren
            if (isManualing && rotQuat) {
                manualProgress += dt / MANUAL_DURATION;
                if (manualProgress >= 1) {
                    isManualing = false;
                } else {
                    const pitchAxis = BABYLON.Vector3.Right().rotateByQuaternionToRef(rotQuat, new BABYLON.Vector3());
                    angularVel.addInPlace(pitchAxis.scale(manualDir * MANUAL_PITCH_SPEED));
                }
            }


            // Stabiliteit op de grond: lijn het board uit met de helling van de ramp
            if (isGrounded && !isVertical) {
                const groundNormal = groundHit?.getNormal(true);
                if (groundNormal && rotQuat) {
                    const boardUp = BABYLON.Vector3.Up().rotateByQuaternionToRef(rotQuat, new BABYLON.Vector3());
                    const alignAxis = BABYLON.Vector3.Cross(boardUp, groundNormal);
                    const alignStrength = 8.0;
                    angularVel.x = alignAxis.x * alignStrength;
                    angularVel.z = alignAxis.z * alignStrength;
                } else {
                    angularVel.x *= 0.2;
                    angularVel.z *= 0.2;
                }
            }

            boardPhysics.body.setAngularVelocity(angularVel);

            // Voorwaartse beweging (deze ontbrak!)
            if (rotQuat) {
                const forward = BABYLON.Vector3.Forward().rotateByQuaternionToRef(rotQuat, new BABYLON.Vector3());
                const up = BABYLON.Vector3.Up().rotateByQuaternionToRef(rotQuat, new BABYLON.Vector3());
                const currentVel = boardPhysics.body.getLinearVelocity();
                const isOnSlope = isGrounded && up.y < 0.96;

                if (isGrounded) {
                    const currentForwardSpeed = BABYLON.Vector3.Dot(currentVel, forward);
                    if (isOnSlope) {
                        speed = Math.max(0, currentForwardSpeed);
                    }

                    if (speed > 0) {
                        const desired = forward.scale(speed);
                        const blend = isOnSlope ? 0.15 : 0.45;
                        boardPhysics.body.setLinearVelocity(new BABYLON.Vector3(
                            BABYLON.Scalar.Lerp(currentVel.x, desired.x, blend),
                            isOnSlope ? currentVel.y : BABYLON.Scalar.Lerp(currentVel.y, desired.y, blend),
                            BABYLON.Scalar.Lerp(currentVel.z, desired.z, blend)
                        ));
                        speed = Math.max(0, speed - SlowDownPower * dt * 60);
                    } else if (!isOnSlope) {
                        boardPhysics.body.setLinearVelocity(new BABYLON.Vector3(
                            BABYLON.Scalar.Lerp(currentVel.x, 0, 0.3),
                            currentVel.y,
                            BABYLON.Scalar.Lerp(currentVel.z, 0, 0.3)
                        ));
                    }
                }
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

        // Visuele ollie, flips & impossible
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

        // Special trick animatie
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

        // Wielen laten draaien
        if (speed > 0 && !isGrinding) {
            const wheelRotationAmount = speed * dt * 2.0;
            Object.values(boardParts.wheels).forEach(wheel => {
                if (wheel) {
                    wheel.rotation.x += wheelRotationAmount;
                }
            });
        }
    });
}
// ========== GAME INITIALISATIE & OPSTARTEN ==========
async function createGame() {
    const scene = new BABYLON.Scene(engine);
    gameScene = scene;

    await setupWorld(scene);
    await initInitialMap(scene);
    await loadPlayerModels(scene);
    setupGameLoop(scene);

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
