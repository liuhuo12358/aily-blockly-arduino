import { ChangeDetectorRef, Component, Input, OnInit, OnDestroy } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { NzStepsModule } from 'ng-zorro-antd/steps';
import { SubWindowComponent } from '../../components/sub-window/sub-window.component';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { ModelDetail } from '../../tools/model-store/model-store.service';
import { CommonModule } from '@angular/common';
import { ElectronService } from '../../services/electron.service';
import { PortItem, SerialService } from '../../services/serial.service';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { FirmwareService, FirmwareType, XiaoType, FirmwareInfo, FlashFile } from '../../services/firmware.service';
import { EspLoaderService, ModelInfo } from '../../services/esploader.service';
import { AtCommandService } from '../../services/at-command.service';
import { encode } from 'js-base64';
import {
  getDeployStepConfig,
  DeployStepConfig,
  SupportBoardInfo,
  getSupportedBoards,
  getTaskDescription,
  getModelFormatDescription,
  getPrecisionDescription,
  formatFileSize,
  getDeployTitle,
  getAuthorLogo,
  getDeviceConnectionImage,
  getDeviceConnectionSteps
} from '../../tools/model-store/model-constants';
import { MenuComponent } from '../../components/menu/menu.component';

@Component({
  selector: 'app-model-deploy',
  imports: [
    CommonModule,
    SubWindowComponent,
    TranslateModule,
    NzStepsModule,
    NzButtonModule,
    MenuComponent
  ],
  templateUrl: './model-deploy.component.html',
  styleUrl: './model-deploy.component.scss'
})
export class ModelDeployComponent implements OnInit, OnDestroy {
  @Input() modelDetail: ModelDetail | null = null;
  
  deployStepConfig: DeployStepConfig | null = null;
  supportBoardInfo: SupportBoardInfo | null = null;
  currentStep = 1;
  currentPort;
  // currentBoard;

  // 固件和部署相关
  firmwareInfo: FirmwareInfo | null = null;
  isDeploying = false;
  deployProgress = 0;
  deployStatus = '';
  xiaoType: XiaoType = XiaoType.VISION;

  constructor(
    private sanitizer: DomSanitizer,
    private serialService: SerialService,
    private electronService: ElectronService,
    private cd: ChangeDetectorRef,
    private firmwareService: FirmwareService,
    private espLoaderService: EspLoaderService,
    private atCommandService: AtCommandService
  ) { }

  ngOnInit(): void {
    if (this.serialService.currentPort) {
      this.currentPort = this.serialService.currentPort;
    }
    // 从 localStorage 读取模型数据（使用固定 key）
    const storedData = localStorage.getItem('current_model_deploy');
    
    if (storedData) {
      try {
        this.modelDetail = JSON.parse(storedData);
        
        // 根据作者名称配置部署步骤
        if (this.modelDetail?.author_name) {
          this.deployStepConfig = getDeployStepConfig(this.modelDetail.author_name);
        }

        // 根据任务类型确定 XIAO 设备类型
        if (this.modelDetail?.task) {
          this.xiaoType = this.getXiaoTypeFromTask(this.modelDetail.task);
        }

        // 获取固件信息
        this.loadFirmwareInfo();
      } catch (error) {
        console.error('解析模型数据失败:', error);
      }
    } else {
      console.warn('未找到模型数据');
    }
  }

  ngAfterViewInit() {
    // 检查并设置默认串口
    this.checkAndSetDefaultPort();
  }
  
  ngOnDestroy(): void {
    // 清理 localStorage 中的临时数据
    localStorage.removeItem('current_model_deploy');
  }

  /**
   * 延迟函数
   * @param ms 延迟毫秒数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 获取支持的开发板列表
  getSupportedBoards(): SupportBoardInfo[] {
    if (!this.modelDetail?.uniform_types) return [];
    return getSupportedBoards(this.modelDetail.uniform_types);
  }

  // 获取任务类型描述
  getTaskDescription(): string {
    if (!this.modelDetail?.task) return '-';
    return getTaskDescription(this.modelDetail.task);
  }

  // 获取模型格式
  getModelFormat(): string {
    if (!this.modelDetail?.model_format) return '-';
    return getModelFormatDescription(this.modelDetail.model_format);
  }

  // 获取精度描述
  getPrecision(): string {
    if (!this.modelDetail?.precision) return '-';
    return getPrecisionDescription(this.modelDetail.precision);
  }

  // 格式化文件大小
  getFormattedSize(): string {
    if (!this.modelDetail?.model_size) return '-';
    return formatFileSize(this.modelDetail.model_size);
  }

  // 获取安全的 HTML 内容
  getSafeHtml(html: string): SafeHtml {
    return this.sanitizer.sanitize(1, html) || '';
  }

  getDeployTitle(): string {
    if (!this.modelDetail?.author_name) return 'AI Model Store';
    return getDeployTitle(this.modelDetail.author_name) || 'AI Model Store';
  }

  // 获取作者 Logo
  getAuthorLogo(): string | null {
    if (!this.modelDetail?.author_name) return null;
    return getAuthorLogo(this.modelDetail.author_name);
  }

  // 获取设备连接图片
  getDeviceConnectionImage(): string | null {
    if (!this.modelDetail?.uniform_types) return null;
    return getDeviceConnectionImage(this.modelDetail.uniform_types);
  }

  // 获取设备连接步骤
  getDeviceConnectionSteps(): string[] {
    if (!this.modelDetail?.uniform_types) return [];
    return getDeviceConnectionSteps(this.modelDetail.uniform_types) || [];
  }

  openUrl(url: string): void {
    this.electronService.openUrl(url);
  }

  // 串口选择列表相关 
  showPortList = false;
  portList: PortItem[] = []
  boardKeywords = [];
  position = { x: 0, y: 0 };
  openPortList(el) {
    // 获取元素左下角位置
    let rect = el.srcElement.getBoundingClientRect();
    this.position.x = rect.left;
    this.position.y = rect.bottom + 2;

    this.getDevicePortList();
    this.showPortList = true;
  }

  async getDevicePortList() {
    let ports = await this.serialService.getSerialPorts();
    if (ports && ports.length > 0) {
      this.portList = ports;
    } else {
      this.portList = [
        {
          name: 'Device not found',
          text: '',
          type: 'serial',
          icon: 'fa-light fa-triangle-exclamation',
          disabled: true,
        }
      ]
    }
  }
  
  // 检查串口列表并设置默认串口
  private async checkAndSetDefaultPort() {
    try {
      const ports = await this.serialService.getSerialPorts();
      if (ports && ports.length === 1 && !this.currentPort) {
        // 只有一个串口且当前没有选择串口时，设为默认
        this.currentPort = ports[0].name;
        // this.currentBoard = ports[0].boardName;
        this.cd.detectChanges();
      }
    } catch (error) {
      console.warn('获取串口列表失败:', error);
    }
  }

  closePortList() {
    this.showPortList = false;
    this.cd.detectChanges();
  }

  selectPort(portItem) {
    this.currentPort = portItem.name;
    // this.currentBoard = portItem.boardName;
    this.closePortList();
  }

  /**
   * 根据任务类型获取 XIAO 设备类型
   */
  private getXiaoTypeFromTask(task: string): XiaoType {
    const taskNum = parseInt(task, 10);
    if (taskNum === 6) return XiaoType.AUDIO;      // Audio 任务
    if (taskNum === 5) return XiaoType.VIBRATION;  // Vibration 任务
    return XiaoType.VISION;  // Vision 任务（默认）
  }

  /**
   * 获取固件类型
   */
  private getFirmwareType(): FirmwareType {
    switch (this.xiaoType) {
      case XiaoType.AUDIO:
        return FirmwareType.AUDIO;
      case XiaoType.VIBRATION:
        return FirmwareType.VIBRATION;
      default:
        return FirmwareType.VISION;
    }
  }

  /**
   * 加载固件信息
   */
  private async loadFirmwareInfo() {
    try {
      const firmwareType = this.getFirmwareType();
      this.firmwareInfo = await this.firmwareService.getFirmwareInfo(firmwareType);
    } catch (error) {
      console.error('加载固件信息失败:', error);
    }
  }

  /**
   * 获取串口对象（直接使用 Web Serial API）
   * @param portName 串口名称（仅用于日志，Web Serial API 不能直接指定端口名）
   * @returns Promise<SerialPort>
   */
  private async getSerialPortObject(portName: string): Promise<any> {
    try {
      // 直接使用 Web Serial API
      const serial = (navigator as any).serial;
      
      if (!serial) {
        throw new Error('当前环境不支持 Web Serial API。请确保使用 Chromium 内核的 Electron 版本。');
      }

      // 获取已授权的串口列表
      const ports = await serial.getPorts();
      
      // 尝试找到 ESP32S3 设备
      for (const port of ports) {
        const info = port.getInfo();
        if (info.usbVendorId === 0x303a && info.usbProductId === 0x1001) {
          return port;
        }
      }
      
      // alert(`请在弹出的对话框中选择串口：${portName}\n\n这是首次使用 Web Serial API 烧录功能，需要授权访问串口。`);
      
      const port = await serial.requestPort({
        filters: [
          { usbVendorId: 0x303a, usbProductId: 0x1001 }  // XIAO ESP32S3
        ]
      });
      
      return port;
      
    } catch (error) {
      if (error.name === 'NotFoundError') {
        throw new Error(`未选择串口。请确保：\n1. 设备已连接到 ${portName}\n2. 在弹出的对话框中选择了正确的串口`);
      }
      throw error;
    }
  }

  /**
   * 开始部署模型
   */
  async startDeploy() {
    if (!this.modelDetail || !this.currentPort) {
      console.error('缺少必要的参数');
      return;
    }

    this.isDeploying = true;
    // 部署开始时滚动到页面底部，方便查看进度
    this.scrollToBottom();
    this.deployStatus = '正在准备部署...';
    this.cd.detectChanges();

    try {
      // 1. 获取模型文件
      this.deployStatus = '正在获取模型文件...';
      const modelFileResult = await this.firmwareService.getModelFile(this.modelDetail.id);
      
      if (!modelFileResult) {
        throw new Error('获取模型文件失败');
      }

      const { snapshot, detail } = modelFileResult;

      // 2. 准备烧录文件列表
      const flashFiles: FlashFile[] = [];

      // 3. 下载固件文件
      if (this.firmwareInfo) {
        this.deployStatus = '正在下载固件...';
        const firmwareFiles = await this.firmwareService.downloadFirmware(this.firmwareInfo);
        flashFiles.push(...firmwareFiles);
      }

      // 4. 下载模型文件
      this.deployStatus = '正在下载模型文件...';
      const modelFile = await this.firmwareService.downloadModelFile(snapshot, this.xiaoType);
      flashFiles.push(modelFile);

      // 5. 初始化 ESPLoader（使用已选择的串口）
      this.deployStatus = '正在连接设备...';
      
      // 在 Electron 环境下，使用串口名称获取串口对象
      if (!this.electronService.isElectron) {
        throw new Error('当前仅支持在 Electron 环境下部署');
      }

      // 获取串口对象
      const serialPortObj = await this.getSerialPortObject(this.currentPort);
      if (!serialPortObj) {
        throw new Error(`无法创建串口对象: ${this.currentPort}`);
      }

      // 使用串口对象初始化 ESPLoader，带重试机制
      let success = false;
      let lastError: any = null;
      const maxRetries = 3;
      
      for (let retry = 0; retry < maxRetries; retry++) {
        try {
          if (retry > 0) {
            this.deployStatus = `正在重试连接设备 (${retry + 1}/${maxRetries})...`;
            await this.delay(1000);
          }
          
          success = await this.espLoaderService.initializeWithPort(
            serialPortObj,
            115200,
            {
              write: (text: string) => console.log(text),
              writeLine: (text: string) => console.log(text),
              clean: () => { /* 清空终端 */ }
            }
          );
          
          if (success) {
            break;
          }
        } catch (error) {
          lastError = error;
          if (retry < maxRetries - 1) {
            await this.delay(500);
          }
        }
      }

      if (!success) {
        const errorMsg = lastError ? `连接失败: ${lastError.message || lastError}` : '无法连接到设备';
        throw new Error(`${errorMsg}\n请确保：\n1. 设备已正确连接到 ${this.currentPort}\n2. 设备未被其他程序占用\n3. 设备驱动已正确安装`);
      }

      // 6. 执行烧录（使用累积字节计算总进度）
      this.deployStatus = '正在烧录...';
      const totalFiles = flashFiles.length;
      await this.espLoaderService.flash({
        fileArray: flashFiles,
        flashSize: 'keep',
        eraseAll: false,
        compress: true,
        reportProgress: (fileIndex, written, total) => {
          const perFilePercent = total > 0 ? Math.floor((written / total) * 100) : 0;
          // 显示当前是第几个文件以及该文件的进度
          this.deployStatus = `正在烧录 第 ${fileIndex + 1}/${totalFiles} 个文件`;
          this.deployProgress = perFilePercent;
          this.cd.detectChanges();
        }
      });

      // 7. 断开 ESPLoader 并重启设备（使用硬件信号）
      // this.deployStatus = '正在准备设备重启...';
      
      // 7.1 获取串口引用（在 disconnect 之前）
      const serialPort = this.espLoaderService.getSerialPort();
      
      if (!serialPort) {
        throw new Error('无法获取串口对象');
      }

      // 7.2 完全断开 Program 模式
      await this.espLoaderService.disconnect();
      console.log('ESPLoader 已断开');
      
      // 7.3 等待串口完全释放
      await this.delay(500);
      
      // 7.4 使用 Web Serial API 直接操作 DTR/RTS 重启设备
      this.deployStatus = '正在重启设备...';
      await serialPort.open({ baudRate: 115200 });
      await serialPort.setSignals({ dataTerminalReady: false, requestToSend: true });
      await this.delay(100);
      await serialPort.setSignals({ dataTerminalReady: true, requestToSend: false });
      await serialPort.close();  // 立即关闭,释放给AT命令使用
      await this.delay(3000);  // 等待设备启动
      console.log('设备重启完成');

      // 8. 设置模型信息（使用 AT 命令）
      this.deployStatus = '正在设置模型信息...';
      const modelInfo: ModelInfo = {
        model_id: snapshot.model_id,
        version: snapshot.version,
        arguments: snapshot.arguments,
        model_name: detail.name,
        model_format: snapshot.model_format,
        ai_framwork: snapshot.ai_framwork,
        author: detail.author_name,
        classes: detail.labels.map(l => l.object_name),
        checksum: snapshot.checksum || ''
      };
      
      try {
        // 附加到串口
        await this.atCommandService.attachToPort(serialPort);
        
        // 等待串口稳定
        await this.delay(300);
        
        // 1. 测试连接：发送 AT+STAT? 命令并等待响应
        console.log('[AT] 测试连接...');
        await this.atCommandService.sendCommand('AT+STAT?\r');
        const statResponse = await this.atCommandService.waitForResponse('STAT', 2000);
        if (!statResponse) {
          console.warn('[AT] 设备未响应 AT+STAT? 命令，继续尝试...');
        } else {
          console.log('[AT] 设备响应正常');
        }
        
        await this.delay(200);
        
        // 2. 发送 AT+INFO 命令（使用 js-base64 编码）
        console.log('[AT] 发送模型信息...');
        const infoJson = JSON.stringify(modelInfo);
        const encodedInfo = encode(infoJson);  // 使用 js-base64 的 encode
        await this.atCommandService.sendCommand(`AT+INFO="${encodedInfo}"\r`);
        
        // 等待 AT+INFO 响应
        const infoResponse = await this.atCommandService.waitForResponse('INFO', 3000);
        if (!infoResponse) {
          console.warn('[AT] AT+INFO 命令未收到 OK 响应');
        } else {
          console.log('[AT] AT+INFO 命令执行成功');
        }
        
        await this.delay(200);
        
        // 3. 发送 AT+TRIGGER 命令
        console.log('[AT] 触发设备更新...');
        await this.atCommandService.sendCommand('AT+TRIGGER=""\r');
        
        // 等待 AT+TRIGGER 响应
        const triggerResponse = await this.atCommandService.waitForResponse('TRIGGER', 2000);
        if (!triggerResponse) {
          console.warn('[AT] AT+TRIGGER 命令未收到 OK 响应');
        } else {
          console.log('[AT] AT+TRIGGER 命令执行成功');
        }
        
        await this.delay(200);
        
        // 断开 AT 命令服务
        await this.atCommandService.detach();
        console.log('[AT] AT 命令流程完成');
      } catch (atError) {
        console.error('AT 命令执行失败:', atError);
        throw new Error('设置模型信息失败: ' + (atError as Error).message);
      }

      // 9. 完成
      this.deployStatus = '部署完成！';
      this.deployProgress = 100;

      // 测试完成后关闭串口
      if (serialPort) {
        await serialPort.close();
      }

    } catch (error) {
      console.error('部署失败:', error);
      this.deployStatus = '部署失败: ' + (error as Error).message;
    } finally {
      this.isDeploying = false;
      this.cd.detectChanges();
    }
  }

  /**
   * 将页面滚动到底部，给用户展示部署进度区域
   */
  private scrollToBottom(): void {
    // 延迟一点以确保 DOM 已更新
    setTimeout(() => {
      try {
        const top = document.documentElement.scrollHeight || document.body.scrollHeight;
        window.scrollTo({ top, behavior: 'smooth' });
      } catch (e) {
        // 失败时静默处理
      }
    }, 50);
  }

  nextStep(){
    if (this.modelDetail?.author_name === 'SenseCraft AI') {
      if (this.currentStep === 1) {
        return; // 阻止从步骤2到步骤3的跳转
      }
    }
    this.currentStep += 1;
  }
  
  prevStep(){
    if (this.currentStep > 0) {
      this.currentStep -= 1;
    }
  }
}
