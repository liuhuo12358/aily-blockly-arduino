import { Component, Input, OnInit, OnDestroy, Output, EventEmitter, ChangeDetectorRef, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzSliderModule } from 'ng-zorro-antd/slider';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { Subscription } from 'rxjs';
import { SSCMACommandService, AtResponse, InvokeResultData } from '../../../services/sscma-command.service';
import { SerialService, PortItem } from '../../../services/serial.service';
import { MenuComponent } from '../../../components/menu/menu.component';

/**
 * SSCMA 模型配置组件
 * 用于配置已部署的模型参数
 */
@Component({
  selector: 'app-sscma-config',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    NzSliderModule,
    NzButtonModule,
    NzCardModule,
    NzDividerModule,
    NzSwitchModule,
    NzInputModule,
    NzTagModule,
    NzSelectModule,
    NzSpinModule,
    NzIconModule,
    MenuComponent
  ],
  templateUrl: './sscma-config.component.html',
  styleUrls: ['./sscma-config.component.scss']
})
export class SscmaConfigComponent implements OnInit, OnDestroy, OnChanges {
  @Input() portPath!: string;  // 从上一步传入的串口路径（默认值）
  @Output() configComplete = new EventEmitter<void>();
  @Output() backToDeploy = new EventEmitter<void>();

  // 串口选择（简化版）
  currentPort: string | undefined;
  showPortList = false;
  portList: PortItem[] = [];
  position = { x: 0, y: 0 };
  // 传输类型选择
  showTransportList = false;
  transportMenuList: Array<{ name: string; text: string; value?: number; disabled?: boolean }> = [];
  currentTransport?: number;
  currentTransportName: string = '';

  // 连接状态
  isConnected = false;
  isConnecting = false;
  // 配置加载状态（与连接区分）
  isLoadingConfig = false;

  // 预览相关
  isPreviewMode = false;
  previewImage: string | null = null;  // Base64 图片
  previewImageUrl: string | null = null;  // 完整的图片 URL
  imageVersion: number = 0;  // 图片版本号，用于强制刷新
  lastUpdateTime: string = '';

  // 设备信息
  deviceInfo: {
    id?: string;
    name?: string;
    version?: any;
    // 兼容模板中使用的字段名
    device_id?: string | number;
    device_name?: string;
    device_version?: any;
    inference_interval_ms?: number;
    default_inference_mode?: string;
  } = {};

  // AT+INFO? 原始返回与解析后的元数据（可包含模型名称/版本/图片等）
  infoRaw: string | null = null;
  infoDecoded: string | null = null;
  modelMeta: { name?: string; version?: string; pic_url?: string; classes?: string[] } = {};

  // 顶部侧边栏选项（设备 / MQTT / GPIO / 串口）
  selectedSidebar: 'device' | 'mqtt' | 'gpio' | 'serial' = 'device';

  selectSidebar(name: 'device' | 'mqtt' | 'gpio' | 'serial'): void {
    this.selectedSidebar = name;
  }

  // 模型信息
  modelInfo: {
    id?: number;
    type?: number;
    address?: number;
    size?: number;
  } = {};

  // 传感器信息
  sensorInfo: {
    id?: number;
    type?: number;
    state?: number;
    opt_detail?: string;
  } = {};

  // 配置参数
  scoreThreshold: number = 60;
  iouThreshold: number = 50;
  
  // 推理状态
  isInvoking = false;
  invokeResults: InvokeResultData[] = [];
  resultCount = 0;

  // 识别类分数（与 modelMeta.classes 对应）
  classScores: number[] = [];
  // 每个类对应的进度条颜色（循环使用）
  barColors: string[] = ['#52c41a', '#1890ff', '#fa8c16', '#f5222d', '#722ed1', '#13c2c2'];

  // 订阅
  private subscriptions: Subscription[] = [];

  constructor(
    private atService: SSCMACommandService,
    private serialService: SerialService,
    private message: NzMessageService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    // 优先使用父组件传入的 portPath，否则使用 serialService.currentPort
    if (this.portPath) {
      this.currentPort = this.portPath;
    } else if (this.serialService.currentPort) {
      this.currentPort = this.serialService.currentPort;
    }

    // 订阅连接状态
    this.subscriptions.push(
      this.atService.isConnected$.subscribe(connected => {
        this.isConnected = connected;
        if (!connected) {
          this.isPreviewMode = false;
          this.previewImage = null;
        }
      })
    );

    // 订阅推理结果（用于预览）
    this.subscriptions.push(
      this.atService.responseReceived$.subscribe(response => {
        if (response.type === 1 && response.name === 'INVOKE') {
          this.handleInvokeResult(response);
        }
      })
    );

    // 初始化传输类型菜单（静态，可根据 SSCMA 文档扩展）
    this.transportMenuList = [
      { name: '1', text: 'Console', value: 1 },
      { name: '2', text: 'Serial', value: 2 },
      { name: '3', text: 'SPI', value: 3 },
      { name: '4', text: 'I2C', value: 4 },
      { name: '5', text: 'MQTT', value: 5 }
    ];
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    
    // 停止预览
    if (this.isPreviewMode) {
      this.stopPreview().catch(console.error);
    }
    
    // 断开连接
    if (this.isConnected) {
      this.disconnect().catch(console.error);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['portPath'] && !changes['portPath'].isFirstChange()) {
      const newPath = changes['portPath'].currentValue as string | undefined;
      if (newPath) {
        this.currentPort = newPath;
      }
    }
  }

  /**
   * 打开串口选择菜单
   */
  openPortList(el: any): void {
    const rect = el.srcElement.getBoundingClientRect();
    this.position.x = rect.left;
    this.position.y = rect.bottom + 2;
    this.getDevicePortList();
    this.showPortList = true;
  }

  /**
   * 获取设备串口列表
   */
  async getDevicePortList(): Promise<void> {
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

  /**
   * 关闭串口选择菜单
   */
  closePortList(): void {
    this.showPortList = false;
    this.cdr.detectChanges();
  }

  /**
   * 选择串口
   */
  selectPort(portItem: PortItem): void {
    this.currentPort = portItem.name;
    this.closePortList();
  }

  /**
   * 连接选中的串口
   */
  async connectToDevice(): Promise<void> {
    if (!this.currentPort) {
      this.message.warning('请先选择串口');
      return;
    }

    if (this.isConnected && this.atService['currentPortPath'] === this.currentPort) {
      this.message.info('设备已连接');
      return;
    }

    this.isConnecting = true;

    try {
      // 连接串口
      await this.atService.connect(this.currentPort);

      // 一旦串口打开，立即停止连接 loading（避免后续配置加载阻塞 UI）
      this.isConnecting = false;
      this.message.success('设备已连接');

      // 等待设备准备（短延迟），然后在后台加载设备信息和配置
      await this.delay(300);

      // 自动启动实时预览（异步，不阻塞后续配置加载）
      this.startPreview().catch(err => {
        console.warn('自动启动预览失败:', err);
      });

      // 背景加载配置（显示独立状态），不再阻塞连接按钮
      this.isLoadingConfig = true;
      try {
        await this.loadDeviceInfo();
        await this.loadCurrentConfig();
      } catch (err) {
        console.warn('加载配置信息时发生部分错误:', err);
      } finally {
        this.isLoadingConfig = false;
      }

    } catch (error) {
      console.error('连接失败:', error);
      this.message.error('连接设备失败: ' + (error as Error).message);
      this.isConnecting = false;
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    try {
      await this.atService.disconnect();
    } catch (error) {
      console.error('断开连接失败:', error);
    }
  }

  /**
   * 加载设备信息
   */
  async loadDeviceInfo(): Promise<void> {
    try {
      this.deviceInfo.id = await this.atService.getDeviceId();
      this.deviceInfo.name = await this.atService.getDeviceName();
      this.deviceInfo.version = await this.atService.getVersion();
      
      // 兼容字段：部分模板/旧代码使用 snake_case 字段名
      try {
        if (this.deviceInfo.id !== undefined) this.deviceInfo.device_id = this.deviceInfo.id as any;
        if (this.deviceInfo.name !== undefined) this.deviceInfo.device_name = this.deviceInfo.name as any;
        if (this.deviceInfo.version !== undefined) this.deviceInfo.device_version = this.deviceInfo.version.software as any;
      } catch (e) {
        // ignore
      }

      console.log('设备信息:', this.deviceInfo);
      // 读取设备默认传输类型
      try {
        await this.loadDefaultTransport();
      } catch (err) {
        console.warn('读取默认传输类型失败:', err);
      }
      // 同步尝试加载设备上的额外 info（AT+INFO?）用于获取模型元数据
      try {
        await this.loadInfoFromDevice();
      } catch (err) {
        console.warn('读取 AT+INFO? 失败:', err);
      }
    } catch (error) {
      console.error('获取设备信息失败:', error);
      this.message.warning('部分设备信息获取失败');
    }
  }

  /**
   * 打开传输类型选择菜单（与串口下拉样式一致）
   */
  openTransportList(el: any): void {
    const rect = el.srcElement.getBoundingClientRect();
    this.position.x = rect.left;
    this.position.y = rect.bottom + 2;
    this.showTransportList = true;
  }

  closeTransportList(): void {
    this.showTransportList = false;
    this.cdr.detectChanges();
  }

  async selectTransport(item: any): Promise<void> {
    // item may be the menu item or simple string
    const val = item && (item.value ?? Number(item.name));
    if (!val && val !== 0) return;

    // 先把界面值更新上去，等待 AT 命令结果确认
    const old = this.currentTransport;
    this.currentTransport = Number(val);
    this.currentTransportName = item.text || String(val);
    this.showTransportList = false;

    try {
      const res = await this.atService.setDefaultTransport(Number(val));
      this.message.success('默认传输类型已设置: ' + (item.text || res));
    } catch (err) {
      this.message.error('设置默认传输类型失败');
      // 回退
      this.currentTransport = old;
      await this.loadDefaultTransport().catch(() => {});
    }
  }

  /**
   * 从设备查询当前的默认传输类型
   */
  async loadDefaultTransport(): Promise<void> {
    try {
      const t = await this.atService.getDefaultTransport();
      this.currentTransport = Number(t);
      const found = this.transportMenuList.find(x => Number(x.value) === Number(t) || Number(x.name) === Number(t));
      this.currentTransportName = found ? found.text : String(t);
      this.cdr.detectChanges();
    } catch (err) {
      console.warn('loadDefaultTransport error:', err);
    }
  }

  /**
   * 使用 AT+INFO? 获取设备 info 字段并尝试解析模型相关元数据
   */
  async loadInfoFromDevice(): Promise<void> {
    try {
      const resp = await this.atService.sendCommand('AT+INFO?');
      if (!resp || resp.code !== 0) {
        console.warn('AT+INFO? 返回非 0 code', resp);
        return;
      }

      const data = resp.data as any;
      // 规范中 data 可能为 { info: string, crc16_maxim: number }
      let infoVal: string | null = null;
      if (data) {
        if (typeof data === 'string') {
          infoVal = data;
        } else if (data.info) {
          infoVal = String(data.info);
        }
      }

      this.infoRaw = infoVal;

      // 先尝试判断是否为 Base64 编码的字符串（简单检查），如果是则解码
      if (infoVal) {
        let decoded: string | null = null;

        const isBase64Like = /^[A-Za-z0-9+/\r\n]+={0,2}$/.test(infoVal.trim()) && (infoVal.length % 4 === 0 || infoVal.endsWith('==') || infoVal.endsWith('='));
        if (isBase64Like) {
          try {
            // 在浏览器/Angular 环境中使用 atob
            decoded = atob(infoVal.replace(/\r|\n/g, ''));
          } catch (e) {
            decoded = null;
          }
        }

        // 如果没有被识别为 base64 或解码失败，保留原始字符串作为 decoded 值候选
        if (!decoded) {
          decoded = infoVal;
        }

        this.infoDecoded = decoded;
        console.log('Decoded AT+INFO? info:', decoded);

        // 尝试将解码后的文本解析为 JSON，以便读取模型名/版本/pic_url
        try {
          const parsed = JSON.parse(decoded as string);
          if (parsed && typeof parsed === 'object') {
            // model name/version
            if (parsed.model_name) this.modelMeta.name = parsed.model_name;
            if (!this.modelMeta.name && parsed.name) this.modelMeta.name = parsed.name;
            if (parsed.model_version) this.modelMeta.version = parsed.model_version;
            if (!this.modelMeta.version && parsed.version) this.modelMeta.version = parsed.version;

            // arguments may contain url/icon/size
            if (parsed.arguments && typeof parsed.arguments === 'object') {
              const args: any = parsed.arguments;
              if (args.icon && !this.modelMeta.pic_url) this.modelMeta.pic_url = args.icon;
              if (args.url && !this.modelMeta.pic_url) this.modelMeta.pic_url = args.url;

              // model size in KB (may be float)
              if (typeof args.size === 'number' || typeof args.size === 'string') {
                const sizeNum = Number(args.size);
                if (!isNaN(sizeNum)) {
                  this.modelInfo.size = Math.round(sizeNum * 1024); // if device reports KB, keep bytes; adjust if needed
                }
              }
            }

            // top-level model id
            if (parsed.model_id && !this.modelInfo.id) {
              const mid = Number(parsed.model_id);
              if (!isNaN(mid)) this.modelInfo.id = mid;
            }

            // classes list
            if (Array.isArray(parsed.classes)) {
              // store classes string in modelMeta for display
              (this.modelMeta as any).classes = parsed.classes;
            }

            // fallback pic_url
            if (!this.modelMeta.pic_url && parsed.pic_url) this.modelMeta.pic_url = parsed.pic_url;
          }
        } catch (err) {
          // 解析失败，保留解码后的字符串供显示
        }
      }

      // 如果解析后没有 pic_url，但 modelInfo 中有地址可用于后端映射，请保持现有逻辑
      this.cdr.detectChanges();
    } catch (error) {
      console.error('loadInfoFromDevice error:', error);
      throw error;
    }
  }

  /**
   * 加载当前配置
   */
  async loadCurrentConfig(): Promise<void> {
    try {
      // 获取模型信息
      this.modelInfo = await this.atService.getCurrentModel();
      
      // 获取传感器信息
      this.sensorInfo = await this.atService.getCurrentSensor();
      
      // 获取阈值配置
      this.scoreThreshold = await this.atService.getScoreThreshold();
      this.iouThreshold = await this.atService.getIouThreshold();
      
      console.log('当前配置:', {
        model: this.modelInfo,
        sensor: this.sensorInfo,
        score: this.scoreThreshold,
        iou: this.iouThreshold
      });
      
      this.message.success('配置信息加载完成');
    } catch (error) {
      console.error('获取配置失败:', error);
      this.message.warning('部分配置信息获取失败');
    }
  }

  /**
   * 应用分数阈值
   */
  async applyScoreThreshold(): Promise<void> {
    try {
      const newValue = await this.atService.setScoreThreshold(this.scoreThreshold);
      this.message.success(`分数阈值已设置为: ${newValue}`);
    } catch (error) {
      console.error('设置分数阈值失败:', error);
      this.message.error('设置失败: ' + (error as Error).message);
    }
  }

  /**
   * 应用 IoU 阈值
   */
  async applyIouThreshold(): Promise<void> {
    try {
      const newValue = await this.atService.setIouThreshold(this.iouThreshold);
      this.message.success(`IoU 阈值已设置为: ${newValue}`);
    } catch (error) {
      console.error('设置 IoU 阈值失败:', error);
      this.message.error('设置失败: ' + (error as Error).message);
    }
  }

  /**
   * 开始推理测试
   */
  async startInvoke(): Promise<void> {
    if (!this.isConnected) {
      this.message.warning('请先连接设备');
      return;
    }

    try {
      this.isInvoking = true;
      this.invokeResults = [];
      this.resultCount = 0;
      
      // 开始无限循环推理，仅返回结果（不含图像）
      await this.atService.startInvoke(-1, 0, 1);
      
      this.message.success('推理已启动');
    } catch (error) {
      console.error('启动推理失败:', error);
      this.isInvoking = false;
      this.message.error('启动推理失败: ' + (error as Error).message);
    }
  }

  /**
   * 停止推理
   */
  async stopInvoke(): Promise<void> {
    try {
      await this.atService.stopAllTasks();
      this.isInvoking = false;
      this.message.success('推理已停止');
    } catch (error) {
      console.error('停止推理失败:', error);
      this.message.error('停止推理失败: ' + (error as Error).message);
    }
  }

  /**
   * 处理推理结果（用于预览模式）
   */
  private handleInvokeResult(response: AtResponse): void {
    const result = response.data as InvokeResultData;
    
    console.log('[预览] 收到推理结果:', {
      hasImage: !!result.image,
      isPreviewMode: this.isPreviewMode,
      responseType: response.type,
      responseName: response.name
    });
    
    // 如果在预览模式，更新预览图片
    if (this.isPreviewMode && result.image) {
      this.previewImage = result.image;
      this.previewImageUrl = `data:image/jpeg;base64,${result.image}`;
      this.imageVersion++;
      this.lastUpdateTime = new Date().toLocaleTimeString();
      
      console.log('[预览] 更新图片:', {
        frameCount: result.count,
        imageLength: result.image?.length,
        imageVersion: this.imageVersion,
        timestamp: this.lastUpdateTime,
        previewImageUrl: this.previewImageUrl ? this.previewImageUrl.substring(0, 50) + '...' : null,
        imagePreview: result.image?.substring(0, 50) + '...'
      });
      
      // 强制触发变更检测以刷新图片显示
      this.cdr.detectChanges();
      
      console.log('[预览] detectChanges 已调用');
    } else if (!result.image) {
      console.warn('[预览] 结果中没有图片数据');
    }
    
    // 添加到结果列表（保留最近 20 个）
    this.invokeResults.unshift(result);
    if (this.invokeResults.length > 20) {
      this.invokeResults.pop();
    }
    
    this.resultCount++;
    // 更新类分数显示（若存在 classes 数据且 modelMeta.classes 已解析）
    try {
      this.updateClassScoresFromResult(result);
    } catch (err) {
      // 不要阻塞主流程，记录即可
      console.warn('更新 classScores 失败:', err);
    }
  }

  /**
   * 从推理结果中解析 classes 数据并更新 classScores 数组
   */
  private updateClassScoresFromResult(result: InvokeResultData): void {
    // 先确保有类名数组
    const labels: string[] = (this.modelMeta as any).classes || [];
    if (!labels || labels.length === 0) {
      // 无类名时清空分数
      this.classScores = [];
      return;
    }

    // 默认全部设为 0
    const scores = new Array(labels.length).fill(0);

    if (result && result.classes && Array.isArray(result.classes)) {
      // 两种可能的数据结构：
      // 1) [[score, target_id], ...]
      // 2) [score0, score1, score2, ...]
      const first = result.classes[0];
      if (Array.isArray(first)) {
        // 结构 1
        for (const entry of result.classes as number[][]) {
          if (!Array.isArray(entry) || entry.length === 0) continue;
          const score = Number(entry[0]);
          const id = entry.length > 1 ? Number(entry[1]) : undefined;
          if (!isNaN(score) && typeof id === 'number' && id >= 0 && id < scores.length) {
            scores[id] = this.normalizeScoreToPercent(score);
          }
        }
      } else {
        // 结构 2：直接按顺序映射
        for (let i = 0; i < (result.classes as any[]).length && i < scores.length; i++) {
          const v = Number((result.classes as any[])[i]);
          if (!isNaN(v)) scores[i] = this.normalizeScoreToPercent(v);
        }
      }
    }

    this.classScores = scores;
    this.cdr.detectChanges();
  }

  /**
   * 将各种可能的分数规范为 0-100 的百分比值
   */
  private normalizeScoreToPercent(raw: number): number {
    if (raw <= 1) {
      return Math.round(raw * 100);
    }
    if (raw > 1 && raw <= 100) {
      return Math.round(raw);
    }
    // 较大数值（极不常见）归一化处理
    return Math.round(Math.max(0, Math.min(100, raw)));
  }

  // 返回指定索引对应的条填充样式（颜色或渐变）
  getBarBackground(index: number): string {
    const c = this.barColors[index % this.barColors.length] || this.barColors[0];
    // 使用简单线性渐变以增强视觉
    return `linear-gradient(90deg, ${c}, ${c}CC)`;
  }

  /**
   * 开始实时预览
   */
  async startPreview(): Promise<void> {
    if (!this.isConnected) {
      this.message.warning('请先连接设备');
      return;
    }

    try {
      this.isPreviewMode = true;
      this.previewImage = null;
      this.previewImageUrl = null;
      this.imageVersion = 0;
      this.resultCount = 0;
      
      // 开始推理，包含图像数据: AT+INVOKE=-1,0,0
      await this.atService.startInvoke(-1, 0, 0);
      
      this.message.success('预览已启动');
    } catch (error) {
      console.error('启动预览失败:', error);
      this.isPreviewMode = false;
      this.message.error('启动预览失败: ' + (error as Error).message);
    }
  }

  /**
   * 停止实时预览
   */
  async stopPreview(): Promise<void> {
    try {
      // 发送 AT+BREAK 停止推理
      await this.atService.stopAllTasks();
      this.isPreviewMode = false;
      this.message.success('预览已停止');
    } catch (error) {
      console.error('停止预览失败:', error);
      this.message.error('停止预览失败: ' + (error as Error).message);
    }
  }

  /**
   * 刷新配置
   */
  async refreshConfig(): Promise<void> {
    if (!this.isConnected) {
      await this.connectToDevice();
      if (this.isConnected) {
        await this.loadDeviceInfo();
        await this.loadCurrentConfig();
      }
    } else {
      await this.loadCurrentConfig();
    }
  }

  /**
   * 重启设备
   */
  async rebootDevice(): Promise<void> {
    try {
      await this.atService.reboot();
      this.message.success('设备正在重启...');
      
      // 等待几秒后自动重新连接
      setTimeout(async () => {
        await this.connectToDevice();
        if (this.isConnected) {
          await this.loadDeviceInfo();
          await this.loadCurrentConfig();
        }
      }, 5000);
    } catch (error) {
      console.error('重启设备失败:', error);
      this.message.error('重启失败: ' + (error as Error).message);
    }
  }

  /**
   * 完成配置
   */
  completeConfig(): void {
    this.configComplete.emit();
  }

  /**
   * 返回部署页面
   */
  backToDeployPage(): void {
    this.backToDeploy.emit();
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
