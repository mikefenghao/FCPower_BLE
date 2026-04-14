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
        this.dataBuffer = ''; // 添加数据缓冲区

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
        const ccModeBtn = document.getElementById('cc-mode-btn');
        const ocpModeBtn = document.getElementById('ocp-mode-btn');

        if (scanBtn) scanBtn.addEventListener('click', () => this.scanDevices());
        if (connectBtn) connectBtn.addEventListener('click', () => this.connectDevice());
        if (disconnectBtn) disconnectBtn.addEventListener('click', () => this.disconnectDevice());
        if (deviceSelect) deviceSelect.addEventListener('change', (e) => this.handleDeviceSelect(e));
        if (ccModeBtn) ccModeBtn.addEventListener('click', () => this.switchToCCMode());
        if (ocpModeBtn) ocpModeBtn.addEventListener('click', () => this.switchToOCPMode());
        
        // 添加输出按钮事件监听
        const onBtn = document.getElementById('on-btn');
        const offBtn = document.getElementById('off-btn');
        if (onBtn) onBtn.addEventListener('click', () => this.toggleOutput());
        if (offBtn) offBtn.addEventListener('click', () => this.toggleOutput());
        
        // 添加获取参数按钮事件监听
        const getParamsBtn = document.getElementById('get-params-btn');
        if (getParamsBtn) getParamsBtn.addEventListener('click', () => this.getSystemParams());
        
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

            // 请求蓝牙设备 - 过滤以 FC 或 JDY 开头的设备
            // 注意：Web Bluetooth 必须由用户手势（如点击）触发
            // 使用filters选项来在扫描时就过滤设备
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
            
            // 移除alert，提高用户体验
            console.log('已选择设备: ' + (device.name || '未命名'));

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

        let retries = 3;
        while (retries > 0) {
            try {
                console.log('正在连接 GATT 服务... (尝试 ' + (4 - retries) + '/3)');

                // 先断开之前的连接（如果有）
                if (this.selectedDevice.gatt && this.selectedDevice.gatt.connected) {
                    console.log('检测到已连接，先断开...');
                    this.selectedDevice.gatt.disconnect();
                    // 增加等待时间，确保连接完全断开
                    await new Promise(resolve => setTimeout(resolve, 500));
                }

                // 连接设备 - 添加超时处理
                const connectPromise = this.selectedDevice.gatt.connect();
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('连接超时')), 15000)
                );
                this.server = await Promise.race([connectPromise, timeoutPromise]);
                console.log('GATT服务器已连接');

                // 等待一小段时间，确保连接稳定
                await new Promise(resolve => setTimeout(resolve, 500));

                // 清除之前的事件监听器
                this.selectedDevice.removeEventListener('gattserverdisconnected', this.handleDisconnect);
                // 使用箭头函数避免bind，提高性能
                this.selectedDevice.addEventListener('gattserverdisconnected', () => this.handleDisconnect());

                // 获取服务 - 添加超时处理
                const servicePromise = this.server.getPrimaryService(this.SERVICE_UUID);
                const serviceTimeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('获取服务超时')), 8000)
                );
                const service = await Promise.race([servicePromise, serviceTimeoutPromise]);
                console.log('服务获取成功');

                // 获取特征值 - 添加超时处理
                const characteristicPromise = service.getCharacteristic(this.CHARACTERISTIC_UUID);
                const characteristicTimeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('获取特征值超时')), 8000)
                );
                this.characteristic = await Promise.race([characteristicPromise, characteristicTimeoutPromise]);
                console.log('特征值获取成功');

                // 启用通知 - 添加超时处理
                const notificationPromise = this.characteristic.startNotifications();
                const notificationTimeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('启用通知超时')), 8000)
                );
                await Promise.race([notificationPromise, notificationTimeoutPromise]);
                console.log('通知已启用');

                // 清除之前的事件监听器
                this.characteristic.removeEventListener('characteristicvaluechanged', this.handleData);
                // 使用箭头函数避免bind，提高性能
                this.characteristic.addEventListener('characteristicvaluechanged', (event) => this.handleData(event));

                this.connected = true;
                this.updateConnectionStatus(true);
                alert('连接成功！');
                return; // 连接成功，退出循环
            } catch (error) {
                console.error('连接失败:', error);
                retries--;
                if (retries > 0) {
                    console.log('重试连接... (' + retries + ' 次尝试剩余)');
                    // 等待一段时间后重试
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } else {
                    this.connected = false;
                    this.updateConnectionStatus(false);
                    alert('连接失败: ' + error.message + '\n请尝试重新扫描设备后再连接');
                }
            }
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

    // 处理设备断开连接事件
    handleDisconnect() {
        console.log('设备已断开连接');
        this.connected = false;
        this.updateConnectionStatus(false);
    }

    // 处理接收数据事件
    handleData(event) {
        this.handleCharacteristicValueChanged(event);
    }

    // 处理特征值变化（接收数据）
    handleCharacteristicValueChanged(event) {
        const value = event.target.value;
        const decoder = new TextDecoder('utf-8');
        const text = decoder.decode(value);
        console.log('收到数据片段:', text);
        
        // 将新数据添加到缓冲区
        this.dataBuffer += text;
        
        // 检查缓冲区中是否有完整的数据包（以换行符结尾）
        const newlineIndex = this.dataBuffer.indexOf('\n');
        if (newlineIndex !== -1) {
            // 提取完整的数据包
            const completeData = this.dataBuffer.substring(0, newlineIndex);
            // 从缓冲区中移除已处理的数据
            this.dataBuffer = this.dataBuffer.substring(newlineIndex + 1);
            
            console.log('完整数据包:', completeData);
            console.log('数据是否包含power_cc:', completeData.includes('power_cc'));
            console.log('数据是否包含power_out_stat:', completeData.includes('power_out_stat'));
            
            // 解析功率数据
            const powerData = this.parsePowerData(completeData);
            if (powerData) {
                console.log('解析后的数据:', powerData);
                console.log('解析后的数据是否包含cc:', powerData.cc !== undefined);
                console.log('解析后的数据是否包含out_stat:', powerData.out_stat !== undefined);
                // 更新UI显示
                this.updatePowerDisplay(powerData);
            }
            
            // 解析系统参数数据
            const systemParams = this.parseSystemParams(completeData);
            if (systemParams) {
                console.log('解析后的系统参数:', systemParams);
                // 更新系统参数显示
                this.updateSystemParams(systemParams);
            }
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

        // 检查是否有cc模式值（恒流/过流）
        const ccMatch = /power_cc=([01])/.exec(text);
        if (ccMatch) {
            data['cc'] = {
                value: parseInt(ccMatch[1]),
                unit: ''
            };
            console.log('解析到cc模式值:', data['cc'].value);
        } else {
            console.log('未找到power_cc值');
        }

        // 检查是否有输出状态值
        const outStatMatch = /power_out_stat=([01])/.exec(text);
        if (outStatMatch) {
            data['out_stat'] = {
                value: parseInt(outStatMatch[1]),
                unit: ''
            };
            console.log('解析到输出状态值:', data['out_stat'].value);
        } else {
            console.log('未找到power_out_stat值');
        }

        // 检查是否有温度值
        const tempMatch = /power_temp=([\d.]+)/.exec(text);
        if (tempMatch) {
            data['temp'] = {
                value: parseFloat(tempMatch[1]),
                unit: '℃'
            };
            console.log('解析到温度值:', data['temp'].value);
        } else {
            console.log('未找到power_temp值');
        }

        return Object.keys(data).length > 0 ? data : null;
    }

    // 解析系统参数数据
    parseSystemParams(text) {
        const params = {};

        // 匹配MCU电压参考值
        const powerMcuRefMatch = /power_mcu_ref=([\d.]+)/.exec(text);
        if (powerMcuRefMatch) {
            params['power_mcu_ref'] = parseFloat(powerMcuRefMatch[1]);
            console.log('解析到MCU电压参考值:', params['power_mcu_ref']);
        }

        // 匹配MCU输出电压比例
        const ratioMcuVoutMatch = /RATIO_MCU_VOUT=([\d.]+)/.exec(text);
        if (ratioMcuVoutMatch) {
            params['RATIO_MCU_VOUT'] = parseFloat(ratioMcuVoutMatch[1]);
            console.log('解析到MCU输出电压比例:', params['RATIO_MCU_VOUT']);
        }

        // 匹配MCU输入电压比例
        const ratioMcuVinMatch = /RATIO_MCU_VIN=([\d.]+)/.exec(text);
        if (ratioMcuVinMatch) {
            params['RATIO_MCU_VIN'] = parseFloat(ratioMcuVinMatch[1]);
            console.log('解析到MCU输入电压比例:', params['RATIO_MCU_VIN']);
        }

        // 匹配MCU输出电流比例
        const ratioMcuIoutMatch = /RATIO_MCU_IOUT=([\d.]+)/.exec(text);
        if (ratioMcuIoutMatch) {
            params['RATIO_MCU_IOUT'] = parseFloat(ratioMcuIoutMatch[1]);
            console.log('解析到MCU输出电流比例:', params['RATIO_MCU_IOUT']);
        }

        // 匹配SC8815输出电压比例
        const ratioSc8815VoutMatch = /RATIO_SC8815_VOUT=([\d.]+)/.exec(text);
        if (ratioSc8815VoutMatch) {
            params['RATIO_SC8815_VOUT'] = parseFloat(ratioSc8815VoutMatch[1]);
            console.log('解析到SC8815输出电压比例:', params['RATIO_SC8815_VOUT']);
        }

        // 匹配SC8815输出电压比例（F）
        const ratioSc8815VoutFMatch = /RATIO_SC8815_VOUT_F=([\d.]+)/.exec(text);
        if (ratioSc8815VoutFMatch) {
            params['RATIO_SC8815_VOUT_F'] = parseFloat(ratioSc8815VoutFMatch[1]);
            console.log('解析到SC8815输出电压比例（F）:', params['RATIO_SC8815_VOUT_F']);
        }

        // 匹配SC8815输出电流比例
        const ratioSc8815IoutMatch = /RATIO_SC8815_IOUT=([\d.]+)/.exec(text);
        if (ratioSc8815IoutMatch) {
            params['RATIO_SC8815_IOUT'] = parseFloat(ratioSc8815IoutMatch[1]);
            console.log('解析到SC8815输出电流比例:', params['RATIO_SC8815_IOUT']);
        }

        // 匹配软件版本
        const softVMatch = /soft_v=([\d.]+)/.exec(text);
        if (softVMatch) {
            params['soft_v'] = softVMatch[1];
            console.log('解析到软件版本:', params['soft_v']);
        }

        // 匹配MCU温度
        const powerMcutempMatch = /power_mcutemp=([\d.]+)/.exec(text);
        if (powerMcutempMatch) {
            params['power_mcutemp'] = parseFloat(powerMcutempMatch[1]);
            console.log('解析到MCU温度:', params['power_mcutemp']);
        }

        return Object.keys(params).length > 0 ? params : null;
    }

    // 切换到恒流模式
    switchToCCMode() {
        // 更新按钮状态
        const ccModeBtn = document.getElementById('cc-mode-btn');
        const ocpModeBtn = document.getElementById('ocp-mode-btn');
        if (ccModeBtn && ocpModeBtn) {
            ccModeBtn.classList.add('active');
            ocpModeBtn.classList.remove('active');
        }
        // 发送切换到恒流模式的命令
        this.sendData('power_cc=0');
    }

    // 切换到过流模式
    switchToOCPMode() {
        // 更新按钮状态
        const ccModeBtn = document.getElementById('cc-mode-btn');
        const ocpModeBtn = document.getElementById('ocp-mode-btn');
        if (ccModeBtn && ocpModeBtn) {
            ocpModeBtn.classList.add('active');
            ccModeBtn.classList.remove('active');
        }
        // 发送切换到过流模式的命令
        this.sendData('power_cc=1');
    }

    // 切换输出状态
    toggleOutput() {
        const onBtn = document.getElementById('on-btn');
        const offBtn = document.getElementById('off-btn');
        if (!onBtn || !offBtn) return;
        
        // 检查当前按钮状态
        const isOn = onBtn.classList.contains('on');
        
        // 更新按钮状态
        if (isOn) {
            // 当前是打开状态，切换到关闭
            onBtn.classList.remove('on');
            onBtn.classList.add('off');
            offBtn.classList.remove('off');
            offBtn.classList.add('on');
            onBtn.textContent = '打开输出';
            offBtn.textContent = '关闭输出';
            // 发送关闭输出的命令
            this.sendData('power_out_stat=0');
        } else {
            // 当前是关闭状态，切换到打开
            onBtn.classList.remove('off');
            onBtn.classList.add('on');
            offBtn.classList.remove('on');
            offBtn.classList.add('off');
            onBtn.textContent = '打开输出';
            offBtn.textContent = '关闭输出';
            // 发送打开输出的命令
            this.sendData('power_out_stat=1');
        }
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

        // 更新温度 (power_temp)
        if (powerData.temp) {
            const element = document.getElementById('out-temp');
            if (element) {
                element.innerHTML = `${powerData.temp.value.toFixed(1)}<small>${powerData.temp.unit}</small>`;
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

        // 更新恒流/过流模式按钮状态
        if (powerData.cc !== undefined) {
            console.log('更新按钮状态, cc值:', powerData.cc.value);
            const ccModeBtn = document.getElementById('cc-mode-btn');
            const ocpModeBtn = document.getElementById('ocp-mode-btn');
            if (ccModeBtn && ocpModeBtn) {
                if (powerData.cc.value === 0) {
                    // 恒流模式
                    console.log('切换到恒流模式');
                    ccModeBtn.classList.add('active');
                    ocpModeBtn.classList.remove('active');
                } else if (powerData.cc.value === 1) {
                    // 过流模式
                    console.log('切换到过流模式');
                    ocpModeBtn.classList.add('active');
                    ccModeBtn.classList.remove('active');
                }
            } else {
                console.log('未找到模式按钮元素');
            }
        }

        // 更新输出状态
        if (powerData.out_stat !== undefined) {
            console.log('更新输出状态, out_stat值:', powerData.out_stat.value);
            const onBtn = document.getElementById('on-btn');
            const offBtn = document.getElementById('off-btn');
            const statOutput = document.getElementById('stat-out');
            const statOutputText = statOutput ? statOutput.querySelector('.stat-text') : null;
            if (onBtn && offBtn) {
                if (powerData.out_stat.value === 1) {
                    // 输出打开
                    console.log('输出已打开');
                    onBtn.classList.remove('off');
                    onBtn.classList.add('on');
                    offBtn.classList.remove('on');
                    offBtn.classList.add('off');
                } else {
                    // 输出关闭
                    console.log('输出已关闭');
                    onBtn.classList.remove('on');
                    onBtn.classList.add('off');
                    offBtn.classList.remove('off');
                    offBtn.classList.add('on');
                }
            }
            if (statOutput && statOutputText) {
                if (powerData.out_stat.value === 1) {
                    statOutput.style.color = '#00e5ff';
                    statOutputText.textContent = '已打开';
                } else {
                    statOutput.style.color = '';
                    statOutputText.textContent = '已关闭';
                }
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

    // 获取系统参数
    async getSystemParams() {
        if (!this.connected || !this.characteristic) {
            alert('设备未连接');
            return false;
        }

        try {
            // 发送获取参数命令
            await this.sendData('BLE_READ=1\r\n');
            console.log('已发送获取参数命令: BLE_READ=1\r\n');
            alert('已发送获取参数命令，请等待设备响应...');
            return true;
        } catch (error) {
            console.error('发送获取参数命令失败:', error);
            alert('发送获取参数命令失败: ' + error.message);
            return false;
        }
    }

    // 更新系统参数显示
    updateSystemParams(params) {
        // 更新MCU电压
        if (params.power_mcu_ref !== undefined) {
            const element = document.getElementById('mcu-v');
            if (element) {
                element.innerHTML = `${(params.power_mcu_ref / 1000).toFixed(2)} <small>V</small>`; // 转换为V
            }
        }

        // 更新MCU温度
        if (params.power_mcutemp !== undefined) {
            const element = document.getElementById('mcu-temp');
            if (element) {
                element.innerHTML = `${params.power_mcutemp.toFixed(1)} <small>℃</small>`;
            }
        }

        // 更新版本号
        if (params.soft_v !== undefined) {
            const element = document.getElementById('sw-ver');
            if (element) {
                element.textContent = params.soft_v;
            }
        }

        // 更新输出压比例
        if (params.RATIO_MCU_VOUT !== undefined) {
            const element = document.getElementById('ratio-out-v');
            if (element) {
                element.textContent = params.RATIO_MCU_VOUT.toFixed(3);
            }
        }

        // 更新输入电压比
        if (params.RATIO_MCU_VIN !== undefined) {
            const element = document.getElementById('ratio-in-v');
            if (element) {
                element.textContent = params.RATIO_MCU_VIN.toFixed(3);
            }
        }

        // 更新输出流比
        if (params.RATIO_MCU_IOUT !== undefined) {
            const element = document.getElementById('ratio-out-i');
            if (element) {
                element.textContent = params.RATIO_MCU_IOUT.toFixed(3);
            }
        }

        // 更新芯片电压比
        if (params.RATIO_SC8815_VOUT !== undefined) {
            const element = document.getElementById('ratio-chip-v');
            if (element) {
                element.textContent = params.RATIO_SC8815_VOUT.toFixed(3);
            }
        }

        // 更新芯片电流比
        if (params.RATIO_SC8815_IOUT !== undefined) {
            const element = document.getElementById('ratio-chip-i');
            if (element) {
                element.textContent = params.RATIO_SC8815_IOUT.toFixed(3);
            }
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