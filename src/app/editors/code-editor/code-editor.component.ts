import { Component } from '@angular/core';
import { FileTreeComponent } from './components/file-tree/file-tree.component';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzModalService } from 'ng-zorro-antd/modal';
import { CommonModule } from '@angular/common';
import { ProjectService } from '../../services/project.service';
import { MonacoEditorComponent } from './components/monaco-editor/monaco-editor.component';
import { NoticeService } from '../../services/notice.service';
import { NotificationComponent } from '../../components/notification/notification.component';
import { ActivatedRoute } from '@angular/router';
import { NzLayoutComponent, NzLayoutModule } from "ng-zorro-antd/layout";
import { NzResizableModule, NzResizeEvent } from 'ng-zorro-antd/resizable';
import { NzMessageService } from 'ng-zorro-antd/message';
import { CmdService } from '../../services/cmd.service';
import { BuilderService } from '../../services/builder.service';
import { UploaderService } from '../../services/uploader.service';
import { ElectronService } from '../../services/electron.service';
import { CodeService } from './services/code.service';
import { ShortcutService, ShortcutAction, ShortcutKeyMapping } from './services/shortcut.service';
import { CodeIntelligenceService } from './services/code-intelligence.service';
import { Subscription } from 'rxjs';
import { ViewChild, AfterViewInit, OnInit, OnDestroy } from '@angular/core';

export interface OpenedFile {
  path: string;      // 文件路径
  title: string;     // 显示的文件名
  content: string;   // 文件内容
  isDirty: boolean;  // 是否有未保存的更改
  editorState?: {    // 编辑器状态
    scrollTop?: number;       // 滚动位置
    scrollLeft?: number;      // 水平滚动位置
    cursorPosition?: any;     // 光标位置
    selections?: any[];       // 选择区域
    viewState?: any;          // Monaco编辑器视图状态
  };
}

@Component({
  selector: 'app-code-editor',
  imports: [FileTreeComponent,
    NzTabsModule,
    MonacoEditorComponent,
    CommonModule,
    NotificationComponent,
    NzLayoutComponent,
    NzLayoutModule,
    NzResizableModule,
  ],
  templateUrl: './code-editor.component.html',
  styleUrl: './code-editor.component.scss'
})
export class CodeEditorComponent implements OnInit, AfterViewInit, OnDestroy {
  // Monaco编辑器组件引用
  @ViewChild(MonacoEditorComponent) monacoEditorRef!: MonacoEditorComponent;

  // 当前编辑器内容
  code: string = '';
  // 当前选中的文件路径
  selectedFile: string = '';
  // 当前打开的文件
  openedFiles: OpenedFile[] = [];
  // 当前选中的标签页索引
  selectedIndex = 0;

  loaded = false;

  // 快捷键订阅
  private shortcutSubscription?: Subscription;
  private keydownListener?: (event: KeyboardEvent) => void;
  
  // 定期保存状态的定时器
  private saveStateTimer?: any;

  get projectPath() {
    return this.projectService.currentProjectPath
  }

  sdkPath;
  librariesPath;

  constructor(
    private modal: NzModalService,
    private projectService: ProjectService,
    private activatedRoute: ActivatedRoute,
    private message: NzMessageService,
    private cmdService: CmdService,
    private builderService: BuilderService,
    private uploadService: UploaderService,
    private electronService: ElectronService,
    private codeService: CodeService,
    private shortcutService: ShortcutService,
    private codeIntelligenceService: CodeIntelligenceService,
  ) { }

  async ngOnInit() {
    this.activatedRoute.queryParams.subscribe(params => {
      if (params['path']) {
        console.log('project path', params['path']);
        try {
          this.loadProject(params['path']);
        } catch (error) {
          console.error('加载项目失败', error);
          this.message.error('加载项目失败，请检查项目文件是否完整');
        }
      } else {
        this.message.error('没有找到项目路径');
      }
    });

    // 初始化快捷键监听
    this.initShortcutListeners();

    // 启动定期保存编辑器状态的定时器（每5秒保存一次）
    this.saveStateTimer = setInterval(() => {
      this.saveCurrentTabState();
    }, 5000);

    window.history.replaceState(null, '', window.location.href);
    window.history.pushState(null, '', window.location.href);
  }

  ngOnDestroy(): void {
    // 保存当前标签页状态
    this.saveCurrentTabState();
    
    // 清理定时器
    if (this.saveStateTimer) {
      clearInterval(this.saveStateTimer);
    }
    
    // 清理clangd资源
    this.cleanupClangdResources();
    
    this.builderService.cancel();
    this.uploadService.cancel();
    this.cmdService.killArduinoCli();
    this.electronService.setTitle('aily blockly');
    
    // 清理快捷键监听器
    this.cleanupShortcutListeners();
  }

  /**
   * 清理clangd资源
   */
  private async cleanupClangdResources(): Promise<void> {
    try {
      // 关闭所有打开的文档
      for (const file of this.openedFiles) {
        if (this.isCppFile(file.path)) {
          await this.codeIntelligenceService.closeDocument(file.path);
        }
      }
      
      // 停止clangd服务
      await this.codeIntelligenceService.stopClangd();
      
      console.log('clangd resources cleaned up');
    } catch (error) {
      console.warn('Failed to cleanup clangd resources:', error);
    }
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.sdkPath = "D:\\Git\\aily-project-lod\\packages\\sdk\\avr\\avr@1.8.6";
      this.librariesPath = "C:\\Users\\coloz\\Documents\\Arduino\\sketch_mar16a\\libraries";
      
      // 初始化代码智能服务（包括clangd）
      this.initializeCodeIntelligence();
    }, 2000);
  }

  /**
   * 初始化代码智能服务
   */
  private async initializeCodeIntelligence(): Promise<void> {
    try {
      // 生成compile_commands.json以改善clangd补全效果
      await this.generateCompileCommands();
      
      // 初始化代码智能补全服务
      await this.codeIntelligenceService.initialize(
        this.sdkPath, 
        this.librariesPath, 
        this.projectPath
      );
      
      console.log('Code intelligence service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize code intelligence service:', error);
      this.message.warning('代码智能功能初始化失败，部分功能可能不可用');
    }
  }

  /**
   * 生成compile_commands.json文件
   */
  private async generateCompileCommands(): Promise<void> {
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI?.clangd) {
        const clangdAPI = (window as any).electronAPI.clangd;
        const result = await clangdAPI.generateCompileCommands(
          this.projectPath,
          this.sdkPath,
          this.librariesPath
        );
        
        if (result.success) {
          console.log('Generated compile_commands.json at:', result.outputPath);
        } else {
          console.warn('Failed to generate compile_commands.json:', result.error);
        }
      }
    } catch (error) {
      console.warn('Failed to generate compile_commands.json:', error);
    }
  }

  async loadProject(projectPath: string) {
    // 判断当前目录下是否有package.json和ino文件
    if (!this.electronService.exists(projectPath + '/package.json')) {
      const fileList = this.electronService.readDir(projectPath);
      if (this.hasFileWithExtension(fileList, '.ino')) {
        const projectName = projectPath.split(/[\/\\]/).filter(Boolean).pop() || ''
        const packageData = {
          version: '1.0.0',
          name: projectName,
          platform: 'arduino'
        }
        this.electronService.writeFile(projectPath + '/package.json', JSON.stringify(packageData))
      }
    }

    const packageJson = JSON.parse(this.electronService.readFile(`${projectPath}/package.json`));
    this.electronService.setTitle(`aily blockly - ${packageJson.name}`);
    this.projectService.currentPackageData = packageJson;
    // 添加到最近打开的项目
    this.projectService.addRecentlyProject({ name: packageJson.name, path: projectPath });
    // 设置当前项目路径和package.json数据
    this.projectService.currentPackageData = packageJson;
    this.projectService.currentProjectPath = projectPath;

    this.projectService.stateSubject.next('loaded');
    // 7. 后台安装开发板依赖
    // this.npmService.installBoardDeps()
    //   .then(() => {
    //     console.log('install board dependencies success');
    //   })
    //   .catch(err => {
    //     console.error('install board dependencies error', err);
    //   });
  }

  // 从文件树选择文件时触发
  async selectedFileChange(file: any) {
    // 先保存当前标签页的状态
    this.saveCurrentTabState();

    const filePath = file.path;
    // 检查文件是否已经打开
    const existingFileIndex = this.openedFiles.findIndex(f => f.path === filePath);

    if (existingFileIndex >= 0) {
      // 如果已经打开，切换到该标签页
      this.selectedIndex = existingFileIndex;
    } else {
      // 否则新建标签页
      const content = window['fs'].readFileSync(filePath);
      const newFile: OpenedFile = {
        path: filePath,
        title: file.title,
        content: content,
        isDirty: false,
        editorState: {} // 初始化编辑器状态
      };

      this.openedFiles.push(newFile);
      this.selectedIndex = this.openedFiles.length - 1;
      
      // 在clangd中打开文档
      await this.openDocumentInClangd(filePath, content);
    }

    // 延迟更新代码，确保界面已更新
    setTimeout(() => {
      this.updateCurrentCode();
    }, 0);
  }

  /**
   * 在clangd中打开文档
   */
  private async openDocumentInClangd(filePath: string, content: string): Promise<void> {
    try {
      // 只处理C/C++/Arduino文件
      if (this.isCppFile(filePath)) {
        await this.codeIntelligenceService.openDocument(filePath, content);
      }
    } catch (error) {
      console.warn('Failed to open document in clangd:', error);
    }
  }

  /**
   * 检查是否为C/C++/Arduino文件
   */
  private isCppFile(filePath: string): boolean {
    const extension = filePath.toLowerCase().split('.').pop();
    return ['cpp', 'c', 'h', 'hpp', 'ino', 'cc', 'cxx', 'hxx'].includes(extension || '');
  }

  // 更新当前编辑器内容
  async updateCurrentCode() {
    if (this.selectedIndex >= 0 && this.selectedIndex < this.openedFiles.length) {
      const currentFile = this.openedFiles[this.selectedIndex];
      console.log('更新编辑器内容:', currentFile.title, '存储的状态:', currentFile.editorState);
      this.code = currentFile.content;
      this.selectedFile = currentFile.path;
      
      // 延迟恢复编辑器状态，确保内容已经更新
      setTimeout(async () => {
        if (currentFile.editorState) {
          await this.restoreEditorState(currentFile.editorState);
        }
      }, 0);
    } else {
      this.code = '';
      this.selectedFile = '';
    }
  }

  // 关闭标签页
  closeTab({ index }: { index: number }): void {
    const file = this.openedFiles[index];

    if (file.isDirty) {
      // 如果文件有未保存的更改，弹出确认框
      this.modal.confirm({
        nzTitle: '确认关闭',
        nzContent: `${file.title} 有未保存的更改，是否保存？`,
        nzOkText: '保存',
        nzCancelText: '不保存',
        nzOnOk: () => {
          this.saveFile(index).then(() => {
            this.doCloseTab(index);
          });
        },
        nzOnCancel: () => {
          this.doCloseTab(index);
        }
      });
    } else {
      this.doCloseTab(index);
    }
  }

  // 实际执行关闭标签页的操作
  private async doCloseTab(index: number): Promise<void> {
    const file = this.openedFiles[index];
    
    // 在clangd中关闭文档
    await this.closeDocumentInClangd(file.path);
    
    this.openedFiles.splice(index, 1);

    // 如果关闭的是当前选中的标签页，需要调整选中索引
    if (index === this.selectedIndex) {
      // 如果关闭的是最后一个标签页，选中前一个
      if (index === this.openedFiles.length) {
        this.selectedIndex = Math.max(0, index - 1);
      }
      // 否则保持当前索引，因为后面的标签会前移
      this.updateCurrentCode();
    } else if (index < this.selectedIndex) {
      // 如果关闭的标签在当前选中标签之前，需要调整索引
      this.selectedIndex--;
    }
  }

  /**
   * 在clangd中关闭文档
   */
  private async closeDocumentInClangd(filePath: string): Promise<void> {
    try {
      if (this.isCppFile(filePath)) {
        await this.codeIntelligenceService.closeDocument(filePath);
      }
    } catch (error) {
      console.warn('Failed to close document in clangd:', error);
    }
  }

  // 保存文件
  async saveFile(index: number): Promise<void> {
    const file = this.openedFiles[index];
    window['fs'].writeFileSync(file.path, file.content);
    file.isDirty = false;
    
    // 通知clangd文档已保存
    await this.saveDocumentInClangd(file.path, file.content);
  }

  // 保存当前文件
  async saveCurrentFile(): Promise<void> {
    if (this.selectedIndex >= 0 && this.selectedIndex < this.openedFiles.length) {
      await this.saveFile(this.selectedIndex);
    }
  }

  /**
   * 在clangd中保存文档
   */
  private async saveDocumentInClangd(filePath: string, content: string): Promise<void> {
    try {
      if (this.isCppFile(filePath)) {
        await this.codeIntelligenceService.saveDocument(filePath, content);
      }
    } catch (error) {
      console.warn('Failed to save document in clangd:', error);
    }
  }

  // 标签页切换事件
  onTabChange(index: number): void {
    console.log('切换标签页:', index, '当前选中:', this.selectedIndex);
    
    // 如果切换到的是当前标签页，不需要处理
    if (index === this.selectedIndex) {
      return;
    }
    
    // 先保存当前标签页的状态
    this.saveCurrentTabState();
    
    this.selectedIndex = index;
    
    // 延迟更新代码，确保标签页切换动画完成
    setTimeout(() => {
      this.updateCurrentCode();
    }, 0);
  }

  // 保存当前标签页的编辑器状态
  private saveCurrentTabState(): void {
    if (this.selectedIndex >= 0 && this.selectedIndex < this.openedFiles.length) {
      const currentFile = this.openedFiles[this.selectedIndex];
      const editorState = this.getEditorState();
      console.log('保存标签页状态:', currentFile.title, 'selectedIndex:', this.selectedIndex, 'editorState:', editorState);
      if (editorState) {
        currentFile.editorState = editorState;
        console.log('状态保存成功，视图状态:', editorState.viewState);
      } else {
        console.log('获取编辑器状态失败');
      }
    }
  }

  // 获取编辑器状态
  private getEditorState(): any {
    try {
      const monacoComponent = this.getMonacoEditorComponent();
      if (monacoComponent) {
        const editor = monacoComponent.getEditorInstance();
        if (editor && editor.getModel()) {
          const viewState = monacoComponent.getViewState();
          if (viewState) {
            return { viewState };
          }
        }
      }
    } catch (error) {
      console.warn('获取编辑器状态失败:', error);
    }
    return null;
  }

  // 恢复编辑器状态
  private async restoreEditorState(editorState: any): Promise<void> {
    if (!editorState || !editorState.viewState) {
      console.log('没有需要恢复的编辑器状态');
      return;
    }

    console.log('恢复编辑器状态:', editorState);

    try {
      const monacoComponent = this.getMonacoEditorComponent();
      if (monacoComponent) {
        const success = await monacoComponent.restoreViewStateSafely(editorState.viewState);
        if (success) {
          console.log('编辑器状态恢复成功');
        } else {
          console.warn('编辑器状态恢复失败');
        }
      } else {
        console.warn('Monaco编辑器组件未找到');
      }
    } catch (error) {
      console.warn('恢复编辑器状态异常:', error);
    }
  }

  // 获取Monaco编辑器组件引用
  private getMonacoEditorComponent(): MonacoEditorComponent | null {
    return this.monacoEditorRef || null;
  }

  // 编辑器内容变更事件
  onCodeChange(newContent: string): void {
    if (this.selectedIndex >= 0 && this.selectedIndex < this.openedFiles.length) {
      const currentFile = this.openedFiles[this.selectedIndex];
      if (currentFile.content !== newContent) {
        currentFile.content = newContent;
        currentFile.isDirty = true;
        
        // 异步更新clangd中的文档内容，不等待完成
        this.updateDocumentInClangd(currentFile.path, newContent);
      }
    }
  }

  /**
   * 在clangd中更新文档内容
   */
  private async updateDocumentInClangd(filePath: string, content: string): Promise<void> {
    try {
      if (this.isCppFile(filePath)) {
        await this.codeIntelligenceService.updateDocument(filePath, content);
      }
    } catch (error) {
      console.warn('Failed to update document in clangd:', error);
    }
  }

  // 处理文件删除事件
  onFilesDeleted(deletedPaths: string[]): void {
    console.log('Files deleted:', deletedPaths);
    
    if (deletedPaths.length === 0) {
      return;
    }
    
    // 记录需要关闭的标签页索引，从后往前删除以避免索引变化问题
    const tabsToClose: number[] = [];
    
    // 查找需要关闭的标签页
    for (let i = this.openedFiles.length - 1; i >= 0; i--) {
      const file = this.openedFiles[i];
      if (deletedPaths.includes(file.path)) {
        tabsToClose.push(i);
        console.log('Found tab to close:', file.title, 'at index', i);
      }
    }
    
    if (tabsToClose.length === 0) {
      return;
    }
    
    // 检查被删除的文件中是否有未保存的更改
    const unsavedFiles = tabsToClose
      .map(index => this.openedFiles[index])
      .filter(file => file.isDirty);
    
    if (unsavedFiles.length > 0) {
      // 如果有未保存的文件，显示确认对话框
      const fileNames = unsavedFiles.map(f => f.title).join(', ');
      this.modal.confirm({
        nzTitle: '文件已被删除',
        nzContent: `以下文件已被删除但有未保存的更改：${fileNames}。是否关闭这些标签页？`,
        nzOkText: '关闭',
        nzCancelText: '保留',
        nzOnOk: () => {
          this.closeDeletedTabs(tabsToClose);
        }
      });
    } else {
      // 没有未保存的更改，直接关闭
      this.closeDeletedTabs(tabsToClose);
    }
  }

  // 关闭被删除文件的标签页
  private closeDeletedTabs(tabIndices: number[]): void {
    console.log('Closing deleted tabs:', tabIndices);
    
    // 从后往前删除，避免索引变化问题
    for (const index of tabIndices) {
      const file = this.openedFiles[index];
      console.log('Closing tab:', file.title, 'at index', index);
      
      // 直接删除，不需要保存确认（文件已经被删除了）
      this.openedFiles.splice(index, 1);
    }
    
    // 调整当前选中的标签索引
    this.adjustSelectedIndexAfterClose(tabIndices);
    
    // 更新编辑器内容
    this.updateCurrentCode();
    
    // 显示提示信息
    this.message.info(`已关闭 ${tabIndices.length} 个已删除文件的标签页`);
  }

  // 在删除多个标签页后调整选中索引
  private adjustSelectedIndexAfterClose(closedIndices: number[]): void {
    if (this.openedFiles.length === 0) {
      this.selectedIndex = 0;
      return;
    }
    
    // 计算有多少个在当前选中索引之前的标签被关闭了
    const closedBeforeCurrent = closedIndices.filter(index => index < this.selectedIndex).length;
    
    // 调整选中索引
    this.selectedIndex = Math.max(0, this.selectedIndex - closedBeforeCurrent);
    
    // 确保索引不超出范围
    if (this.selectedIndex >= this.openedFiles.length) {
      this.selectedIndex = Math.max(0, this.openedFiles.length - 1);
    }
    
    console.log('Adjusted selected index to:', this.selectedIndex);
  }

  // 处理鼠标中键点击事件
  handleMiddleClick(event: MouseEvent, index: number): void {
    // 鼠标中键的button值为1
    if (event.button === 1) {
      // 阻止默认行为（如在某些浏览器中的自动滚动）
      event.preventDefault();
      // 关闭对应的标签页
      this.doCloseTab(index);
    }
  }


  siderWidth = 250;
  onSideResize({ width }: NzResizeEvent): void {
    this.siderWidth = width!;
  }

  /**
 * 检查文件列表中是否包含指定后缀的文件
 * @param fileList 文件列表
 * @param extension 文件后缀（如 '.ino', '.cpp', '.h' 等）
 * @returns 如果包含指定后缀的文件返回 true，否则返回 false
 */
  private hasFileWithExtension(fileList: Array<{ name: string; parentPath: string; path: string }>, extension: string): boolean {
    return fileList.some(file => file.name.toLowerCase().endsWith(extension.toLowerCase()));
  }

  /**
   * 初始化快捷键监听器
   */
  private initShortcutListeners(): void {
    // 监听快捷键事件
    this.shortcutSubscription = this.shortcutService.shortcutKey$.subscribe(action => {
      this.handleShortcutAction(action);
    });

    // 添加全局键盘事件监听器
    this.keydownListener = (event: KeyboardEvent) => {
      this.handleKeyDown(event);
    };
    document.addEventListener('keydown', this.keydownListener);
  }

  /**
   * 清理快捷键监听器
   */
  private cleanupShortcutListeners(): void {
    if (this.shortcutSubscription) {
      this.shortcutSubscription.unsubscribe();
      this.shortcutSubscription = undefined;
    }

    if (this.keydownListener) {
      document.removeEventListener('keydown', this.keydownListener);
      this.keydownListener = undefined;
    }
  }

  /**
   * 处理键盘按下事件
   * @param event 键盘事件
   */
  private handleKeyDown(event: KeyboardEvent): void {
    // 检查是否在代码编辑器区域内
    const target = event.target as HTMLElement;
    if (!target || !target.closest('.code-editor')) {
      return;
    }

    const shortcutKey = this.shortcutService.getShortcutFromEvent(event);
    const action = this.shortcutService.getShortcutAction(shortcutKey, 'editor');
    
    if (action) {
      event.preventDefault();
      this.handleShortcutAction(action);
    }
  }

  /**
   * 处理快捷键动作
   * @param action 动作对象
   */
  private handleShortcutAction(action: ShortcutAction): void {
    switch (action.type) {
      case 'save':
        this.handleSaveShortcut();
        break;
      case 'close':
        this.handleCloseShortcut();
        break;
      case 'find':
        this.message.info('查找功能正在开发中...');
        break;
      case 'replace':
        this.message.info('替换功能正在开发中...');
        break;
      case 'open':
        this.message.info('打开文件功能正在开发中...');
        break;
      default:
        console.log('未知的快捷键动作:', action.type);
        break;
    }
  }

  /**
   * 处理关闭标签页快捷键
   */
  private handleCloseShortcut(): void {
    if (this.openedFiles.length === 0) {
      this.message.info('没有打开的文件');
      return;
    }

    if (this.selectedIndex < 0 || this.selectedIndex >= this.openedFiles.length) {
      this.message.error('没有选中的文件');
      return;
    }

    // 关闭当前选中的标签页
    this.closeTab({ index: this.selectedIndex });
  }

  /**
   * 处理保存快捷键
   */
  private handleSaveShortcut(): void {
    if (this.openedFiles.length === 0) {
      this.message.info('没有打开的文件');
      return;
    }

    if (this.selectedIndex < 0 || this.selectedIndex >= this.openedFiles.length) {
      this.message.error('没有选中的文件');
      return;
    }

    const currentFile = this.openedFiles[this.selectedIndex];
    if (!currentFile.isDirty) {
      this.message.info(`文件 ${currentFile.title} 没有需要保存的更改`);
      return;
    }

    try {
      this.saveCurrentFile();
      this.message.success(`文件 ${currentFile.title} 保存成功`);
    } catch (error) {
      console.error('保存文件失败:', error);
      this.message.error(`保存文件 ${currentFile.title} 失败`);
    }
  }

  /**
   * 获取所有可用的快捷键
   * @returns 快捷键列表
   */
  getAvailableShortcuts(): ShortcutKeyMapping[] {
    return this.shortcutService.getAllShortcuts().filter(shortcut => 
      shortcut.context === 'editor' || shortcut.context === 'global'
    );
  }

  /**
   * 显示快捷键帮助
   */
  showShortcutHelp(): void {
    const shortcuts = this.getAvailableShortcuts();
    const helpText = shortcuts.map(shortcut => 
      `${shortcut.key.toUpperCase()} - ${shortcut.description}`
    ).join('\n');
    
    this.modal.info({
      nzTitle: '快捷键帮助',
      nzContent: `<pre style="white-space: pre-wrap;">${helpText}</pre>`,
      nzWidth: 500
    });
  }
}
