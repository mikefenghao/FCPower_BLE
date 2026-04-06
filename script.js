
// 蓝牙设备管理器
class BLEManager {
    constructor() {
        this.device = null;
        this.server = null;
        this.connected = false;
        this.characteristic = null;
        this.deviceList = [];
        this.selectedDevice = null;
        this.scanTimer = null;

        // 初始化事件监听
        this.initEventListeners();
    }

    initEventListeners() {
        // 扫描按钮
        document.getElementById('scan-btn').addEventListener('click', () => this.scanDevices());

        // 连接按钮
        document.getElementById('connect-btn').addEventListener('click', () => this.connectDevice());

        // 断开按钮
        document.getElementById('disconnect-btn').addEventListener('click', () => this.disconnectDevice());

        // 设备选择下拉框
        const deviceSelect = document.getElementById('device-select');
        deviceSelect.addEventListener('change', (e) => this.handleDeviceSelect(e));
    }

    async scanDevices() {
        try {
            // 检查浏览器是否支持Web Bluetooth API
            if (!navigator.bluetooth) {
                alert('您的浏览器不支持Web Bluetooth API，请使用Chrome或Edge浏览器。');
                return;
            }

            // 显示扫描中状态
            const scanBtn = document.getElementById('scan-btn');
            scanBtn.disabled = true;
            scanBtn.innerHTML = '<ion-icon name="refresh-outline"></ion-icon> 扫描中...';

            // 请求蓝牙设备
            const devices = await navigator.bluetooth.getDevices();

            // 清空设备列表
            this.deviceList = [];
            const deviceSelect = document.getElementById('device-select');
            deviceSelect.innerHTML = '<option value="">未选择设备...</option>';

            // 过滤包含"JDY"或"FCPower"的设备
            devices.forEach(device => {
                const deviceName = device.name || '';
                if (deviceName.includes('JDY') || deviceName.includes('FCPower')) {
                    this.deviceList.push(device);
                    const option = document.createElement('option');
                    option.value = device.id;
                    option.textContent = `${deviceName} (${device.id})`;
                    deviceSelect.appendChild(option);
                }
            });

            // 如果没有找到设备，尝试扫描新设备
            if (this.deviceList.length === 0) {
                try {
                    const newDevice = await navigator.bluetooth.requestDevice({
                        filters: [
                            { namePrefix: 'JDY' },
                            { namePrefix: 'FCPower' }
                        ],
                        optionalServices: ['battery_service', 'device_information']
                    });

                    // 添加到设备列表
                    this.deviceList.push(newDevice);
                    const option = document.createElement('option');
                    option.value = newDevice.id;
                    option.textContent = `${newDevice.name} (${newDevice.id})`;
                    deviceSelect.appendChild(option);

                    // 自动选择新发现的设备
                    deviceSelect.value = newDevice.id;
                    this.selectedDevice = newDevice;
                } catch (error) {
                    console.error('扫描设备失败:', error);
                    alert('未找到包含"JDY"或"FCPower"的设备，请确保设备已开启蓝牙并在附近。');
                }
            }

            // 恢复扫描按钮状态
            scanBtn.disabled = false;
            scanBtn.innerHTML = '<ion-icon name="search-outline"></ion-icon> 扫描';

        } catch (error) {
            console.error('扫描蓝牙设备出错:', error);
            alert('扫描蓝牙设备出错: ' + error.message);

            // 恢复扫描按钮状态
            const scanBtn = document.getElementById('scan-btn');
            scanBtn.disabled = false;
            scanBtn.innerHTML = '<ion-icon name="search-outline"></ion-icon> 扫描';
        }
    }

    handleDeviceSelect(event) {
        const deviceId = event.target.value;
        if (deviceId) {
            this.selectedDevice = this.deviceList.find(device => device.id === deviceId);
        } else {
            this.selectedDevice = null;
        }
    }

    async connectDevice() {
        if (!this.selectedDevice) {
            alert('请先选择一个设备');
            return;
        }

        try {
            // 如果设备已连接，先断开
            if (this.connected && this.device) {
                await this.disconnectDevice();
            }

            // 连接设备
            this.server = await this.selectedDevice.gatt.connect();
            this.device = this.selectedDevice;
            this.connected = true;

            // 更新UI状态
            this.updateConnectionStatus(true);

            // 尝试获取服务和特征值
            try {
                const service = await this.server.getPrimaryService('battery_service');
                this.characteristic = await service.getCharacteristic('battery_level');

                // 订阅通知
                await this.characteristic.startNotifications();
                this.characteristic.addEventListener('characteristicvaluechanged', (event) => {
                    this.handleNotification(event);
                });
            } catch (error) {
                console.log('获取服务或特征值失败，可能设备不支持标准服务:', error);
            }

            alert('设备连接成功！');

        } catch (error) {
            console.error('连接设备失败:', error);
            alert('连接设备失败: ' + error.message);
            this.updateConnectionStatus(false);
        }
    }

    async disconnectDevice() {
        if (!this.device || !this.connected) {
            return;
        }

        try {
            // 如果有特征值，停止通知
            if (this.characteristic) {
                await this.characteristic.stopNotifications();
                this.characteristic.removeEventListener('characteristicvaluechanged', this.handleNotification);
            }

            // 断开GATT连接
            if (this.device.gatt.connected) {
                this.device.gatt.disconnect();
            }

            // 重置状态
            this.connected = false;
            this.device = null;
            this.server = null;
            this.characteristic = null;

            // 更新UI状态
            this.updateConnectionStatus(false);

            alert('设备已断开连接！');

        } catch (error) {
            console.error('断开设备连接失败:', error);
            alert('断开设备连接失败: ' + error.message);
        }
    }

    updateConnectionStatus(connected) {
        const statusItem = document.getElementById('stat-ble');
        const statusText = statusItem.querySelector('.stat-text');

        if (connected) {
            statusItem.classList.add('active-ble');
            statusText.textContent = '已连接';
        } else {
            statusItem.classList.remove('active-ble');
            statusText.textContent = '未连接';
        }
    }

    handleNotification(event) {
        const value = event.target.value;
        // 这里处理设备发送的数据
        console.log('收到数据:', value);
        // 根据实际协议解析数据并更新UI
    }

    // 发送数据到设备
    async sendData(data) {
        if (!this.connected || !this.characteristic) {
            alert('设备未连接，无法发送数据');
            return false;
        }

        try {
            await this.characteristic.writeValue(data);
            return true;
        } catch (error) {
            console.error('发送数据失败:', error);
            alert('发送数据失败: ' + error.message);
            return false;
        }
    }
}

// 初始化蓝牙管理器
const bleManager = new BLEManager();

// 页面加载完成后检查是否有已连接的设备
window.addEventListener('load', async () => {
    try {
        const devices = await navigator.bluetooth.getDevices();
        devices.forEach(device => {
            if (device.gatt.connected) {
                bleManager.device = device;
                bleManager.server = device.gatt;
                bleManager.connected = true;
                bleManager.selectedDevice = device;
                bleManager.updateConnectionStatus(true);

                // 更新设备选择下拉框
                const deviceSelect = document.getElementById('device-select');
                deviceSelect.innerHTML = '<option value="">未选择设备...</option>';
                const option = document.createElement('option');
                option.value = device.id;
                option.textContent = `${device.name} (${device.id})`;
                option.selected = true;
                deviceSelect.appendChild(option);
            }
        });
    } catch (error) {
        console.error('检查已连接设备失败:', error);
    }
});
