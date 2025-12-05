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
import { BoardInfo } from '../project-new/project-new.component';

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
    private espLoaderService: EspLoaderService
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
        console.log('模型数据加载成功:', this.modelDetail.name);
        
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
    const storageKey = 'current_model_deploy';
    localStorage.removeItem(storageKey);
    console.log('🗑️ 已清理 localStorage 数据:', storageKey);
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
    console.log('打开外部链接:', url);
    this.electronService.openUrl(url);
  }

  // 串口选择列表相关 
  showPortList = false;
  portList: PortItem[] = []
  boardKeywords = []; // 这个用来高亮显示正确开发板，如['arduino uno']，则端口菜单中如有包含'arduino uno'的串口则高亮显示
  position = { x: 0, y: 0 }; // 右键菜单位置
  openPortList(el) {
    console.log(el.srcElement);
    // 获取元素左下角位置
    let rect = el.srcElement.getBoundingClientRect();
    this.position.x = rect.left;
    this.position.y = rect.bottom + 2;

    // if (this.currentBoard) {
    //   let boardname = this.currentBoard.replace(' 2560', ' ').replace(' R3', '');
    //   this.boardKeywords = [boardname];
    // }
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
      console.log('获取固件信息:', firmwareType);
      
      this.firmwareInfo = await this.firmwareService.getFirmwareInfo(firmwareType);
      
      if (this.firmwareInfo) {
        console.log('固件版本:', this.firmwareInfo.fwv);
      } else {
        console.warn('获取固件信息失败');
      }
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

      console.log('提示：需要烧录的串口是', portName);
      console.log('正在检查 Web Serial API 授权的串口...');
      
      // 获取已授权的串口列表
      const ports = await serial.getPorts();
      console.log('Web Serial API 已授权串口数量:', ports.length);
      
      // 尝试找到 ESP32S3 设备
      for (const port of ports) {
        const info = port.getInfo();
        console.log('检查串口:', info);
        if (info.usbVendorId === 0x303a && info.usbProductId === 0x1001) {
          console.log('✓ 找到已授权的 ESP32S3 设备');
          return port;
        }
      }
      
      // 如果没有找到，需要用户授权
      console.log('⚠ 未找到已授权的 ESP32S3 设备');
      console.log('即将弹出串口选择对话框，请选择:', portName);
      
      alert(`请在弹出的对话框中选择串口：${portName}\n\n这是首次使用 Web Serial API 烧录功能，需要授权访问串口。`);
      
      const port = await serial.requestPort({
        filters: [
          { usbVendorId: 0x303a, usbProductId: 0x1001 }  // XIAO ESP32S3
        ]
      });
      
      console.log('✓ 用户已授权串口');
      return port;
      
    } catch (error) {
      if (error.name === 'NotFoundError') {
        throw new Error(`未选择串口。请确保：\n1. 设备已连接到 ${portName}\n2. 在弹出的对话框中选择了正确的串口`);
      }
      console.error('获取串口失败:', error);
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

      // 3. 检查是否需要更新固件
      // 这里需要先读取设备当前版本，暂时跳过
      // if (this.firmwareInfo && this.firmwareService.needFirmwareUpdate(currentVersion, this.firmwareInfo.fwv)) {
      if (this.firmwareInfo) {
        this.deployStatus = '正在下载固件...';
        const firmwareFiles = await this.firmwareService.downloadFirmware(this.firmwareInfo);
        flashFiles.push(...firmwareFiles);
      }

      // 4. 下载模型文件
      this.deployStatus = '正在下载模型文件...';
      const modelFile = await this.firmwareService.downloadModelFile(snapshot, this.xiaoType);
      flashFiles.push(modelFile);

      console.log('准备烧录的文件:', flashFiles);

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

      console.log('串口对象已创建，等待 ESPLoader 打开...');

      // 使用串口对象初始化 ESPLoader，带重试机制
      let success = false;
      let lastError: any = null;
      const maxRetries = 3;
      
      for (let retry = 0; retry < maxRetries; retry++) {
        try {
          if (retry > 0) {
            console.log(`重试连接 (${retry + 1}/${maxRetries})...`);
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
            console.log('ESPLoader 连接成功');
            break;
          }
        } catch (error) {
          lastError = error;
          console.warn(`连接失败 (尝试 ${retry + 1}/${maxRetries}):`, error);
          if (retry < maxRetries - 1) {
            await this.delay(500);
          }
        }
      }

      if (!success) {
        const errorMsg = lastError ? `连接失败: ${lastError.message || lastError}` : '无法连接到设备';
        throw new Error(`${errorMsg}\n请确保：\n1. 设备已正确连接到 ${this.currentPort}\n2. 设备未被其他程序占用\n3. 设备驱动已正确安装`);
      }

      // 6. 执行烧录
      this.deployStatus = '正在烧录...';
      await this.espLoaderService.flash({
        fileArray: flashFiles,
        flashSize: 'keep',
        eraseAll: false,
        compress: true,
        reportProgress: (fileIndex, written, total) => {
          this.deployProgress = Math.floor((written / total) * 100);
          this.cd.detectChanges();
        }
      });

      // 7. 重启设备
      this.deployStatus = '正在重启设备...';
      await this.espLoaderService.resetDevice(3000);

      // 8. 设置模型信息
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
      await this.espLoaderService.setModelInfo(modelInfo);

      // 9. 完成
      this.deployStatus = '部署完成！';
      this.deployProgress = 100;
      console.log('模型部署成功');

      // 断开连接
      await this.espLoaderService.disconnect();

    } catch (error) {
      console.error('部署失败:', error);
      this.deployStatus = '部署失败: ' + (error as Error).message;
    } finally {
      this.isDeploying = false;
      this.cd.detectChanges();
    }
  }

  nextStep(){
    if (this.modelDetail?.author_name === 'SenseCraft AI') {
      if (this.currentStep === 1) {
        console.log('部署下载步骤，阻止跳转到下一步');
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
