import { ChangeDetectorRef, Component, Input, OnInit, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { NzStepsModule } from 'ng-zorro-antd/steps';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { SubWindowComponent } from '../../../components/sub-window/sub-window.component';
import { ModelDetail } from '../../../tools/model-store/model-store.service';
import { ElectronService } from '../../../services/electron.service';
import { PortItem, SerialService } from '../../../services/serial.service';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { FirmwareService, FirmwareType, XiaoType, FirmwareInfo, FlashFile } from '../../../services/firmware.service';
// import { EspLoaderService, ModelInfo } from '../../../services/esploader.service';
import { EsptoolPyService, EsptoolPackageInfo } from '../../../services/esptool-py.service';
// import { AtCommandService } from '../../../services/at-command.service';
import { SSCMACommandService } from '../../../services/sscma-command.service';
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
import { SscmaConfigComponent } from '../sscma-config/sscma-config.component';
import { NotificationComponent } from '../../../components/notification/notification.component';

/**
 * 模型信息
 */
export interface ModelInfo {
  model_id: string;
  version: string;
  arguments: any;
  model_name: string;
  model_format: string;
  ai_framwork: string;
  author: string;
  classes: string[];
  checksum: string;
}

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
    MenuComponent,
    SscmaConfigComponent,
    NotificationComponent
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
  authorLogo: string | null = null;
  deviceConnectionImage: string | null = null;
  deviceConnectionSteps: string[] = [];

  // 固件和部署相关
  firmwareInfo: FirmwareInfo | null = null;
  isDeploying = false;
  deployProgress = 0;
  deployStatus = '';
  xiaoType: XiaoType = XiaoType.VISION;
  isCancelling = false;  // 正在取消标志
  esptoolPackage: EsptoolPackageInfo | null = null;  // esptool 包信息
  flashStreamId: string = '';  // 烧录流ID，用于取消

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
    // private espLoaderService: EspLoaderService,
    private esptoolPyService: EsptoolPyService,
    // private atCommandService: AtCommandService,
    private sscmaCommandService: SSCMACommandService,
    private noticeService: NoticeService,
    private router: Router,
    private route: ActivatedRoute
  ) { }

  ngOnInit(): void {
    // 从 localStorage 读取模型数据（路由模式下需要）
    const storedData = localStorage.getItem('current_model_deploy');
    if (storedData) {
      try {
        this.modelDetail = JSON.parse(storedData);
      } catch (error) {
        console.error('解析模型数据失败:', error);
      }
    }

    // 从 localStorage 读取串口信息
    const storedPort = localStorage.getItem('current_model_deploy_port');
    if (storedPort) {
      this.currentPort = storedPort;
    }

    // 从路由参数获取步骤，如果没有则从 input 获取
    this.route.paramMap.subscribe(params => {
      const step = params.get('step');
      if (step) {
        // 根据路由参数设置步骤（2步流程）
        const stepMap: { [key: string]: number } = {
          'deploy': 0,  // 第一步：部署
          'config': 1   // 第二步：配置
        };
        this.currentStep = stepMap[step] ?? this.initialStep;
      } else {
        this.currentStep = this.initialStep;
      }
      this.cd.detectChanges();
    });
    
    // 从 serialService 获取当前串口
    if (this.serialService.currentPort) {
      this.currentPort = this.serialService.currentPort;
    }
    
    // 根据作者名称配置部署步骤
    if (this.modelDetail?.author_name) {
      this.deployStepConfig = getDeployStepConfig(this.modelDetail.author_name);
      // 缓存作者 logo
      this.authorLogo = getAuthorLogo(this.modelDetail.author_name);
    }

    // 缓存设备连接相关数据
    if (this.modelDetail?.uniform_types) {
      this.deviceConnectionImage = getDeviceConnectionImage(this.modelDetail.uniform_types);
      this.deviceConnectionSteps = getDeviceConnectionSteps(this.modelDetail.uniform_types) || [];
    }

    // 根据任务类型确定 XIAO 设备类型
    if (this.modelDetail?.task) {
      this.xiaoType = this.getXiaoTypeFromTask(this.modelDetail.task);
    }

    // 获取固件信息
    this.loadFirmwareInfo();
    
    // 检查并设置默认串口
    this.checkAndSetDefaultPort();

    // 检测 esptool
    this.checkEsptool();
  }

  /**
   * 检测并准备 esptool
   */
  private async checkEsptool() {
    try {
      // console.log('[Deploy] 正在检测 esptool...');
      this.esptoolPackage = await this.esptoolPyService.detectEsptool();
      
      if (this.esptoolPackage) {
        // console.log('[Deploy] esptool 已就绪:', this.esptoolPackage);
      } else {
        // console.log('[Deploy] esptool 未安装，将在部署时安装');
      }
    } catch (error) {
      console.error('[Deploy] 检测 esptool 失败:', error);
    }
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
      // console.log('固件信息加载完成:', this.firmwareInfo);
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
      
      if (ports && ports.length > 0) {
        // 如果已经有串口，验证它是否还在可用列表中
        if (this.currentPort) {
          const portExists = ports.some(p => p.name === this.currentPort);
          if (!portExists) {
            // 存储的串口不再可用，清除它
            this.currentPort = undefined;
          }
        }
        
        // 如果没有串口且只有一个可用串口，自动选择
        if (!this.currentPort && ports.length === 1) {
          this.currentPort = ports[0].name;
        }
      } else {
        // 没有可用串口，清除当前串口
        this.currentPort = undefined;
      }
      
      this.cd.detectChanges();
    } catch (error) {
      console.warn('获取串口列表失败:', error);
      this.currentPort = undefined;
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

    // console.log('[Deploy] 用户请求取消部署');
    this.isCancelling = true;
    
    try {
      // 请求取消烧录（Python esptool 或 ESPLoader）
      if (this.flashStreamId) {
        // 使用 Python esptool 烧录时
        this.esptoolPyService.cancelFlash(this.flashStreamId);
      } else {
        // 使用 ESPLoader 烧录时
        // this.espLoaderService.requestCancel();
      }
      
      // 更新通知
      this.noticeService.update({
        title: '正在取消',
        text: '正在停止烧录操作...',
        state: 'doing',
        showProgress: false
      });
      
      // 等待一小段时间让取消生效
      await this.delay(500);
      
      // // 尝试断开连接
      // try {
      //   await this.espLoaderService.disconnect();
      // } catch (e) {
      //   console.warn('[Deploy] 断开连接时出错:', e);
      // }
      
      // 重置状态
      this.isDeploying = false;
      this.isCancelling = false;
      this.deployStatus = '部署已取消';
      this.deployProgress = 0;
      this.flashStreamId = '';
      
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
    // this.scrollToBottom();
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

      // 2. 先下载所有文件（固件 + 模型）
      const flashFiles: FlashFile[] = [];
      
      // 2.1 下载固件文件
      if (this.firmwareInfo) {
        this.deployStatus = '正在下载固件...';
        this.noticeService.update({
          title: '模型部署',
          text: '正在下载固件...',
          state: 'doing',
          showProgress: true,
          progress: 5,
          stop: () => this.cancelDeploy()
        });
        const firmwareFiles = await this.firmwareService.downloadFirmware(this.firmwareInfo);
        flashFiles.push(...firmwareFiles);
        // console.log('[Deploy] 固件下载完成');
      }

      // 2.2 下载模型文件
      this.deployStatus = '正在下载模型文件...';
      this.noticeService.update({
        title: '模型部署',
        text: '正在下载模型文件...',
        state: 'doing',
        showProgress: true,
        progress: 10,
        stop: () => this.cancelDeploy()
      });
      const modelFile = await this.firmwareService.downloadModelFile(snapshot, this.xiaoType);
      flashFiles.push(modelFile);
      // console.log('[Deploy] 模型文件下载完成');
      
      // 显示下载完成提示
      this.deployStatus = '所有文件下载完成';
      this.noticeService.update({
        title: '模型部署',
        text: '所有文件下载完成，准备烧录...',
        state: 'doing',
        showProgress: true,
        progress: 15,
        stop: () => this.cancelDeploy()
      });
      
      // console.log('[Deploy] 所有文件已下载，共 ' + flashFiles.length + ' 个文件');

      // 3. 检查并安装 esptool（如果需要）
      if (!this.esptoolPackage) {
        this.deployStatus = '正在准备烧录工具...';
        this.noticeService.update({
          title: '模型部署',
          text: '正在安装 esptool 烧录工具...',
          state: 'doing',
          showProgress: true,
          progress: 18,
          stop: () => this.cancelDeploy()
        });
        
        const installSuccess = await this.esptoolPyService.installEsptool();
        if (!installSuccess) {
          throw new Error('安装 esptool 失败，请检查网络连接');
        }
        
        this.esptoolPackage = this.esptoolPyService.getEsptoolPackage();
        if (!this.esptoolPackage) {
          // 安装成功但检测失败，可能是文件系统缓存问题
          console.warn('[Deploy] esptool 安装失败，可能是文件系统缓存问题');
          
          // 给用户提示
          this.noticeService.update({
            title: '提示',
            text: 'esptool 工具已安装，但需要重新打开窗口才能使用',
            detail: '请关闭此窗口后重新打开，即可正常部署模型',
            state: 'warn',
            showProgress: false,
            setTimeout: 10000
          });
          
          throw new Error('esptool 工具已安装，但需要重新打开窗口才能使用。这是文件系统缓存导致的，请关闭窗口后重新打开即可。');
        }
      }

      // 4. 分步烧录所有文件
      // console.log('[Deploy] 开始烧录流程');
      
      // 4.1 先烧录固件（如果有）
      let firmwareFlashed = false;
      if (flashFiles.length > 1) {
        // 有固件需要烧录
        this.deployStatus = '正在烧录固件...';
        this.noticeService.update({
          title: '模型部署',
          text: '正在烧录固件...',
          state: 'doing',
          showProgress: true,
          progress: 25,
          stop: () => this.cancelDeploy()
        });
        
        try {
          const firmwareFile = flashFiles[0]; // 固件总是第一个
          const firmwareResult = await this.esptoolPyService.flashSingleFile(
            { data: firmwareFile.data, address: firmwareFile.address },
            this.currentPort,
            {
              chip: 'esp32s3',
              baudRate: 460800,
              beforeFlash: 'default_reset',
              afterFlash: 'hard_reset',
              progressCallback: (progress: number, status: string) => {
                if (this.isCancelling) return;
                
                this.deployProgress = progress;
                this.deployStatus = `烧录固件: ${status}`;
                
                // 固件烧录占 25%-55%
                const overallProgress = 25 + Math.floor(progress * 0.3);
                this.noticeService.update({
                  title: '模型部署',
                  text: `烧录固件: ${status}`,
                  state: 'doing',
                  showProgress: true,
                  progress: overallProgress,
                  stop: () => this.cancelDeploy()
                });
                
                this.cd.detectChanges();
              }
            }
          );
          
          this.flashStreamId = firmwareResult.streamId;
          firmwareFlashed = true;
          // console.log('[Deploy] 固件烧录完成');
          
        } catch (error) {
          console.error('[Deploy] 固件烧录失败:', error);
          throw new Error('固件烧录失败: ' + (error as Error).message);
        }
      }
      
      // 6.2 烧录模型文件
      this.deployStatus = '正在烧录模型文件...';
      this.noticeService.update({
        title: '模型部署',
        text: '正在烧录模型文件...',
        state: 'doing',
        showProgress: true,
        progress: firmwareFlashed ? 55 : 25,
        stop: () => this.cancelDeploy()
      });
      
      try {
        const modelFile = flashFiles[flashFiles.length - 1]; // 模型文件总是最后一个
        const modelResult = await this.esptoolPyService.flashSingleFile(
          { data: modelFile.data, address: modelFile.address },
          this.currentPort,
          {
            chip: 'esp32s3',
            baudRate: 460800,
            beforeFlash: 'default_reset',
            afterFlash: 'hard_reset',
            progressCallback: (progress: number, status: string) => {
              if (this.isCancelling) return;
              
              this.deployProgress = progress;
              this.deployStatus = `烧录模型: ${status}`;
              
              // 模型烧录占 55%-85%（如果有固件）或 25%-85%（仅模型）
              const startProgress = firmwareFlashed ? 55 : 25;
              const overallProgress = startProgress + Math.floor(progress * 0.3);
              this.noticeService.update({
                title: '模型部署',
                text: `烧录模型: ${status}`,
                state: 'doing',
                showProgress: true,
                progress: overallProgress,
                stop: () => this.cancelDeploy()
              });
              
              this.cd.detectChanges();
            }
          }
        );
        
        this.flashStreamId = modelResult.streamId;
        // console.log('[Deploy] 模型烧录完成');
        
      } catch (error) {
        console.error('[Deploy] 模型烧录失败:', error);
        throw new Error('模型烧录失败: ' + (error as Error).message);
      }

      // console.log('[Deploy] 所有文件烧录完成，准备设置模型信息');

      // 7. 等待设备重启
      this.deployStatus = '正在等待设备重启...';
      this.noticeService.update({
        title: '模型部署',
        text: '正在等待设备重启...',
        state: 'doing',
        showProgress: true,
        progress: 88,
        stop: () => this.cancelDeploy()
      });
      await this.delay(1000);

      // 8. 设置模型信息（AT 命令 - 使用 Native Service）
      if (this.isCancelling) {
        throw new Error('用户取消部署');
      }

      this.deployStatus = '正在连接设备...';
      this.noticeService.update({
        title: '模型部署',
        text: '正在连接设备...',
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
        // 使用 Native Service 连接串口
        await this.sscmaCommandService.connect(this.currentPort!);
        // console.log('[AT Native] 串口连接成功');
        
        // 等待设备完全准备好（设备可能刚重启）
        // console.log('[AT Native] 等待设备准备就绪...');
        await this.delay(500);
        
        this.deployStatus = '正在设置模型信息...';
        this.noticeService.update({
          title: '模型部署',
          text: '正在设置模型信息...',
          state: 'doing',
          showProgress: true,
          progress: 90,
          stop: () => this.cancelDeploy()
        });
        
        // console.log('[AT Native] 测试连接，发送 AT+STAT?...');
        await this.sscmaCommandService.sendCommand('AT+STAT?');
        // console.log('[AT Native] AT+STAT? 命令已发送，等待响应...');
        await this.delay(500);
        
        // console.log('[AT Native] 发送模型信息...');
        const infoJson = JSON.stringify(modelInfo);
        const encodedInfo = encode(infoJson);
        await this.sscmaCommandService.sendCommand(`AT+INFO="${encodedInfo}"`);
        await this.delay(200);
        
        // console.log('[AT Native] 触发设备更新...');
        await this.sscmaCommandService.sendCommand('AT+TRIGGER=""');
        await this.delay(200);
        
        // await this.sscmaCommandService.disconnect();
        // console.log('[AT Native] AT 命令流程完成');
      } catch (atError) {
        console.error('[AT Native] 命令执行失败:', atError);
        await this.sscmaCommandService.disconnect();
        throw new Error('设置模型信息失败: ' + (atError as Error).message);
      }

      // 9. 完成部署，进入配置页面
      this.deployStatus = '部署完成！';
      this.deployProgress = 100;
      
      this.noticeService.update({
        title: '模型部署',
        text: '部署完成！正在进入配置页面...',
        state: 'done',
        showProgress: true,
        progress: 100,
        setTimeout: 2000
      });

      // 等待一小段时间让用户看到完成提示
      await this.delay(1000);
      
      // 自动进入配置页面（步骤1）
      this.router.navigate(['/model-deploy/sscma', 'config']);
      
      // console.log('[Deploy] 部署完成，已进入配置页面');

    } catch (error) {
      console.error('部署失败:', error);
      
      // 检查是否是用户取消
      const errorMsg = (error as Error).message || '';
      if (errorMsg.includes('用户取消')) {
        // 用户取消，不显示错误，cancelDeploy 方法已经处理了通知
        // console.log('[Deploy] 用户取消部署');
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
  // private scrollToBottom(): void {
  //   setTimeout(() => {
  //     try {
  //       const top = document.documentElement.scrollHeight || document.body.scrollHeight;
  //       window.scrollTo({ top, behavior: 'smooth' });
  //     } catch (e) {
  //       // ignore
  //     }
  //   }, 50);
  // }

  // ==================== 步骤导航 ====================
  
  nextStep() {
    if (this.modelDetail?.author_name === 'SenseCraft AI') {
      if (this.currentStep === 0) {
        // 部署步骤不允许直接下一步，需要点击部署按钮
        return;
      }
    }
    const nextStep = this.currentStep + 1;
    const stepNames = ['deploy', 'config'];
    if (nextStep < stepNames.length) {
      this.router.navigate(['/model-deploy/sscma', stepNames[nextStep]]);
    }
  }
  
  prevStep() {
    if (this.currentStep > 0) {
      const prevStep = this.currentStep - 1;
      const stepNames = ['deploy', 'config'];
      this.router.navigate(['/model-deploy/sscma', stepNames[prevStep]]);
    }
  }

  /**
   * 配置完成回调
   */
  onConfigComplete(): void {
    // console.log('[Deploy] 配置完成');
    this.deployComplete.emit();
  }
}
