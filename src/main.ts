import * as SPLAT from "gsplat";
import * as THREE from "three";

// 创建场景、相机和渲染器
const scene = new SPLAT.Scene();
const renderer = new SPLAT.WebGLRenderer();

// 创建 THREE 相机
const threeCamera = new THREE.PerspectiveCamera(
  60, // 更宽的视野
  window.innerWidth / window.innerHeight,
  0.01, // 更近的近平面
  1000   // 更远的远平面
);

// 创建 SPLAT 相机
const camera = new SPLAT.Camera();
// 初始化相机属性
if (!camera.position) {
    camera.position = { x: 0, y: 0, z: 0 };
}
threeCamera.position.set(0,-1.68,2); // 初始位置
threeCamera.up.set(0, 1, 0); // 保持一致的上向量，避免在极端俯仰时翻转
threeCamera.lookAt(0,0,0); // 初始朝向
// 为 SPLAT 相机添加 lookAt 方法（如果没有的话）
if (typeof camera.lookAt !== 'function') {
    camera.lookAt = function(_x: any, _y?: any, _z?: any) {};
}

// 设置画布大小
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.canvas);
renderer.canvas.style.touchAction = 'none'; // 禁用默认触摸行为
renderer.canvas.style.userSelect = 'none'; // 禁用文本选择
renderer.canvas.style.cursor = 'crosshair'; // 设置初始光标样式
renderer.canvas.tabIndex = 0; // 使画布可聚焦以接收键盘事件
// 阻止右键默认菜单
renderer.canvas.addEventListener('contextmenu', (e) => e.preventDefault());


// 创建 HUD 界面
const createHUD = () => {
  const hud = document.createElement('div');
  hud.style.pointerEvents = 'none';
  hud.style.position = 'absolute';
  hud.style.top = '20px';
  hud.style.left = '20px';
  hud.style.color = 'white';
  hud.style.fontSize = '14px';
  hud.style.textShadow = '0 0 10px rgba(0,0,0,0.7)';
  hud.style.background = 'rgba(0,0,0,0.5)';
  hud.style.padding = '10px';
  hud.style.borderRadius = '5px';
  hud.innerHTML = '加载3DGS模型中...';
  document.body.appendChild(hud);
  return hud;
};

const hud = createHUD();

// 统一第一人称模式
let currentMode: 'first-person' = 'first-person';

// 世界边界包围盒（AABB）——可由加载的场景计算或手动设定
let boundsEnabled: boolean = true;
const worldBounds = {
    min: new THREE.Vector3(-5, -2.44, -2.30),
    max: new THREE.Vector3(5,  -1.40,  2.30)
};

// 尝试从加载的 SPLAT 场景推断包围盒（多种后备策略以提高鲁棒性）
function setBoundsFromScene(sceneObj: any) {
    try {
        // 优先查找已存在的 bounds / aabb / bbox 字段
        const candidates = ['bounds', 'aabb', 'bbox', '_bounds', '_aabb'];
        for (const k of candidates) {
            if (sceneObj && sceneObj[k] && sceneObj[k].min && sceneObj[k].max) {
                worldBounds.min.set(sceneObj[k].min.x, sceneObj[k].min.y, sceneObj[k].min.z);
                worldBounds.max.set(sceneObj[k].max.x, sceneObj[k].max.y, sceneObj[k].max.z);
                console.log('setBoundsFromScene via', k, worldBounds);
                return true;
            }
        }
        // 回退：尝试在 sceneObj 中查找原始点位置数组（gsplat 的 Scene 结构可能没有 children）
        // 我们搜索 Float32Array 或 number[]，长度为 3 的倍数（一组 xyz），并抽样计算百分位数以剔除孤立点
        function findPointArray(obj: any, seen = new Set<any>()): Float32Array | number[] | null {
            if (!obj || typeof obj !== 'object') return null;
            if (seen.has(obj)) return null;
            seen.add(obj);
            for (const key of Object.keys(obj)) {
                try {
                    const val = obj[key];
                    if (!val) continue;
                    // 直接是 TypedArray 或常规数组
                    if ((val instanceof Float32Array || Array.isArray(val)) && val.length >= 3 && val.length % 3 === 0) {
                        return val;
                    }
                    // 递归查找（深度有限制由调用栈控制）
                    if (typeof val === 'object') {
                        const nested = findPointArray(val, seen);
                        if (nested) return nested;
                    }
                } catch (err) {
                    // 忽略读取错误
                }
            }
            return null;
        }

        const positions = findPointArray(sceneObj) as (Float32Array | number[] | null);
        if (positions && positions.length >= 3) {
            // 抽样点数量上限（点数）
            const maxSamplePoints = 20000;
            const totalPoints = Math.floor(positions.length / 3);
            const step = Math.max(1, Math.floor(totalPoints / maxSamplePoints));
            const xs: number[] = [];
            const ys: number[] = [];
            const zs: number[] = [];
            for (let i = 0; i < totalPoints; i += step) {
                const idx = i * 3;
                const x = (positions as any)[idx];
                const y = (positions as any)[idx + 1];
                const z = (positions as any)[idx + 2];
                if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
                    xs.push(x); ys.push(y); zs.push(z);
                }
            }
            if (xs.length >= 4) {
                const percentile = (arr: number[], p: number) => {
                    const a = arr.slice().sort((a,b)=>a-b);
                    const idx = Math.floor((a.length - 1) * p);
                    return a[idx];
                };
                const lowP = 0.02; // 2% 去除极端离群值
                const highP = 0.98;
                const xmin = percentile(xs, lowP);
                const xmax = percentile(xs, highP);
                const ymin = percentile(ys, lowP);
                const ymax = percentile(ys, highP);
                const zmin = percentile(zs, lowP);
                const zmax = percentile(zs, highP);
                // padding: 5% of span 或最小 0.1
                const padX = Math.max(0.1, (xmax - xmin) * 0.05);
                const padY = Math.max(0.1, (ymax - ymin) * 0.05);
                const padZ = Math.max(0.1, (zmax - zmin) * 0.05);
                worldBounds.min.set(xmin - padX, ymin - padY, zmin - padZ);
                worldBounds.max.set(xmax + padX, ymax + padY, zmax + padZ);
                console.log('setBoundsFromScene via sampled positions (percentile)', { min: worldBounds.min, max: worldBounds.max });
                return true;
            }
        }

        // 退回：尝试基于可能存在的 per-object position 字段（兼容部分实现）
        if (sceneObj && sceneObj.children && sceneObj.children.length > 0) {
            const mins = new THREE.Vector3(Infinity, Infinity, Infinity);
            const maxs = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
            let found = false;
            for (const c of sceneObj.children) {
                if (c && c.position) {
                    mins.min(new THREE.Vector3(c.position.x, c.position.y, c.position.z));
                    maxs.max(new THREE.Vector3(c.position.x, c.position.y, c.position.z));
                    found = true;
                }
            }
            if (found) {
                worldBounds.min.copy(mins).addScalar(-1); // margin
                worldBounds.max.copy(maxs).addScalar(1);
                console.log('setBoundsFromScene via children positions (fallback)', worldBounds);
                return true;
            }
        }
    } catch (err) {
        console.warn('setBoundsFromScene failed', err);
    }
    // 最终退回到合理默认值：基于 threeCamera 距离或固定默认盒子
    try {
        const camDist = threeCamera.position.length();
        const defaultRadius = Math.max(3, camDist * 1.5);
        worldBounds.min.set(-defaultRadius, -2.5, -defaultRadius);
        worldBounds.max.set(defaultRadius, 2.5, defaultRadius);
        console.log('setBoundsFromScene fallback to default bounds', worldBounds);
    } catch (err) {
        // 极端情况下再次使用硬编码默认
        worldBounds.min.set(-5, -3, -5);
        worldBounds.max.set(5, 3, 5);
        console.log('setBoundsFromScene final fallback', worldBounds);
    }
    return true;
}

function clampToBounds(v: THREE.Vector3) {
    const out = v.clone();
    out.x = Math.max(worldBounds.min.x, Math.min(worldBounds.max.x, out.x));
    out.y = Math.max(worldBounds.min.y, Math.min(worldBounds.max.y, out.y));
    out.z = Math.max(worldBounds.min.z, Math.min(worldBounds.max.z, out.z));
    return out;
}



// Debug: toggle rendering with threeCamera directly to verify if SPLAT ignores orientation
let useThreeCamera: boolean = false;
let forceMatrixSync: boolean = false; // 强制将 three.js 矩阵复制到 SPLAT Camera 的多个可能字段
let invertUp: boolean = false; // 用于测试是否需要反转 up 向量（左右手系问题）
window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyT') {
        useThreeCamera = !useThreeCamera;
        console.log('🔁 render camera toggled:', useThreeCamera ? 'threeCamera' : 'splat camera');
    } else if (e.code === 'KeyM') {
        forceMatrixSync = !forceMatrixSync;
        console.log('🔁 forceMatrixSync toggled:', forceMatrixSync);
    } else if (e.code === 'KeyL') {
        console.log('📋 splat camera keys (dump):', Object.keys(camera as any));
        try {
            console.log('splat camera sample', {
                position: (camera as any).position,
                quaternion: (camera as any).quaternion,
                rotation: (camera as any).rotation,
                viewMatrix: (camera as any).viewMatrix,
                matrix: (camera as any).matrix,
                matrixWorld: (camera as any).matrixWorld,
                projectionMatrix: (camera as any).projectionMatrix
            });
        } catch (err) { console.warn('dump failed', err); }
    } else if (e.code === 'KeyU') {
        invertUp = !invertUp;
        const val = invertUp ? -1 : 1;
        threeCamera.up.set(0, val, 0);
        if ((camera as any).up) {
            try { (camera as any).up.y = val; } catch (err) {}
        }
        console.log('🔁 invertUp toggled. threeCamera.up set to', threeCamera.up);
    } else if (e.code === 'KeyB') {
        boundsEnabled = !boundsEnabled;
        console.log('🔁 boundsEnabled:', boundsEnabled, worldBounds);
    } else if (e.code === 'KeyO') {
        const ok = setBoundsFromScene(scene);
        console.log('🔁 setBoundsFromScene result:', ok, worldBounds);
    }
});

// 第一人称控制器
class FirstPersonController {
    private camera: THREE.PerspectiveCamera;
    private velocity: THREE.Vector3;
    private movementSpeed: number = 3.0;
    // 灵敏度调低以获得更细腻的拖拽手感
    private mouseSensitivity: number = 0.0015;
    private yaw: number = 0;
    private pitch: number = 0;
    private isMouseLocked: boolean = false;
    private isDragging: boolean = false;
    private dragSensitivityMultiplier: number = 3.0; // 左键拖拽更灵敏一些（调小）

    // 防止俯仰角到 ±90 导致奇异（使用小余量）
    private readonly PITCH_LIMIT: number = Math.PI / 2 - 0.01;
    // 平滑速度（每秒），在 update 中按 deltaTime 进行 slerp
    private targetQuaternion: THREE.Quaternion = new THREE.Quaternion();
    private readonly smoothingSpeed: number = 8.0;

    // 移动状态
    private moveForward: boolean = false;
    private moveBackward: boolean = false;
    private moveLeft: boolean = false;
    private moveRight: boolean = false;
    private moveUp: boolean = false;
    private moveDown: boolean = false;

    // Diagnostics (外部可读)
    public lastPitchClamped: boolean = false;
    public lastDirLength: number = 0;
    // 最近一帧的速度因子（0-1），用于 HUD 显示和调试
    public lastSpeedFactor: number = 1;

    constructor(camera: THREE.PerspectiveCamera) {
        this.camera = camera;
        this.velocity = new THREE.Vector3();
        // 从当前相机四元数初始化 yaw/pitch，避免首次移动跳跃
        const euler = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
        this.pitch = euler.x;
        this.yaw = euler.y;
        this.setupEventListeners();
    }

    private setupEventListeners() {
        // 点击进入 pointer lock（已移除自动进入，避免影响左键拖拽）
        // 点击不再自动请求 pointer lock。若需要，可使用双击或 UI 按钮触发。

        // 指针锁定状态变化
        document.addEventListener('pointerlockchange', () => {
            this.isMouseLocked = document.pointerLockElement === renderer.canvas;
            renderer.canvas.style.cursor = this.isMouseLocked ? 'none' : 'crosshair';
        });

        // pointer lock 下的鼠标移动
        document.addEventListener('mousemove', (event) => {
            if (!this.isMouseLocked) return;

            const movementX = event.movementX || 0;
            const movementY = event.movementY || 0;

            this.yaw -= movementX * this.mouseSensitivity;
            this.pitch -= movementY * this.mouseSensitivity;

            // 限制俯仰角，避免到达 +/-90 的奇异点
            const oldPitch = this.pitch;
            this.pitch = Math.max(-this.PITCH_LIMIT, Math.min(this.PITCH_LIMIT, this.pitch));
            this.lastPitchClamped = Math.abs(this.pitch - oldPitch) > 0 && Math.abs(Math.abs(this.pitch) - this.PITCH_LIMIT) < 1e-5;
            if (this.lastPitchClamped) {
                console.log('pitch clamped to limit', this.pitch);
            }

            // 计算目标四元数并保存，实际应用将在 update 中按帧平滑过渡
            const targetQ = new THREE.Quaternion();
            targetQ.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
            this.targetQuaternion.copy(targetQ);
        });

        // 左键拖拽看向（非 pointer lock）
        renderer.canvas.addEventListener('pointerdown', (e) => {
            console.log('FP pointerdown', { button: e.button });
            // 获取焦点（不要 preventDefault，允许点击交互）
            renderer.canvas.focus();
            if (e.button === 0) {
                try { renderer.canvas.setPointerCapture(e.pointerId); } catch (err) {}
                this.isDragging = true;
                renderer.canvas.style.cursor = 'grabbing';
            }
        });

        renderer.canvas.addEventListener('pointermove', (e) => {
            if (this.isDragging && !this.isMouseLocked) {
                const movementX = e.movementX || 0;
                const movementY = e.movementY || 0;
                // 更新 yaw/pitch（移除高频日志，最终平滑在 update 中应用）
                this.yaw -= movementX * this.mouseSensitivity * this.dragSensitivityMultiplier;
                this.pitch -= movementY * this.mouseSensitivity * this.dragSensitivityMultiplier;
                const oldPitch = this.pitch;
                this.pitch = Math.max(-this.PITCH_LIMIT, Math.min(this.PITCH_LIMIT, this.pitch));
                this.lastPitchClamped = Math.abs(this.pitch - oldPitch) > 0 && Math.abs(Math.abs(this.pitch) - this.PITCH_LIMIT) < 1e-5;
                if (this.lastPitchClamped) {
                    console.log('pitch clamped to limit (drag)', this.pitch);
                }
                const targetQ = new THREE.Quaternion();
                targetQ.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
                this.targetQuaternion.copy(targetQ);
                // 应用矩阵更新，确保 getWorldDirection/渲染读取到最新朝向
                try { this.camera.updateMatrixWorld(true); } catch (err) {}
                // 不阻止默认事件，保证点击和其他交互正常工作
            }
        });

        renderer.canvas.addEventListener('pointerup', (e) => {
            console.log('FP pointerup', { button: e.button });
            if (e.button === 0) {
                try { renderer.canvas.releasePointerCapture(e.pointerId); } catch (err) {}
                this.isDragging = false;
                renderer.canvas.style.cursor = 'crosshair';
            }
        });

        renderer.canvas.addEventListener('pointerleave', () => {
            this.isDragging = false;
            renderer.canvas.style.cursor = 'crosshair';
        });

        // 键盘控制（始终生效）
        document.addEventListener('keydown', (event) => {
            switch (event.code) {
                case 'KeyW': this.moveForward = true; break;
                case 'KeyS': this.moveBackward = true; break;
                case 'KeyA': this.moveLeft = true; break;
                case 'KeyD': this.moveRight = true; break;
                case 'KeyQ': this.moveUp = true; break;
                case 'KeyE': this.moveDown = true; break;
                case 'Escape':
                    if (document.pointerLockElement) {
                        document.exitPointerLock();
                    }
                    break;
            }
        });

        document.addEventListener('keyup', (event) => {
            switch (event.code) {
                case 'KeyW': this.moveForward = false; break;
                case 'KeyS': this.moveBackward = false; break;
                case 'KeyA': this.moveLeft = false; break;
                case 'KeyD': this.moveRight = false; break;
                case 'KeyQ': this.moveUp = false; break;
                case 'KeyE': this.moveDown = false; break;
            }
        });
    }

    update(deltaTime: number) {
        // 平滑过渡相机朝向（采用速率而不是固定插值），避免拖拽产生生硬跳变
        try {
            const t = Math.min(1, this.smoothingSpeed * deltaTime);
            this.camera.quaternion.slerp(this.targetQuaternion, t);
            try { this.camera.updateMatrixWorld(true); } catch (err) {}
        } catch (err) {}

        // 始终允许移动（无论是否 pointer lock）
        this.velocity.set(0, 0, 0);

        // 获取前进方向（水平面），基于 camera.quaternion 的前向向量但去除垂直分量，确保水平移动与视角的 yaw 对齐
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        forward.y = 0; // 去除垂直分量
        if (forward.lengthSq() > 1e-6) {
            forward.normalize();
        } else {
            // fallback to yaw-based direction if degenerate
            forward.set(Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
            console.log('forward fallback to yaw-based', forward);
        }
        // 记录供 HUD/调试使用
        this.lastDirLength = forward.length();

        // 获取右侧方向（forward x up），修正符号并保证水平分量
        const right = new THREE.Vector3().crossVectors(forward, this.camera.up);
        right.y = 0;
        if (right.lengthSq() > 1e-6) right.normalize(); else right.set(1, 0, 0);

        // 根据按键更新速度（修正方向符号）
        // 前向用于视觉前进，但当前 forward 是相机朝向（camera looks toward forward)，为兼容坐标系取反以获得直觉上的前进效果
        const moveForwardVec = forward.clone().negate();
        if (this.moveForward) this.velocity.add(moveForwardVec); // W 前进
        if (this.moveBackward) this.velocity.sub(moveForwardVec); // S 后退
        // 修正左右按键的符号：A 应当向左移动（减去 right），D 向右（加上 right）
        if (this.moveLeft) this.velocity.sub(right); // A 左
        if (this.moveRight) this.velocity.add(right); // D 右
        if (this.moveUp) this.velocity.y += 1;
        if (this.moveDown) this.velocity.y -= 1;

        // 应用速度（先计算下一位置，可以在边界外平滑回弹或直接夹持）
        if (this.velocity.lengthSq() > 0) {
            this.velocity.normalize().multiplyScalar(this.movementSpeed * deltaTime);
            const nextPos = this.camera.position.clone().add(this.velocity);
            if (boundsEnabled) {
                const clamped = clampToBounds(nextPos);
                const outside = !nextPos.equals(clamped);
                (this as any).isAtBounds = outside;
                if (!outside) {
                    // 正常移动，直接应用
                    this.camera.position.copy(nextPos);
                } else {
                    // 平滑回弹：使用指数衰减插值 (lerp factor derived from reboundSpeed)
                    const reboundSpeed = 8.0; // 每秒收敛速率，可调整
                    const t = 1 - Math.exp(-reboundSpeed * deltaTime);
                    this.camera.position.lerp(clamped, t);
                    // 在命中边界的轴上抑制速度，避免持续推进边界
                    if (Math.abs(nextPos.x - clamped.x) > 1e-6) this.velocity.x = 0;
                    if (Math.abs(nextPos.y - clamped.y) > 1e-6) this.velocity.y = 0;
                    if (Math.abs(nextPos.z - clamped.z) > 1e-6) this.velocity.z = 0;
                    // 对剩余速度施加阻尼
                    this.velocity.multiplyScalar(0.5);
                }
            } else {
                (this as any).isAtBounds = false;
                this.camera.position.copy(nextPos);
            }
        } else {
            // 无主动移动时，若相机意外处于 bounds 之外，执行缓慢纠正
            if (boundsEnabled) {
                const clampedIdle = clampToBounds(this.camera.position);
                if (!this.camera.position.equals(clampedIdle)) {
                    (this as any).isAtBounds = true;
                    const idleReboundSpeed = 4.0; // 空闲时更慢的纠正速度
                    const t2 = 1 - Math.exp(-idleReboundSpeed * deltaTime);
                    this.camera.position.lerp(clampedIdle, t2);
                }
            }
        }
    }
}

// 创建控制器
const firstPersonController = new FirstPersonController(threeCamera);

// 加载模型
async function main() {
    const url = "room.splat";
    
    console.log("开始加载3DGS模型...");
    
    // 使用加载回调
    await (SPLAT.Loader as any).LoadAsync(url, scene, () => {
        console.log("✅ 3DGS模型加载完成！");
        
        // 设置初始视角
        threeCamera.position.set(0, -2, -1); // 从斜上方观察
        threeCamera.lookAt(0, 1.6, 0);
        
        hud.innerHTML = `
            <div>✅ 3DGS模型加载完成！</div>
            <div>第一人称模式</div>
            <div>左键拖拽: 环视</div>
            <div>W/A/S/D: 前后左右移动</div>
            <div>点击画布: 可进入鼠标锁定</div>
        `;
        
        // 记录模型边界（如果有）并打印摄像机属性以便诊断
        setTimeout(() => {
            console.log("场景内容:", scene);
            if ((scene as any).children) {
                console.log("子对象数量:", (scene as any).children.length);
            }
            // 调试：输出 three.js 相机与 SPLAT 相机的关键属性
            console.log('threeCamera (initial)', {
                position: threeCamera.position.clone(),
                quaternion: threeCamera.quaternion.clone(),
                rotation: threeCamera.rotation.clone()
            });
            try {
                console.log('splat camera keys', Object.keys(camera as any));
                console.log('splat camera (initial)', {
                    position: (camera as any).position,
                    quaternion: (camera as any).quaternion,
                    rotation: (camera as any).rotation
                });
            } catch (err) {}
        }, 1000);
    });
    
    // 渲染循环
    const clock = new THREE.Clock();
    
    const frame = () => {
        const deltaTime = clock.getDelta();
        
        firstPersonController.update(deltaTime);
        
        // 同步相机位置到 SPLAT 相机
        if (camera.position) {
            camera.position.x = threeCamera.position.x;
            camera.position.y = threeCamera.position.y;
            camera.position.z = threeCamera.position.z;
        }
        // 保证 three 相机的矩阵是最新的，然后同步朝向到 SPLAT 相机（保证渲染使用的是当前视角）
        try { threeCamera.updateMatrixWorld(true); } catch (err) {}
        const dir = new THREE.Vector3();
        threeCamera.getWorldDirection(dir);
        // 如果 dir 太小（例如俯仰极端导致数值不稳定），使用从 quaternion 计算的前向向量作为 fallback
        if (dir.lengthSq() < 1e-6) {
            dir.set(0, 0, -1).applyQuaternion(threeCamera.quaternion);
            console.log('dir was tiny; used quaternion-based fallback', dir);
        }
        const lookTarget = new THREE.Vector3().copy(threeCamera.position).add(dir);
        if (typeof (camera as any).lookAt === 'function') {
            (camera as any).lookAt(lookTarget.x, lookTarget.y, lookTarget.z);
        }
        // 优先使用 gsplat 的 Quaternion 类型通过 camera.rotation 赋值（库在内部使用 Quaternion）
        try {
            const SplatQuaternion = (SPLAT as any).Quaternion;
            if (typeof SplatQuaternion === 'function') {
                const q = new SplatQuaternion(
                    threeCamera.quaternion.x,
                    threeCamera.quaternion.y,
                    threeCamera.quaternion.z,
                    threeCamera.quaternion.w
                );
                try {
                    (camera as any).rotation = q;
                    console.log('set SPLAT.rotation from threeCamera');
                } catch (err) {
                    console.warn('assigning SPLAT.rotation failed', err);
                }
            } else if ((camera as any).quaternion) {
                // 退回到直接复制组件（不推荐）
                (camera as any).quaternion.x = threeCamera.quaternion.x;
                (camera as any).quaternion.y = threeCamera.quaternion.y;
                (camera as any).quaternion.z = threeCamera.quaternion.z;
                (camera as any).quaternion.w = threeCamera.quaternion.w;
                console.log('sync SPLAT quaternion from threeCamera (fallback)');
            }
        } catch (err) {
            console.warn('splat quaternion sync failed', err);
        }

        // 额外尝试同步 target/forward 字段（如果库使用）
        if ((camera as any).target) {
            try {
                (camera as any).target.x = lookTarget.x;
                (camera as any).target.y = lookTarget.y;
                (camera as any).target.z = lookTarget.z;
                console.log('sync SPLAT target from threeCamera');
            } catch (err) {}
        } else if ((camera as any).forward) {
            try {
                (camera as any).forward.x = dir.x;
                (camera as any).forward.y = dir.y;
                (camera as any).forward.z = dir.z;
                console.log('sync SPLAT forward from threeCamera');
            } catch (err) {}
        }

        // 强制调用 camera.update() 以确保 CameraData 使用最新 position/rotation
        try {
            if (typeof (camera as any).update === 'function') {
                (camera as any).update();
                //console.log('called camera.update()');
            }
        } catch (err) {
            console.warn('camera.update() failed', err);
        }

        // DEBUG: 如果启用了强制矩阵同步，尝试把 three.js 的矩阵复制到 SPLAT.Camera 的可能字段上
        if (forceMatrixSync) {
            try {
                threeCamera.updateMatrixWorld(true);
                // world matrix
                if ((camera as any).matrixWorld) {
                    (camera as any).matrixWorld = { elements: threeCamera.matrixWorld.elements.slice(0) };
                    console.log('force sync matrixWorld to camera');
                }
                // view / inverse
                if ((camera as any).viewMatrix) {
                    // try to maintain same typed layout as source
                    const inv = (threeCamera as any).matrixWorldInverse.elements;
                    (camera as any).viewMatrix = { elements: inv.slice(0) };
                    console.log('force sync viewMatrix to camera');
                } else if ((camera as any).matrixWorldInverse) {
                    (camera as any).matrixWorldInverse = { elements: (threeCamera as any).matrixWorldInverse.elements.slice(0) };
                    console.log('force sync matrixWorldInverse to camera');
                }
                // flat arrays
                if ((camera as any).matrix && threeCamera.matrix) {
                    (camera as any).matrix = { elements: threeCamera.matrix.elements.slice(0) };
                    console.log('force sync matrix to camera');
                }
                // projection matrix and params
                if ((camera as any).projectionMatrix) {
                    (camera as any).projectionMatrix = { elements: threeCamera.projectionMatrix.elements.slice(0) };
                    console.log('force sync projectionMatrix to camera');
                }
                if ((camera as any).fov !== undefined) {
                    try { (camera as any).fov = (threeCamera as any).fov; console.log('force sync fov'); } catch (err) {}
                }
                if ((camera as any).aspect !== undefined) {
                    try { (camera as any).aspect = (threeCamera as any).aspect; console.log('force sync aspect'); } catch (err) {}
                }
                if ((camera as any).near !== undefined) {
                    try { (camera as any).near = (threeCamera as any).near; console.log('force sync near/far'); } catch (err) {}
                }
                if ((camera as any).far !== undefined) {
                    try { (camera as any).far = (threeCamera as any).far; console.log('force sync far'); } catch (err) {}
                }
            } catch (err) {
                console.warn('forceMatrixSync failed', err);
            }
        }
        
        // 更新 HUD 显示位置信息
        if (currentMode === 'first-person') {
            hud.innerHTML = `
                <div>✅ 3DGS模型加载完成！</div>
                <div>第一人称模式</div>
                <div>渲染相机: splat camera</div>
                <div>位置: (${threeCamera.position.x.toFixed(2)}, ${threeCamera.position.y.toFixed(2)}, ${threeCamera.position.z.toFixed(2)})</div>
                <div>角度: yaw ${typeof firstPersonController['yaw'] === 'number' ? (firstPersonController['yaw'] * 180 / Math.PI).toFixed(1) : '-'}°, pitch ${typeof firstPersonController['pitch'] === 'number' ? (firstPersonController['pitch'] * 180 / Math.PI).toFixed(1) : '-'}°</div>
                <div>pitch 被 clamp: ${firstPersonController.lastPitchClamped}</div>
                <div>前向长度 (hor): ${firstPersonController.lastDirLength.toFixed(2)}</div>
                <div>移动速度: ${(firstPersonController.lastSpeedFactor * 100).toFixed(0)}%</div>
                <div>边界 (B 开关): ${boundsEnabled}  min:(${worldBounds.min.x.toFixed(1)},${worldBounds.min.y.toFixed(1)},${worldBounds.min.z.toFixed(1)}) max:(${worldBounds.max.x.toFixed(1)},${worldBounds.max.y.toFixed(1)},${worldBounds.max.z.toFixed(1)})</div>
                <div>强制矩阵同步 (M): ${forceMatrixSync}</div>
                <div>W/A/S/D: 前后左右移动</div>
                <div>Q/E: 上下移动</div>
                <div>ESC: 退出鼠标锁定</div>
                <div>按 M 强制矩阵同步；按 L 打印相机字段；按 U 测试 up 方向</div>
            `;
        }
        
        // 使用 SPLAT 相机进行渲染（移除 threeCamera 调试分支）
        renderer.render(scene, camera);
        requestAnimationFrame(frame);
    };
    
    requestAnimationFrame(frame);
}

// 启动
main();

// 响应窗口大小变化
window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    threeCamera.aspect = window.innerWidth / window.innerHeight;
    threeCamera.updateProjectionMatrix();
});

// 防止方向键滚动页面
window.addEventListener('keydown', (e) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
    }
}, false);