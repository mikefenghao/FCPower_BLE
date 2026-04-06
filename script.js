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

        // 蓝牙服务UUID和特征UUID
        this.SERVICE_UUID = '0000ffe0-0000-1000-8000-00805f9b34fb';
        this.CHARACTERISTIC_UUID = '0000ffe1-0000-1000-8000-00805f9b34fb';

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
                optionalServices: [this.SERVICE_UUID] // 使用正确的服务UUID
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

            // 先断开之前的连接（如果有）
            if (this.selectedDevice.gatt.connected) {
                this.selectedDevice.gatt.disconnect();
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            // 连接设备
            this.server = await this.selectedDevice.gatt.connect();
            console.log('GATT服务器已连接');

            // 添加断开连接监听（使用device对象）
            this.selectedDevice.addEventListener('gattserverdisconnected', () => {
                console.log('设备已断开连接');
                this.connected = false;
                this.updateConnectionStatus(false);
            });

            // 获取服务
            console.log('正在获取服务:', this.SERVICE_UUID);
            const service = await this.server.getPrimaryService(this.SERVICE_UUID);
            console.log('服务获取成功');

            // 获取特征值
            console.log('正在获取特征值:', this.CHARACTERISTIC_UUID);
            this.characteristic = await service.getCharacteristic(this.CHARACTERISTIC_UUID);
            console.log('特征值获取成功');

            // 启用通知
            await this.characteristic.startNotifications();
            console.log('通知已启用');

            this.characteristic.addEventListener('characteristicvaluechanged', (event) => {
                this.handleCharacteristicValueChanged(event);
            });

            this.connected = true;
            this.updateConnectionStatus(true);
            alert('连接成功！');
        } catch (error) {
            console.error('连接失败:', error);
            this.connected = false;
            this.updateConnectionStatus(false);
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

    // 处理特征值变化（接收数据）
    handleCharacteristicValueChanged(event) {
        const value = event.target.value;
        const decoder = new TextDecoder('utf-8');
        const text = decoder.decode(value);
        console.log('收到数据:', text);

        // 解析功率数据
        const powerData = this.parsePowerData(text);
        if (powerData) {
            console.log('解析后的数据:', powerData);
            // 更新UI显示
            this.updatePowerDisplay(powerData);
        }
    }

    // 解析功率数据字符串
    parsePowerData(text) {
        const data = {};
        // 使用正则表达式匹配所有键值对
        const regex = /power_(\w+)=(\d+\.?\d*)([VAWmAH]?)/g;
        let match;

        while ((match = regex.exec(text)) !== null) {
            const key = match[1]; // 如 vout, iout, pout等
            const value = parseFloat(match[2]); // 数值部分
            const unit = match[3]; // 单位部分

            data[key] = {
                value: value,
                unit: unit
            };
        }

        return Object.keys(data).length > 0 ? data : null;
    }

    // 更新功率显示
    updatePowerDisplay(powerData) {
        // 只显示指定的参数：输出电压、输出电流、输出功率、输入电压、输入电流、毫安时

        // 更新输出电压 (power_vout)
        if (powerData.vout) {
            const element = document.getElementById('out-v');
            if (element) {
                element.innerHTML = `${powerData.vout.value.toFixed(3)}<small>${powerData.vout.unit}</small>`;
            }
        }

        // 更新输出电流 (power_iout)
        if (powerData.iout) {
            const element = document.getElementById('out-i');
            if (element) {
                element.innerHTML = `${powerData.iout.value.toFixed(3)}<small>${powerData.iout.unit}</small>`;
            }
        }

        // 更新输出功率 (power_pout)
        if (powerData.pout) {
            const element = document.getElementById('out-p');
            if (element) {
                element.innerHTML = `${powerData.pout.value.toFixed(3)}<small>${powerData.pout.unit}</small>`;
            }
        }

        // 更新输入电压 (power_vin)
        if (powerData.vin) {
            const element = document.getElementById('in-v');
            if (element) {
                element.innerHTML = `${powerData.vin.value.toFixed(3)}<small>${powerData.vin.unit}</small>`;
            }
        }

        // 更新输入电流 (power_iin)
        if (powerData.iin) {
            const element = document.getElementById('in-i');
            if (element) {
                element.innerHTML = `${powerData.iin.value.toFixed(3)}<small>${powerData.iin.unit}</small>`;
            }
        }

        // 更新毫安时 (power_mAH)
        if (powerData.mAH) {
            const element = document.getElementById('in-mah');
            if (element) {
                element.innerHTML = `${powerData.mAH.value.toFixed(2)}<small>${powerData.mAH.unit}</small>`;
            }
        }
    }

    // 发送数据到设备
    async sendData(data) {
        if (!this.connected || !this.characteristic) {
            alert('设备未连接');
            return false;
        }

        try {
            const encoder = new TextEncoder();
            const value = encoder.encode(data);
            await this.characteristic.writeValue(value);
            console.log('发送数据:', data);
            return true;
        } catch (error) {
            console.error('发送数据失败:', error);
            alert('发送数据失败: ' + error.message);
            return false;
        }
    }

    // 读取数据
    async readData() {
        if (!this.connected || !this.characteristic) {
            alert('设备未连接');
            return null;
        }

        try {
            const value = await this.characteristic.readValue();
            const decoder = new TextDecoder('utf-8');
            const text = decoder.decode(value);
            console.log('读取数据:', text);
            return text;
        } catch (error) {
            console.error('读取数据失败:', error);
            alert('读取数据失败: ' + error.message);
            return null;
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