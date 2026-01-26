import * as SPLAT from "gsplat";
import * as THREE from "three";
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

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

if (typeof camera.lookAt !== 'function') {
    camera.lookAt = function(_x: any, _y?: any, _z?: any) {};
}

// 设置画布大小
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.canvas);

// 创建 OrbitControls（用于外部观察）
const controls = new OrbitControls(threeCamera, renderer.canvas);
controls.enabled = true; // 默认启用轨道控制
controls.minDistance = 0.1;
controls.maxDistance = 100;
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// 创建 HUD 界面
const createHUD = () => {
  const hud = document.createElement('div');
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

// 模式切换
let currentMode: 'orbit' | 'first-person' = 'orbit';

function createModeToggleButton() {
    const button = document.createElement('button');
    button.style.position = 'absolute';
    button.style.bottom = '20px';
    button.style.right = '20px';
    button.style.padding = '10px 20px';
    button.style.background = 'linear-gradient(to bottom, #4a6fa5, #2c4d70)';
    button.style.color = 'white';
    button.style.border = 'none';
    button.style.borderRadius = '5px';
    button.style.cursor = 'pointer';
    button.textContent = '切换到第一人称';
    
    button.onclick = () => {
        if (currentMode === 'orbit') {
            currentMode = 'first-person';
            button.textContent = '切换到轨道控制';
            controls.enabled = false;
            hud.innerHTML = `
                <div>✅ 3DGS模型加载完成！</div>
                <div>第一人称模式</div>
                <div>点击屏幕锁定鼠标</div>
                <div>W/A/S/D: 前后左右移动</div>
                <div>移动鼠标: 环视</div>
                <div>ESC: 退出鼠标锁定</div>
            `;
            
            // 进入第一人称视角
            threeCamera.position.set(0, 1.7, 2); // 人眼高度，稍微后退
            threeCamera.lookAt(0, 1.7, 1);
            
        } else {
            currentMode = 'orbit';
            button.textContent = '切换到第一人称';
            controls.enabled = true;
            hud.innerHTML = `
                <div>✅ 3DGS模型加载完成！</div>
                <div>轨道控制模式</div>
                <div>鼠标拖拽: 旋转视图</div>
                <div>滚轮: 缩放</div>
                <div>右键拖拽: 平移</div>
            `;
        }
    };
    
    document.body.appendChild(button);
    return button;
}

// 第一人称控制器
class FirstPersonController {
    private camera: THREE.PerspectiveCamera;
    private velocity: THREE.Vector3;
    private movementSpeed: number = 3.0;
    private mouseSensitivity: number = 0.002;
    private yaw: number = 0;
    private pitch: number = 0;
    private isMouseLocked: boolean = false;
    
    // 移动状态
    private moveForward: boolean = false;
    private moveBackward: boolean = false;
    private moveLeft: boolean = false;
    private moveRight: boolean = false;
    private moveUp: boolean = false;
    private moveDown: boolean = false;
    
    constructor(camera: THREE.PerspectiveCamera) {
        this.camera = camera;
        this.velocity = new THREE.Vector3();
        this.setupEventListeners();
    }
    
    private setupEventListeners() {
        // 鼠标锁定
        renderer.canvas.addEventListener('click', () => {
            if (currentMode === 'first-person' && !this.isMouseLocked) {
                renderer.canvas.requestPointerLock();
            }
        });
        
        // 指针锁定状态变化
        document.addEventListener('pointerlockchange', () => {
            this.isMouseLocked = document.pointerLockElement === renderer.canvas;
            renderer.canvas.style.cursor = this.isMouseLocked ? 'none' : 'crosshair';
        });
        
        // 鼠标移动
        document.addEventListener('mousemove', (event) => {
            if (!this.isMouseLocked || currentMode !== 'first-person') return;
            
            const movementX = event.movementX || 0;
            const movementY = event.movementY || 0;
            
            this.yaw -= movementX * this.mouseSensitivity;
            this.pitch -= movementY * this.mouseSensitivity;
            
            // 限制俯仰角
            this.pitch = Math.max(-Math.PI/2, Math.min(Math.PI/2, this.pitch));
            
            // 使用四元数进行旋转（更稳定）
            const quaternion = new THREE.Quaternion();
            quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
            this.camera.quaternion.copy(quaternion);
        });
        
        // 键盘控制
        document.addEventListener('keydown', (event) => {
            if (!this.isMouseLocked || currentMode !== 'first-person') return;
            
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
            if (currentMode !== 'first-person') return;
            
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
        if (!this.isMouseLocked || currentMode !== 'first-person') return;
        
        this.velocity.set(0, 0, 0);
        
        // 获取前进方向（水平面）
        const forward = new THREE.Vector3();
        this.camera.getWorldDirection(forward);
        forward.y = 0;
        if (forward.length() > 0) {
            forward.normalize();
        }
        
        // 获取右侧方向
        const right = new THREE.Vector3();
        right.crossVectors(this.camera.up, forward).normalize();
        
        // 根据按键更新速度
        if (this.moveForward) this.velocity.add(forward);
        if (this.moveBackward) this.velocity.sub(forward);
        if (this.moveLeft) this.velocity.add(right);
        if (this.moveRight) this.velocity.sub(right);
        if (this.moveUp) this.velocity.y += 1;
        if (this.moveDown) this.velocity.y -= 1;
        
        // 应用速度
        if (this.velocity.lengthSq() > 0) {
            this.velocity.normalize().multiplyScalar(this.movementSpeed * deltaTime);
            this.camera.position.add(this.velocity);
        }
    }
}

// 创建控制器
const firstPersonController = new FirstPersonController(threeCamera);

// 加载模型
async function main() {
    const url = "/div2.splat";
    
    console.log("开始加载3DGS模型...");
    
    // 使用加载回调
    await (SPLAT.Loader as any).LoadAsync(url, scene, () => {
        console.log("✅ 3DGS模型加载完成！");
        
        // 设置初始视角
        threeCamera.position.set(0, 2, 5); // 从斜上方观察
        threeCamera.lookAt(0, 0, 0);
        
        hud.innerHTML = `
            <div>✅ 3DGS模型加载完成！</div>
            <div>轨道控制模式</div>
            <div>鼠标拖拽: 旋转视图</div>
            <div>滚轮: 缩放</div>
            <div>右键拖拽: 平移</div>
        `;
        
        // 创建模式切换按钮
        createModeToggleButton();
        
        // 记录模型边界（如果有）
        setTimeout(() => {
            console.log("场景内容:", scene);
            if ((scene as any).children) {
                console.log("子对象数量:", (scene as any).children.length);
            }
        }, 1000);
    });
    
    // 渲染循环
    const clock = new THREE.Clock();
    
    const frame = () => {
        const deltaTime = clock.getDelta();
        
        if (currentMode === 'orbit') {
            controls.update();
        } else {
            firstPersonController.update(deltaTime);
        }
        
        // 同步相机位置到 SPLAT 相机
        if (camera.position) {
            camera.position.x = threeCamera.position.x;
            camera.position.y = threeCamera.position.y;
            camera.position.z = threeCamera.position.z;
        }
        
        // 更新 HUD 显示位置信息
        if (currentMode === 'first-person') {
            hud.innerHTML = `
                <div>✅ 3DGS模型加载完成！</div>
                <div>第一人称模式</div>
                <div>位置: (${threeCamera.position.x.toFixed(2)}, ${threeCamera.position.y.toFixed(2)}, ${threeCamera.position.z.toFixed(2)})</div>
                <div>W/A/S/D: 前后左右移动</div>
                <div>Q/E: 上下移动</div>
                <div>ESC: 退出鼠标锁定</div>
            `;
        }
        
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