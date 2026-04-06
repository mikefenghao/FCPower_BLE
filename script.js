/**
 * FCPower-120 Pro 蓝牙设备管理器
 * 修复版 - 解决语法错误及初始化失效问题
 */

class BLEManager {
    constructor() {
        this.device = null;
        this.server = null;
        this.connected = false;
        this.characteristic = null;
        this.deviceList = [];
        this.selectedDevice = null;
        this.scanTimer = null;

        // 立即初始化事件监听
        this.initEventListeners();
    }

    initEventListeners() {
        const scanBtn = document.getElementById('scan-btn');
        const connectBtn = document.getElementById('connect-btn');
        const disconnectBtn = document.getElementById('disconnect-btn');
        const deviceSelect = document.getElementById('device-select');

        if (scanBtn) scanBtn.addEventListener('click', () => this.scanDevices());
        if (connectBtn) connectBtn.addEventListener('click', () => this.connectDevice());
        if (disconnectBtn) disconnectBtn.addEventListener('click', () => this.disconnectDevice());
        if (deviceSelect) deviceSelect.addEventListener('change', (e) => this.handleDeviceSelect(e));
        
        console.log('DOM事件监听器已绑定');
    }

    async scanDevices() {
        console.log('开始执行扫描逻辑...');
        try {
            if (!navigator.bluetooth) {
                alert('您的浏览器不支持 Web Bluetooth API，请使用 Chrome 或 Edge 浏览器，并确保使用 HTTPS 访问。');
                return;
            }

            const scanBtn = document.getElementById('scan-btn');
            scanBtn.disabled = true;
            scanBtn.innerHTML = '<ion-icon name="refresh-outline"></ion-icon> 扫描中...';

            // 请求蓝牙设备 - 过滤包含 FC 或 JDY 的设备
            // 注意：Web Bluetooth 必须由用户手势（如点击）触发
            const device = await navigator.bluetooth.requestDevice({
                filters: [
                    { namePrefix: 'FC' },
                    { namePrefix: 'JDY' }
                ],
                optionalServices: ['battery_service', 'device_information', 0xFFE0] // 根据你的硬件修改UUID
            });

            console.log('找到设备:', device.name);
            
            this.deviceList = [device];
            this.selectedDevice = device;

            // 更新下拉框
            const deviceSelect = document.getElementById('device-select');
            deviceSelect.innerHTML = '';
            const option = document.createElement('option');
            option.value = device.id;
            option.textContent = `${device.name || '未知设备'} (${device.id})`;
            deviceSelect.appendChild(option);
            
            alert('已选择设备: ' + (device.name || '未命名'));

        } catch (error) {
            console.error('扫描失败:', error);
            if (error.name !== 'NotFoundError') {
                alert('扫描出错: ' + error.message);
            }
        } finally {
            const scanBtn = document.getElementById('scan-btn');
            scanBtn.disabled = false;
            scanBtn.innerHTML = '<ion-icon name="search-outline"></ion-icon> 扫描';
        }
    }

    handleDeviceSelect(event) {
        const deviceId = event.target.value;
        this.selectedDevice = this.deviceList.find(d => d.id === deviceId);
    }

    async connectDevice() {
        if (!this.selectedDevice) {
            alert('请先点击扫描并选择设备');
            return;
        }

        try {
            console.log('正在连接 GATT 服务...');
            this.server = await this.selectedDevice.gatt.connect();
            this.connected = true;
            this.updateConnectionStatus(true);
            alert('连接成功！');
        } catch (error) {
            console.error('连接失败:', error);
            alert('连接失败: ' + error.message);
        }
    }

    async disconnectDevice() {
        if (this.selectedDevice && this.selectedDevice.gatt.connected) {
            this.selectedDevice.gatt.disconnect();
        }
        this.connected = false;
        this.updateConnectionStatus(false);
        alert('已断开');
    }

    updateConnectionStatus(connected) {
        const statusItem = document.getElementById('stat-ble');
        const statusText = statusItem.querySelector('.stat-text');
        if (connected) {
            statusItem.style.color = '#00e5ff';
            statusText.textContent = '已连接';
        } else {
            statusItem.style.color = '';
            statusText.textContent = '未连接';
        }
    }
}

// --- 初始化逻辑：确保彻底解决报错 ---
let bleManager;

const startApp = () => {
    try {
        if (!bleManager) {
            bleManager = new BLEManager();
            // 挂载到全局，方便你在控制台输入 bleManager 调试
            window.bleManager = bleManager; 
            console.log('FCPower 蓝牙管理器已就绪');
        }
    } catch (e) {
        console.error('启动失败:', e);
    }
};

// 确保 DOM 加载后再运行，双重保险
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    startApp();
} else {
    document.addEventListener('DOMContentLoaded', startApp);
}