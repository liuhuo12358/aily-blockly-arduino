import { ChangeDetectorRef, Component, Input, OnInit, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { NzStepsModule } from 'ng-zorro-antd/steps';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { SubWindowComponent } from '../../../components/sub-window/sub-window.component';
import { ModelDetail } from '../../../tools/model-store/model-store.service';
import { ElectronService } from '../../../services/electron.service';
import { PortItem, SerialService } from '../../../services/serial.service';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { FirmwareService, FirmwareType, XiaoType, FirmwareInfo, FlashFile } from '../../../services/firmware.service';
import { EspLoaderService, ModelInfo } from '../../../services/esploader.service';
import { AtCommandService } from '../../../services/at-command.service';
import { NoticeService } from '../../../services/notice.service';
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
  getDeviceConnectionImage,
  getDeviceConnectionSteps,
  getAuthorLogo
} from '../../../tools/model-store/model-constants';
import { MenuComponent } from '../../../components/menu/menu.component';

/**
 * SSCMA 模型部署组件
 * 适用于 XIAO ESP32S3 (Vision/Audio/Vibration)
 */
@Component({
  selector: 'app-sscma-deploy',
  standalone: true,
  imports: [
    CommonModule,
    SubWindowComponent,
    TranslateModule,
    NzStepsModule,
    NzButtonModule,
    MenuComponent
  ],
  templateUrl: './sscma-deploy.component.html',
  styleUrl: './sscma-deploy.component.scss'
})
export class SscmaDeployComponent implements OnInit {
  @Input() modelDetail!: ModelDetail;
  @Input() initialStep: number = 0;
  @Output() deployComplete = new EventEmitter<void>();
  @Output() deployError = new EventEmitter<Error>();
  
  deployStepConfig: DeployStepConfig | null = null;
  supportBoardInfo: SupportBoardInfo | null = null;
  currentStep = 0;
  currentPort: string | undefined;

  // 固件和部署相关
  firmwareInfo: FirmwareInfo | null = null;
  isDeploying = false;
  deployProgress = 0;
  deployStatus = '';
  xiaoType: XiaoType = XiaoType.VISION;
  isCancelling = false;  // 正在取消标志

  // 串口选择列表相关 
  showPortList = false;
  portList: PortItem[] = [];
  boardKeywords: string[] = [];
  position = { x: 0, y: 0 };

  constructor(
    private sanitizer: DomSanitizer,
    private serialService: SerialService,
    private electronService: ElectronService,
    private cd: ChangeDetectorRef,
    private firmwareService: FirmwareService,
    private espLoaderService: EspLoaderService,
    private atCommandService: AtCommandService,
    private noticeService: NoticeService
  ) { }

  ngOnInit(): void {
    // 设置初始步骤
    this.currentStep = this.initialStep;
    
    // 从 serialService 获取当前串口
    if (this.serialService.currentPort) {
      this.currentPort = this.serialService.currentPort;
    }
    
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
    
    // 检查并设置默认串口
    this.checkAndSetDefaultPort();
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 根据任务类型获取 XIAO 设备类型
   */
  private getXiaoTypeFromTask(task: string): XiaoType {
    const taskNum = parseInt(task, 10);
    if (taskNum === 6) return XiaoType.AUDIO;
    if (taskNum === 5) return XiaoType.VIBRATION;
    return XiaoType.VISION;
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
   * 检查串口列表并设置默认串口
   */
  private async checkAndSetDefaultPort() {
    try {
      const ports = await this.serialService.getSerialPorts();
      if (ports && ports.length === 1 && !this.currentPort) {
        this.currentPort = ports[0].name;
        this.cd.detectChanges();
      }
    } catch (error) {
      console.warn('获取串口列表失败:', error);
    }
  }

  /**
   * 获取串口对象（Web Serial API）
   */
  private async getSerialPortObject(portName: string): Promise<any> {
    try {
      const serial = (navigator as any).serial;
      
      if (!serial) {
        throw new Error('当前环境不支持 Web Serial API');
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
      
      // 请求授权
      const port = await serial.requestPort({
        filters: [
          { usbVendorId: 0x303a, usbProductId: 0x1001 }
        ]
      });
      
      return port;
      
    } catch (error) {
      if (error.name === 'NotFoundError') {
        throw new Error(`未选择串口。请确保设备已连接到 ${portName}`);
      }
      throw error;
    }
  }

  // ==================== UI 辅助方法 ====================
  
  getSupportedBoards(): SupportBoardInfo[] {
    if (!this.modelDetail?.uniform_types) return [];
    return getSupportedBoards(this.modelDetail.uniform_types);
  }

  getTaskDescription(): string {
    if (!this.modelDetail?.task) return '-';
    return getTaskDescription(this.modelDetail.task);
  }

  getModelFormat(): string {
    if (!this.modelDetail?.model_format) return '-';
    return getModelFormatDescription(this.modelDetail.model_format);
  }

  getPrecision(): string {
    if (!this.modelDetail?.precision) return '-';
    return getPrecisionDescription(this.modelDetail.precision);
  }

  getFormattedSize(): string {
    if (!this.modelDetail?.model_size) return '-';
    return formatFileSize(this.modelDetail.model_size);
  }

  getSafeHtml(html: string): SafeHtml {
    return this.sanitizer.sanitize(1, html) || '';
  }

  getDeviceConnectionImage(): string | null {
    if (!this.modelDetail?.uniform_types) return null;
    return getDeviceConnectionImage(this.modelDetail.uniform_types);
  }

  getDeviceConnectionSteps(): string[] {
    if (!this.modelDetail?.uniform_types) return [];
    return getDeviceConnectionSteps(this.modelDetail.uniform_types) || [];
  }

  getAuthorLogo(): string | null {
    if (!this.modelDetail?.author_name) return null;
    return getAuthorLogo(this.modelDetail.author_name);
  }

  openUrl(url: string): void {
    this.electronService.openUrl(url);
  }

  // ==================== 串口选择 ====================
  
  openPortList(el: any) {
    const rect = el.srcElement.getBoundingClientRect();
    this.position.x = rect.left;
    this.position.y = rect.bottom + 2;
    this.getDevicePortList();
    this.showPortList = true;
  }

  async getDevicePortList() {
    const ports = await this.serialService.getSerialPorts();
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
      ];
    }
  }

  closePortList() {
    this.showPortList = false;
    this.cd.detectChanges();
  }

  selectPort(portItem: PortItem) {
    this.currentPort = portItem.name;
    this.closePortList();
  }

  /**
   * 取消部署
   */
  async cancelDeploy() {
    if (!this.isDeploying || this.isCancelling) {
      return;
    }

    console.log('[Deploy] 用户请求取消部署');
    this.isCancelling = true;
    
    try {
      // 请求 ESPLoader 取消
      this.espLoaderService.requestCancel();
      
      // 更新通知
      this.noticeService.update({
        title: '正在取消',
        text: '正在停止烧录操作...',
        state: 'doing',
        showProgress: false
      });
      
      // 等待一小段时间让取消生效
      await this.delay(500);
      
      // 尝试断开连接
      try {
        await this.espLoaderService.disconnect();
      } catch (e) {
        console.warn('[Deploy] 断开连接时出错:', e);
      }
      
      // 重置状态
      this.isDeploying = false;
      this.isCancelling = false;
      this.deployStatus = '部署已取消';
      this.deployProgress = 0;
      
      this.noticeService.update({
        title: '部署已取消',
        text: '烧录操作已停止',
        state: 'warn',
        setTimeout: 3000
      });
      
      this.cd.detectChanges();
    } catch (error) {
      console.error('[Deploy] 取消过程出错:', error);
      this.isCancelling = false;
    }
  }

  // ==================== 部署流程 ====================
  
  /**
   * 开始部署模型
   */
  async startDeploy() {
    if (!this.modelDetail || !this.currentPort) {
      console.error('缺少必要的参数');
      return;
    }

    this.isDeploying = true;
    this.isCancelling = false;
    this.scrollToBottom();
    this.deployStatus = '正在准备部署...';
    
    // 使用 NoticeService 显示进度（带取消按钮）
    this.noticeService.update({
      title: '模型部署',
      text: '正在准备部署...',
      state: 'doing',
      showProgress: true,
      progress: 0,
      stop: () => this.cancelDeploy()  // 添加取消回调
    });
    
    this.cd.detectChanges();

    try {
      // 1. 获取模型文件
      this.deployStatus = '正在获取模型文件...';
      this.noticeService.update({
        title: '模型部署',
        text: '正在获取模型文件...',
        state: 'doing',
        showProgress: true,
        progress: 5,
        stop: () => this.cancelDeploy()
      });
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
        this.noticeService.update({
          title: '模型部署',
          text: '正在下载固件...',
          state: 'doing',
          showProgress: true,
          progress: 10,
          stop: () => this.cancelDeploy()
        });
        const firmwareFiles = await this.firmwareService.downloadFirmware(this.firmwareInfo);
        flashFiles.push(...firmwareFiles);
      }

      // 4. 下载模型文件
      this.deployStatus = '正在下载模型文件...';
      this.noticeService.update({
        title: '模型部署',
        text: '正在下载模型文件...',
        state: 'doing',
        showProgress: true,
        progress: 15,
        stop: () => this.cancelDeploy()
      });
      const modelFile = await this.firmwareService.downloadModelFile(snapshot, this.xiaoType);
      flashFiles.push(modelFile);

      // 5. 初始化 ESPLoader
      this.deployStatus = '正在连接设备...';
      this.noticeService.update({
        title: '模型部署',
        text: '正在连接设备...',
        state: 'doing',
        showProgress: true,
        progress: 20,
        stop: () => this.cancelDeploy()
      });
      
      if (!this.electronService.isElectron) {
        throw new Error('当前仅支持在 Electron 环境下部署');
      }

      const serialPortObj = await this.getSerialPortObject(this.currentPort);
      if (!serialPortObj) {
        throw new Error(`无法创建串口对象: ${this.currentPort}`);
      }

      // 带重试机制的初始化
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
              write: (text: string) => {},
              writeLine: (text: string) => {},
              clean: () => {}
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
        throw new Error(`${errorMsg}\n请确保设备已正确连接`);
      }

      // 6. 执行烧录
      this.deployStatus = '正在烧录...';
      const totalFiles = flashFiles.length;
      await this.espLoaderService.flash({
        fileArray: flashFiles,
        flashSize: 'keep',
        eraseAll: false,
        compress: true,
        reportProgress: (fileIndex, written, total) => {
          // 检查是否被取消
          if (this.isCancelling) {
            return;
          }
          
          const perFilePercent = total > 0 ? Math.floor((written / total) * 100) : 0;
        //   this.deployStatus = `正在烧录 第 ${fileIndex + 1}/${totalFiles} 个文件`;
          this.deployProgress = perFilePercent;
          
          // 烧录进度占 25%-75%
          const overallProgress = 25 + Math.floor((fileIndex / totalFiles + perFilePercent / 100 / totalFiles) * 50);
          this.noticeService.update({
            title: '模型部署',
            text: `正在烧录...`,
            state: 'doing',
            showProgress: true,
            progress: overallProgress,
            stop: () => this.cancelDeploy()  // 烧录过程中也可以取消
          });
          
          this.cd.detectChanges();
        }
      });

      // 7. 设备重启
      const serialPort = this.espLoaderService.getSerialPort();
      
      if (!serialPort) {
        throw new Error('无法获取串口对象');
      }

      await this.espLoaderService.disconnect();
      console.log('ESPLoader 已断开');
      
      await this.delay(500);
      
      this.deployStatus = '正在重启设备...';
      this.noticeService.update({
        title: '模型部署',
        text: '正在重启设备...',
        state: 'doing',
        showProgress: true,
        progress: 80,
        stop: () => this.cancelDeploy()
      });
      await serialPort.open({ baudRate: 115200 });
      await serialPort.setSignals({ dataTerminalReady: false, requestToSend: true });
      await this.delay(100);
      await serialPort.setSignals({ dataTerminalReady: true, requestToSend: false });
      await serialPort.close();
      await this.delay(3000);
      console.log('设备重启完成');

      // 8. 设置模型信息（AT 命令）
      this.deployStatus = '正在设置模型信息...';
      this.noticeService.update({
        title: '模型部署',
        text: '正在设置模型信息...',
        state: 'doing',
        showProgress: true,
        progress: 85,
        stop: () => this.cancelDeploy()
      });
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
        await this.atCommandService.attachToPort(serialPort);
        await this.delay(300);
        
        console.log('[AT] 测试连接...');
        await this.atCommandService.sendCommand('AT+STAT?\r');
        const statResponse = await this.atCommandService.waitForResponse('STAT', 2000);
        if (!statResponse) {
          console.warn('[AT] 设备未响应 AT+STAT?');
        } else {
          console.log('[AT] 设备响应正常');
        }
        
        await this.delay(200);
        
        console.log('[AT] 发送模型信息...');
        const infoJson = JSON.stringify(modelInfo);
        const encodedInfo = encode(infoJson);
        await this.atCommandService.sendCommand(`AT+INFO="${encodedInfo}"\r`);
        
        const infoResponse = await this.atCommandService.waitForResponse('INFO', 3000);
        if (!infoResponse) {
          console.warn('[AT] AT+INFO 未收到响应');
        } else {
          console.log('[AT] AT+INFO 执行成功');
        }
        
        await this.delay(200);
        
        console.log('[AT] 触发设备更新...');
        await this.atCommandService.sendCommand('AT+TRIGGER=""\r');
        
        const triggerResponse = await this.atCommandService.waitForResponse('TRIGGER', 2000);
        if (!triggerResponse) {
          console.warn('[AT] AT+TRIGGER 未收到响应');
        } else {
          console.log('[AT] AT+TRIGGER 执行成功');
        }
        
        await this.delay(200);
        await this.atCommandService.detach();
        console.log('[AT] AT 命令流程完成');
      } catch (atError) {
        console.error('AT 命令执行失败:', atError);
        throw new Error('设置模型信息失败: ' + (atError as Error).message);
      }

      // 9. 完成
      this.deployStatus = '部署完成！';
      this.deployProgress = 100;
      
      this.noticeService.update({
        title: '模型部署',
        text: '部署完成！',
        state: 'done',
        showProgress: true,
        progress: 100,
        setTimeout: 3000
      });

      if (serialPort) {
        await serialPort.close();
      }
      
      // 发送完成事件
      this.deployComplete.emit();

    } catch (error) {
      console.error('部署失败:', error);
      
      // 检查是否是用户取消
      const errorMsg = (error as Error).message || '';
      if (errorMsg.includes('用户取消')) {
        // 用户取消，不显示错误，cancelDeploy 方法已经处理了通知
        console.log('[Deploy] 用户取消部署');
        return;
      }
      
      this.deployStatus = '部署失败: ' + errorMsg;
      
      this.noticeService.update({
        title: '模型部署',
        text: '部署失败',
        detail: errorMsg,
        state: 'error',
        showProgress: false,
        setTimeout: 5000
      });
      
      this.deployError.emit(error as Error);
    } finally {
      this.isDeploying = false;
      this.isCancelling = false;
      this.cd.detectChanges();
    }
  }

  /**
   * 滚动到底部
   */
  private scrollToBottom(): void {
    setTimeout(() => {
      try {
        const top = document.documentElement.scrollHeight || document.body.scrollHeight;
        window.scrollTo({ top, behavior: 'smooth' });
      } catch (e) {
        // ignore
      }
    }, 50);
  }

  // ==================== 步骤导航 ====================
  
  nextStep() {
    if (this.modelDetail?.author_name === 'SenseCraft AI') {
      if (this.currentStep === 1) {
        return;
      }
    }
    this.currentStep += 1;
  }
  
  prevStep() {
    if (this.currentStep > 0) {
      this.currentStep -= 1;
    }
  }
}
