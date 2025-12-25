import { Component, ElementRef, ViewChild } from '@angular/core';
import { SubWindowComponent } from '../../components/sub-window/sub-window.component';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzInputModule } from 'ng-zorro-antd/input';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { UiService } from '../../services/ui.service';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { SettingsService } from '../../services/settings.service';
import { TranslationService } from '../../services/translation.service';
import { ConfigService } from '../../services/config.service';
import { SimplebarAngularModule } from 'simplebar-angular';
import { TranslateModule } from '@ngx-translate/core';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { setServerUrl, setRegistryUrl } from '../../configs/api.config';

@Component({
  selector: 'app-settings',
  imports: [
    CommonModule,
    FormsModule,
    SubWindowComponent,
    NzButtonModule,
    NzInputModule,
    NzRadioModule,
    SimplebarAngularModule,
    TranslateModule,
    NzSwitchModule,
    NzSelectModule
  ],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent {
  @ViewChild('scrollContainer', { static: false }) scrollContainer: ElementRef;

  activeSection = 'SETTINGS.SECTIONS.BASIC'; // 当前活动的部分

  // simplebar 配置选项
  options = {
    autoHide: true,
    scrollbarMinSize: 50
  };

  items = [
    {
      name: 'SETTINGS.SECTIONS.BASIC',
      icon: 'fa-light fa-gear'
    },
    {
      name: 'SETTINGS.SECTIONS.THEME',
      icon: 'fa-light fa-gift'
    },
    // {
    //   name: 'SETTINGS.SECTIONS.COMPILATION',
    //   icon: 'fa-light fa-screwdriver-wrench'
    // },
    {
      name: 'SETTINGS.SECTIONS.BLOCKLY',
      icon: 'fa-light fa-puzzle-piece'
    },
    {
      name: 'SETTINGS.SECTIONS.REPOSITORY',
      icon: 'fa-light fa-book-bookmark'
    },
    {
      name: 'SETTINGS.SECTIONS.DEPENDENCIES',
      icon: 'fa-light fa-layer-group'
    },
    // {
    //   name: 'SETTINGS.SECTIONS.MCP',
    //   icon: 'fa-light fa-webhook'
    // },
    {
      name: 'SETTINGS.SECTIONS.DEVMODE',
      icon: 'fa-light fa-gear-code'
    },
  ];

  // 用于跟踪安装/卸载状态
  boardOperations = {};

  // 搜索关键字
  boardSearchKeyword: string = '';

  get boardList() {
    return this.settingsService.boardList.concat(
      this.settingsService.toolList,
      this.settingsService.sdkList,
      this.settingsService.compilerList
    );;
  }

  // 过滤后的开发板列表
  get filteredBoardList() {
    if (!this.boardSearchKeyword || this.boardSearchKeyword.trim() === '') {
      return this.boardList;
    }
    const keyword = this.boardSearchKeyword.toLowerCase().trim();
    return this.boardList.filter(board => 
      board.name.toLowerCase().includes(keyword) ||
      (board.version && board.version.toLowerCase().includes(keyword))
    );
  }

  get npmRegistryList() {
    return this.configData.npm_registry;
  }

  get apiServerList() {
    return this.configData.api_server;
  }

  async onNpmRegistryChange(value: string) {
    const index = this.configData.npm_registry.indexOf(value);
    if (index > -1) {
      this.configData.npm_registry.splice(index, 1);
      this.configData.npm_registry.unshift(value);
    }
    // 更新 API 配置模块的缓存，确保渲染进程中立即生效
    setRegistryUrl(value);
    // 设置环境变量，确保生效
    if (window['process']?.env) {
      window['process'].env['AILY_NPM_REGISTRY'] = value;
    }
    // 通过 ipcRenderer 通知主进程更新环境变量
    if (window['ipcRenderer']) {
      window['ipcRenderer'].invoke('env-set', { key: 'AILY_NPM_REGISTRY', value: value });
    }
    await this.updateBoardList();
    // 立即保存到config.json，确保下次进入设置时读取到最新值
    this.configService.save();
  }

  onApiServerChange(value: string) {
    const index = this.configData.api_server.indexOf(value);
    if (index > -1) {
      this.configData.api_server.splice(index, 1);
      this.configData.api_server.unshift(value);
    }
    // 更新 API 配置模块的缓存，确保渲染进程中立即生效
    setServerUrl(value);
    // 设置环境变量，确保生效
    if (window['process']?.env) {
      window['process'].env['AILY_API_SERVER'] = value;
    }
    // 通过 ipcRenderer 通知主进程更新环境变量
    if (window['ipcRenderer']) {
      window['ipcRenderer'].invoke('env-set', { key: 'AILY_API_SERVER', value: value });
    }
    // 立即保存到config.json，确保下次进入设置时读取到最新值
    this.configService.save();
  }

  get langList() {
    return this.translationService.languageList;
  }

  get currentLang() {
    return this.translationService.getSelectedLanguage();
  }

  get configData() {
    return this.configService.data;
  }

  appdata_path: string

  mcpServiceList = []

  selectedNpmRegistry: string;
  selectedApiServer: string;

  constructor(
    private uiService: UiService,
    private settingsService: SettingsService,
    private translationService: TranslationService,
    private configService: ConfigService,
  ) {
  }

  async ngOnInit() {
    await this.configService.init();
    // 从环境变量读取当前选中的地址（main.js中initFastestServers检测后设置的最快地址）
    // 如果环境变量不存在则使用配置的第一个
    this.selectedNpmRegistry = window['process']?.env?.['AILY_NPM_REGISTRY'] || this.configData.npm_registry[0];
    this.selectedApiServer = window['process']?.env?.['AILY_API_SERVER'] || this.configData.api_server[0];
  }

  async ngAfterViewInit() {
    await this.updateBoardList();
  }

  async updateBoardList() {
    const platform = this.configService.data.platform;
    // this.appdata_path = this.configService.data.appdata_path[platform].replace('%HOMEPATH%', window['path'].getUserHome());
    this.appdata_path = window['path'].getAppDataPath();
    // 使用当前选中的仓库地址（已同步到环境变量）
    const npmRegistry = this.selectedNpmRegistry || window['process']?.env?.['AILY_NPM_REGISTRY'] || this.configService.data.npm_registry[0];
    // this.settingsService.getBoardList(this.appdata_path, npmRegistry);
    this.settingsService.getToolList(this.appdata_path, npmRegistry);
    this.settingsService.getSdkList(this.appdata_path, npmRegistry);
    this.settingsService.getCompilerList(this.appdata_path, npmRegistry);
  }

  selectLang(lang) {
    this.translationService.setLanguage(lang.code);
    window['ipcRenderer'].send('setting-changed', { action: 'language-changed', data: lang.code });
  }

  // 使用锚点滚动到指定部分
  scrollToSection(item) {
    this.activeSection = item.name;
    const element = document.getElementById(item.name);
    if (element && this.scrollContainer) {
      // 针对simplebar调整滚动方法
      const simplebarInstance = this.scrollContainer['SimpleBar'];
      if (simplebarInstance) {
        simplebarInstance.getScrollElement().scrollTo({
          top: element.offsetTop - 12,
          behavior: 'smooth'
        });
      }
    }
  }

  // 监听滚动事件以更新活动菜单项
  onScroll() {
    const sections = document.querySelectorAll('.section');
    let scrollElement;

    // 获取simplebar的滚动元素
    const simplebarInstance = this.scrollContainer['SimpleBar'];
    if (simplebarInstance) {
      scrollElement = simplebarInstance.getScrollElement();
    } else {
      return;
    }

    const scrollPosition = scrollElement.scrollTop;

    sections.forEach((section: HTMLElement) => {
      const sectionTop = section.offsetTop;
      const sectionHeight = section.offsetHeight;

      if (scrollPosition >= sectionTop - 50 &&
        scrollPosition < sectionTop + sectionHeight - 50) {
        this.activeSection = section.id.replace('section-', '');
      }
    });
  }

  cancel() {
    this.uiService.closeWindow();
  }

  apply() {
    // 保存到config.json，如有需要立即加载的，再加载
    this.configService.save();
     window['ipcRenderer'].send('setting-changed', { action: 'devmode-changed', data: this.configData.devmode });
    // 保存完毕后关闭窗口
    this.uiService.closeWindow();
  }

  async uninstall(board) {
    this.boardOperations[board.name] = { status: 'loading' };
    const result = await this.settingsService.uninstall(board)
    if (result === 'success') {
      board.installed = false;
    }
    else if (result === 'failed') {
      this.boardOperations[board.name] = { status: 'failed' };
    }
  }

  async install(board) {
    this.boardOperations[board.name] = { status: 'loading' };
    const result = await this.settingsService.install(board)
    if (result === 'success') {
      board.installed = true;
    }
    else if (result === 'failed') {
      this.boardOperations[board.name] = { status: 'failed' };
    }
  }

  onDevModeChange() {
    // this.configData.devmode = this.configData.devmode;
  }

  // 搜索框变化处理
  onBoardSearchChange() {
    // 搜索逻辑已通过 filteredBoardList getter 实现
    // 这里可以添加额外的处理逻辑，如防抖等
  }
}
