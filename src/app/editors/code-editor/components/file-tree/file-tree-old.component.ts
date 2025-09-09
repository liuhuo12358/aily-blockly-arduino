import { Component, EventEmitter, Input, Output, OnInit } from '@angular/core';
import { CollectionViewer, DataSource, SelectionChange } from '@angular/cdk/collections';
import { FlatTreeControl } from '@angular/cdk/tree';
import { SelectionModel } from '@angular/cdk/collections';
import { NzTreeViewModule } from 'ng-zorro-antd/tree-view';
import { FileService } from '../../file.service';
import { CommonModule } from '@angular/common';
import { BehaviorSubject, Observable, merge } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { MenuComponent } from '../../../../components/menu/menu.component';
import {
  FILE_RIGHTCLICK_MENU,
  FOLDER_RIGHTCLICK_MENU,
  ROOT_RIGHTCLICK_MENU
} from './menu.config';
import { IMenuItem } from '../../../../configs/menu.config';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { ElectronService } from '../../../../services/electron.service';

// 文件节点接口定义
interface FileNode {
  title: string;
  key: string;
  isLeaf: boolean;
  path: string;
  children?: FileNode[];
}

// 原始文件节点接口
interface FileNode {
  title: string;
  key: string;
  isLeaf: boolean;
  path: string;
  children?: FileNode[];
}

// 扁平化的文件节点接口
interface FlatFileNode extends FileNode {
  expandable: boolean;
  level: number;
  loading?: boolean;
}

// 动态数据源类
class DynamicFileDataSource implements DataSource<FlatFileNode> {
  private flattenedData: BehaviorSubject<FlatFileNode[]>;
  private childrenLoadedSet = new Set<FlatFileNode>();

  constructor(
    private treeControl: FlatTreeControl<FlatFileNode>,
    private fileService: FileService,
    initData: FlatFileNode[]
  ) {
    this.flattenedData = new BehaviorSubject<FlatFileNode[]>(initData);
    treeControl.dataNodes = initData;
  }

  connect(collectionViewer: CollectionViewer): Observable<FlatFileNode[]> {
    const changes = [
      collectionViewer.viewChange,
      this.treeControl.expansionModel.changed.pipe(tap(change => this.handleExpansionChange(change))),
      this.flattenedData.asObservable()
    ];
    return merge(...changes).pipe(map(() => this.expandFlattenedNodes(this.flattenedData.getValue())));
  }

  expandFlattenedNodes(nodes: FlatFileNode[]): FlatFileNode[] {
    const treeControl = this.treeControl;
    const results: FlatFileNode[] = [];
    const currentExpand: boolean[] = [];
    currentExpand[0] = true;

    nodes.forEach(node => {
      let expand = true;
      for (let i = 0; i <= treeControl.getLevel(node); i++) {
        expand = expand && currentExpand[i];
      }
      if (expand) {
        results.push(node);
      }
      if (treeControl.isExpandable(node)) {
        currentExpand[treeControl.getLevel(node) + 1] = treeControl.isExpanded(node);
      }
    });
    return results;
  }

  handleExpansionChange(change: SelectionChange<FlatFileNode>): void {
    if (change.added) {
      change.added.forEach(node => this.loadChildren(node));
    }
  }

  loadChildren(node: FlatFileNode): void {
    if (this.childrenLoadedSet.has(node)) {
      return;
    }
    node.loading = true;

    // 使用 fileService 加载子文件夹内容
    const children = this.fileService.readDir(node.path);
    const flatChildren: FlatFileNode[] = children.map(child => ({
      expandable: !child.isLeaf,
      title: child.title,
      level: node.level + 1,
      key: child.key,
      isLeaf: child.isLeaf,
      path: child['path']
    }));

    node.loading = false;
    const flattenedData = this.flattenedData.getValue();
    const index = flattenedData.indexOf(node);
    if (index !== -1) {
      flattenedData.splice(index + 1, 0, ...flatChildren);
      this.childrenLoadedSet.add(node);
    }
    this.flattenedData.next(flattenedData);
  }

  disconnect(): void {
    this.flattenedData.complete();
  }

  // 更新根数据
  setRootData(data: FlatFileNode[]): void {
    this.childrenLoadedSet.clear();
    this.flattenedData.next(data);
    this.treeControl.dataNodes = data;
  }

  // 获取当前数据
  getCurrentData(): FlatFileNode[] {
    return this.flattenedData.getValue();
  }
}

@Component({
  selector: 'app-file-tree',
  imports: [
    NzTreeViewModule,
    CommonModule,
    MenuComponent
  ],
  templateUrl: './file-tree.component.html',
  styleUrl: './file-tree.component.scss'
})
export class FileTreeComponent implements OnInit {

  @Input() rootPath: string;
  @Input() selectedFile;
  @Output() selectedFileChange = new EventEmitter();

  isLoading = false;

  options = {
    autoHide: true,
    clickOnTrack: true,
    scrollbarMinSize: 50,
  };

  // 选择模型 - 用于跟踪选中的节点
  nodeSelection = new SelectionModel<FlatFileNode>();

  // 树控件 - 使用 FlatTreeControl
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - 已知的弃用警告，等待 ng-zorro-antd 更新
  treeControl = new FlatTreeControl<FlatFileNode>(
    node => node.level,
    node => node.expandable
  );

  // 动态数据源
  dataSource: DynamicFileDataSource;

  // 显示右键菜单
  showRightClickMenu = false;
  rightClickMenuPosition = { x: null, y: null };
  configList: IMenuItem[] = [];
  currentSelectedNode: FlatFileNode | null = null;

  constructor(
    private fileService: FileService
  ) {
    // 初始化时创建空的数据源
    this.dataSource = new DynamicFileDataSource(this.treeControl, this.fileService, []);
  }

  ngOnInit() {
    this.loadRootPath();
  }

  ngAfterViewInit() {
    setTimeout(() => {
      const files = this.dataSource.getCurrentData();
      const inoFile = files.find(f => f.isLeaf && f.title.endsWith('.ino'));
      if (inoFile) {
        this.openFile(inoFile);
      }
    }, 0);
  }

  loadRootPath(path = this.rootPath): void {
    const files = this.fileService.readDir(path);
    console.log('Loaded root path files:', files);

    // 转换为扁平节点格式
    const flatFiles: FlatFileNode[] = files.map(file => ({
      expandable: !file.isLeaf,
      title: file.title,
      level: 0,
      key: file.key,
      isLeaf: file.isLeaf,
      path: file['path']
    }));

    this.dataSource.setRootData(flatFiles);
  }

  // 判断节点是否有子节点
  hasChild = (_: number, node: FlatFileNode): boolean => node.expandable;

  // 当节点被点击时
  nodeClick(node: FlatFileNode): void {
    if (node.isLeaf) {
      this.openFile(node);
    } else {
      this.openFolder(node);
    }
  }

  menuList;
  onRightClick(event: MouseEvent, node: FlatFileNode = null) {
    event.preventDefault(); // 阻止浏览器默认右键菜单

    // 如果是在文件或文件夹节点上右键，阻止事件冒泡
    if (node) {
      event.stopPropagation();
    }

    if (!node) {
      const rootNode: FlatFileNode = {
        expandable: true,
        title: 'root',
        level: 0,
        key: 'root',
        isLeaf: false,
        path: this.rootPath
      };
      this.currentSelectedNode = rootNode;
      this.menuList = ROOT_RIGHTCLICK_MENU;
    } else if (node.isLeaf) {
      // 如果没有传入节点，则是点击了Root
      this.menuList = FILE_RIGHTCLICK_MENU;
    } else {
      this.menuList = FOLDER_RIGHTCLICK_MENU;
    }

    // 设置当前选中的节点
    this.currentSelectedNode = node;

    // 获取当前鼠标点击位置
    this.rightClickMenuPosition.x = event.clientX;
    this.rightClickMenuPosition.y = event.clientY;

    // 根据节点类型和多选状态设置菜单
    // this.setContextMenu(node);

    this.showRightClickMenu = true;
  }

  onMenuItemClick(menuItem: IMenuItem) {
    console.log('Menu item clicked:', menuItem, 'Node:', this.currentSelectedNode);

    // 隐藏菜单
    this.showRightClickMenu = false;

    // 处理菜单项点击事件
    this.handleMenuAction(menuItem);
  }

  private handleMenuAction(menuItem: IMenuItem) {
    if (!this.currentSelectedNode) return;

    const node = this.currentSelectedNode;
    const selectedNodes = this.nodeSelection.selected;

    switch (menuItem.action) {
      case 'file-copy':
      case 'folder-copy':
      case 'multi-copy':
        this.copyToClipboard(selectedNodes.length > 1 ? selectedNodes : [node]);
        break;

      case 'file-cut':
      case 'folder-cut':
      case 'multi-cut':
        this.cutToClipboard(selectedNodes.length > 1 ? selectedNodes : [node]);
        break;

      case 'file-paste':
      case 'folder-paste':
        this.pasteFromClipboard(node);
        break;

      case 'file-rename':
      case 'folder-rename':
        this.renameNode(node);
        break;

      case 'file-delete':
      case 'folder-delete':
      case 'multi-delete':
        this.deleteNodes(selectedNodes.length > 1 ? selectedNodes : [node]);
        break;

      case 'folder-new-file':
        this.createNewFile(node);
        break;

      case 'folder-new-folder':
        this.createNewFolder(node);
        break;

      case 'file-copy-path':
      case 'folder-copy-path':
        this.copyPathToClipboard(node, false);
        break;

      case 'file-copy-relative-path':
      case 'folder-copy-relative-path':
        this.copyPathToClipboard(node, true);
        break;

      case 'reveal-in-explorer':
        this.revealInExplorer(node);
        break;

      case 'open-in-terminal':
        this.openInTerminal(node);
        break;

      case 'file-properties':
      case 'folder-properties':
        this.showProperties(node);
        break;

      default:
        console.log('Unhandled menu action:', menuItem.action);
    }
  }

  // 菜单操作方法的实现
  private copyToClipboard(nodes: FlatFileNode[]) {
    this.fileService.copyToClipboard(nodes);
  }

  private cutToClipboard(nodes: FlatFileNode[]) {
    console.log('Cut to clipboard:', nodes.map(n => n.path));
    this.clipboard = { 
      nodes: [...nodes], 
      operation: 'cut' 
    };
    
    // 使用Electron的clipboard API复制路径到系统剪贴板
    try {
      const paths = nodes.map(n => n.path).join('\n');
      navigator.clipboard.writeText(paths).then(() => {
        this.message.success(`已剪切 ${nodes.length} 个项目到剪贴板`);
      }).catch(() => {
        // 降级方案：如果clipboard API不可用，只保存到内部剪贴板
        this.message.success(`已剪切 ${nodes.length} 个项目（内部剪贴板）`);
      });
    } catch (error) {
      console.error('剪切到剪贴板失败:', error);
      this.message.success(`已剪切 ${nodes.length} 个项目（内部剪贴板）`);
    }
  }

  private async pasteFromClipboard(targetNode: FlatFileNode) {
    console.log('Paste to:', targetNode.path);
    
    if (this.clipboard.nodes.length === 0 || !this.clipboard.operation) {
      this.message.warning('剪贴板为空');
      return;
    }

    // 确保目标是文件夹
    let targetPath = targetNode.path;
    if (targetNode.isLeaf) {
      // 如果是文件，使用其父目录
      targetPath = window['path'].dirname(targetPath);
    }

    try {
      const promises = this.clipboard.nodes.map(async (sourceNode) => {
        const sourcePath = sourceNode.path;
        const fileName = window['path'].basename(sourcePath);
        const destinationPath = window['path'].join(targetPath, fileName);

        // 检查是否存在同名文件/文件夹
        if (window['fs'].existsSync(destinationPath)) {
          throw new Error(`目标位置已存在同名项目: ${fileName}`);
        }

        if (this.clipboard.operation === 'copy') {
          // 复制操作
          if (sourceNode.isLeaf) {
            // 复制文件
            const content = window['fs'].readFileSync(sourcePath);
            window['fs'].writeFileSync(destinationPath, content);
          } else {
            // 复制文件夹
            window['fs'].copySync(sourcePath, destinationPath);
          }
        } else if (this.clipboard.operation === 'cut') {
          // 移动操作
          window['fs'].renameSync(sourcePath, destinationPath);
        }
      });

      await Promise.all(promises);

      // 成功后清空剪贴板（如果是剪切操作）
      if (this.clipboard.operation === 'cut') {
        this.clipboard = { nodes: [], operation: null };
      }

      this.message.success(`成功${this.clipboard.operation === 'copy' ? '复制' : '移动'} ${this.clipboard.nodes.length} 个项目`);
      
      // 刷新文件树
      this.refresh();
      
    } catch (error) {
      console.error('粘贴操作失败:', error);
      this.message.error(`粘贴失败: ${error.message}`);
    }
  }

  private renameNode(node: FlatFileNode) {
    console.log('Rename:', node.path);
    
    const currentName = window['path'].basename(node.path);
    
    this.modal.create({
      nzTitle: `重命名${node.isLeaf ? '文件' : '文件夹'}`,
      nzContent: `
        <div>
          <p>当前名称: ${currentName}</p>
          <input id="rename-input" type="text" value="${currentName}" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" />
        </div>
      `,
      nzOnOk: () => {
        const newName = (document.getElementById('rename-input') as HTMLInputElement)?.value?.trim();
        
        if (!newName) {
          this.message.error('请输入有效的名称');
          return false;
        }
        
        if (newName === currentName) {
          return true; // 没有变化，直接关闭
        }
        
        const parentDir = window['path'].dirname(node.path);
        const newPath = window['path'].join(parentDir, newName);
        
        try {
          // 检查新名称是否已存在
          if (window['fs'].existsSync(newPath)) {
            this.message.error('该名称已存在');
            return false;
          }
          
          // 执行重命名
          window['fs'].renameSync(node.path, newPath);
          this.message.success('重命名成功');
          
          // 刷新文件树
          this.refresh();
          
          return true;
        } catch (error) {
          console.error('重命名失败:', error);
          this.message.error(`重命名失败: ${error.message}`);
          return false;
        }
      }
    });
    
    // 延迟聚焦到输入框并选中文本
    setTimeout(() => {
      const input = document.getElementById('rename-input') as HTMLInputElement;
      if (input) {
        input.focus();
        if (node.isLeaf) {
          // 如果是文件，选中文件名（不包括扩展名）
          const lastDotIndex = currentName.lastIndexOf('.');
          if (lastDotIndex > 0) {
            input.setSelectionRange(0, lastDotIndex);
          } else {
            input.select();
          }
        } else {
          // 如果是文件夹，选中全部
          input.select();
        }
      }
    }, 100);
  }

  private deleteNodes(nodes: FlatFileNode[]) {
    console.log('Delete:', nodes.map(n => n.path));
    
    const fileCount = nodes.filter(n => n.isLeaf).length;
    const folderCount = nodes.filter(n => !n.isLeaf).length;
    
    let message = '确定要删除以下项目吗？\n\n';
    if (fileCount > 0) {
      message += `${fileCount} 个文件\n`;
    }
    if (folderCount > 0) {
      message += `${folderCount} 个文件夹\n`;
    }
    message += '\n此操作不可撤销！';
    
    this.modal.confirm({
      nzTitle: '确认删除',
      nzContent: message.replace(/\n/g, '<br>'),
      nzOkText: '删除',
      nzOkType: 'primary',
      nzOkDanger: true,
      nzCancelText: '取消',
      nzOnOk: () => {
        try {
          for (const node of nodes) {
            if (node.isLeaf) {
              // 删除文件
              window['fs'].unlinkSync(node.path);
            } else {
              // 删除文件夹
              window['fs'].rmdirSync(node.path);
            }
          }
          
          this.message.success(`成功删除 ${nodes.length} 个项目`);
          
          // 清空剪贴板中被删除的项目
          if (this.clipboard.nodes.length > 0) {
            const deletedPaths = new Set(nodes.map(n => n.path));
            this.clipboard.nodes = this.clipboard.nodes.filter(n => !deletedPaths.has(n.path));
            if (this.clipboard.nodes.length === 0) {
              this.clipboard.operation = null;
            }
          }
          
          // 刷新文件树
          this.refresh();
          
        } catch (error) {
          console.error('删除失败:', error);
          this.message.error(`删除失败: ${error.message}`);
        }
      }
    });
  }

  private createNewFile(parentNode: FlatFileNode) {
    console.log('Create new file in:', parentNode.path);
    
    // 确保父节点是文件夹
    let parentPath = parentNode.path;
    if (parentNode.isLeaf) {
      parentPath = window['path'].dirname(parentPath);
    }
    
    this.modal.create({
      nzTitle: '创建新文件',
      nzContent: `
        <div>
          <p>在文件夹中创建新文件: ${window['path'].basename(parentPath)}</p>
          <input id="new-file-input" type="text" placeholder="输入文件名（如: main.cpp）" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" />
        </div>
      `,
      nzOnOk: () => {
        const fileName = (document.getElementById('new-file-input') as HTMLInputElement)?.value?.trim();
        
        if (!fileName) {
          this.message.error('请输入文件名');
          return false;
        }
        
        // 检查文件名是否包含非法字符
        const invalidChars = /[<>:"/\\|?*]/;
        if (invalidChars.test(fileName)) {
          this.message.error('文件名包含非法字符');
          return false;
        }
        
        const filePath = window['path'].join(parentPath, fileName);
        
        try {
          // 检查文件是否已存在
          if (window['fs'].existsSync(filePath)) {
            this.message.error('该文件名已存在');
            return false;
          }
          
          // 创建空文件
          window['fs'].writeFileSync(filePath, '');
          this.message.success('文件创建成功');
          
          // 刷新文件树
          this.refresh();
          
          return true;
        } catch (error) {
          console.error('创建文件失败:', error);
          this.message.error(`创建文件失败: ${error.message}`);
          return false;
        }
      }
    });
    
    // 延迟聚焦到输入框
    setTimeout(() => {
      const input = document.getElementById('new-file-input') as HTMLInputElement;
      if (input) {
        input.focus();
      }
    }, 100);
  }

  private createNewFolder(parentNode: FlatFileNode) {
    console.log('Create new folder in:', parentNode.path);
    
    // 确保父节点是文件夹
    let parentPath = parentNode.path;
    if (parentNode.isLeaf) {
      parentPath = window['path'].dirname(parentPath);
    }
    
    this.modal.create({
      nzTitle: '创建新文件夹',
      nzContent: `
        <div>
          <p>在文件夹中创建新文件夹: ${window['path'].basename(parentPath)}</p>
          <input id="new-folder-input" type="text" placeholder="输入文件夹名" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" />
        </div>
      `,
      nzOnOk: () => {
        const folderName = (document.getElementById('new-folder-input') as HTMLInputElement)?.value?.trim();
        
        if (!folderName) {
          this.message.error('请输入文件夹名');
          return false;
        }
        
        // 检查文件夹名是否包含非法字符
        const invalidChars = /[<>:"/\\|?*]/;
        if (invalidChars.test(folderName)) {
          this.message.error('文件夹名包含非法字符');
          return false;
        }
        
        const folderPath = window['path'].join(parentPath, folderName);
        
        try {
          // 检查文件夹是否已存在
          if (window['fs'].existsSync(folderPath)) {
            this.message.error('该文件夹名已存在');
            return false;
          }
          
          // 创建文件夹
          window['fs'].mkdirSync(folderPath);
          this.message.success('文件夹创建成功');
          
          // 刷新文件树
          this.refresh();
          
          return true;
        } catch (error) {
          console.error('创建文件夹失败:', error);
          this.message.error(`创建文件夹失败: ${error.message}`);
          return false;
        }
      }
    });
    
    // 延迟聚焦到输入框
    setTimeout(() => {
      const input = document.getElementById('new-folder-input') as HTMLInputElement;
      if (input) {
        input.focus();
      }
    }, 100);
  }

  private copyPathToClipboard(node: FlatFileNode, relative: boolean) {
    const path = relative ? this.getRelativePath(node.path) : node.path;
    console.log('Copy path to clipboard:', path);
    
    try {
      navigator.clipboard.writeText(path).then(() => {
        this.message.success(`已复制${relative ? '相对' : '绝对'}路径到剪贴板`);
      }).catch(() => {
        // 降级方案：创建一个临时的文本域来复制文本
        const textarea = document.createElement('textarea');
        textarea.value = path;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        this.message.success(`已复制${relative ? '相对' : '绝对'}路径到剪贴板`);
      });
    } catch (error) {
      console.error('复制路径失败:', error);
      this.message.error('复制路径失败');
    }
  }

  private getRelativePath(absolutePath: string): string {
    if (!this.rootPath || !absolutePath) {
      return absolutePath;
    }
    
    // 标准化路径，确保使用一致的分隔符
    const normalizedRoot = window['path'].normalize(this.rootPath);
    const normalizedPath = window['path'].normalize(absolutePath);
    
    // 检查路径是否在根目录下
    if (!normalizedPath.startsWith(normalizedRoot)) {
      return absolutePath; // 如果不在根目录下，返回绝对路径
    }
    
    // 计算相对路径
    let relativePath = normalizedPath.substring(normalizedRoot.length);
    
    // 移除开头的路径分隔符
    relativePath = relativePath.replace(/^[\\\/]+/, '');
    
    return relativePath || '.'; // 如果为空，返回当前目录
  }

  private revealInExplorer(node: FlatFileNode) {
    console.log('Reveal in explorer:', node.path);
    
    try {
      // 使用Electron API打开文件资源管理器
      if (window['other'] && window['other'].openByExplorer) {
        window['other'].openByExplorer(node.path);
        this.message.success('已在资源管理器中打开');
      } else {
        // 降级方案：尝试使用shell命令
        const platform = window['platform']?.type || 'win32';
        let command = '';
        
        if (platform === 'win32') {
          // Windows
          if (node.isLeaf) {
            // 如果是文件，选中该文件
            command = `explorer.exe /select,"${node.path}"`;
          } else {
            // 如果是文件夹，打开该文件夹
            command = `explorer.exe "${node.path}"`;
          }
        } else if (platform === 'darwin') {
          // macOS
          if (node.isLeaf) {
            command = `open -R "${node.path}"`;
          } else {
            command = `open "${node.path}"`;
          }
        } else {
          // Linux
          const dir = node.isLeaf ? window['path'].dirname(node.path) : node.path;
          command = `xdg-open "${dir}"`;
        }
        
        if (command && window['cmd'] && window['cmd'].run) {
          window['cmd'].run({ command });
          this.message.success('已尝试在资源管理器中打开');
        } else {
          this.message.warning('当前环境不支持此功能');
        }
      }
    } catch (error) {
      console.error('在资源管理器中打开失败:', error);
      this.message.error('在资源管理器中打开失败');
    }
  }

  private openInTerminal(node: FlatFileNode) {
    console.log('Open in terminal:', node.path);
    
    // 确定要在终端中打开的目录
    let targetPath = node.path;
    if (node.isLeaf) {
      // 如果是文件，使用其父目录
      targetPath = window['path'].dirname(targetPath);
    }
    
    try {
      // 尝试使用Electron的终端API
      if (window['terminal'] && window['terminal'].init) {
        const terminalOptions = {
          cwd: targetPath,
          shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/bash'
        };
        
        window['terminal'].init(terminalOptions).then(() => {
          this.message.success('已在终端中打开');
        }).catch((error) => {
          console.error('终端打开失败:', error);
          this.openTerminalFallback(targetPath);
        });
      } else {
        this.openTerminalFallback(targetPath);
      }
    } catch (error) {
      console.error('在终端中打开失败:', error);
      this.openTerminalFallback(targetPath);
    }
  }

  private openTerminalFallback(targetPath: string) {
    try {
      // 降级方案：使用系统命令打开终端
      const platform = window['platform']?.type || 'win32';
      let command = '';
      
      if (platform === 'win32') {
        // Windows - 打开命令提示符
        command = `start cmd /k "cd /d \"${targetPath}\""`;
      } else if (platform === 'darwin') {
        // macOS - 打开Terminal.app
        command = `osascript -e 'tell application "Terminal" to do script "cd \\"${targetPath}\\""'`;
      } else {
        // Linux - 尝试打开各种终端
        const terminals = ['gnome-terminal', 'konsole', 'xterm', 'terminator'];
        for (const term of terminals) {
          try {
            if (term === 'gnome-terminal') {
              command = `${term} --working-directory="${targetPath}"`;
            } else if (term === 'konsole') {
              command = `${term} --workdir "${targetPath}"`;
            } else {
              command = `cd "${targetPath}" && ${term}`;
            }
            break;
          } catch (e) {
            continue;
          }
        }
      }
      
      if (command && window['cmd'] && window['cmd'].run) {
        window['cmd'].run({ command });
        this.message.success('已尝试在终端中打开');
      } else {
        this.message.warning('当前环境不支持此功能');
      }
    } catch (error) {
      console.error('终端打开降级方案失败:', error);
      this.message.error('在终端中打开失败');
    }
  }

  private showProperties(node: FlatFileNode) {
    console.log('Show properties:', node.path);
    
    try {
      // 获取文件/文件夹的统计信息
      const stats = window['fs'].statSync(node.path);
      const fileName = window['path'].basename(node.path);
      const fileExtension = window['path'].extname(node.path);
      const fileDir = window['path'].dirname(node.path);
      const relativePath = this.getRelativePath(node.path);
      
      // 格式化文件大小
      const formatFileSize = (bytes: number): string => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
      };
      
      // 格式化日期
      const formatDate = (date: Date): string => {
        return date.toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
      };

      const properties = [
        { label: '名称', value: fileName },
        { label: '类型', value: node.isLeaf ? `${fileExtension || '文件'}` : '文件夹' },
        { label: '位置', value: fileDir },
        { label: '相对路径', value: relativePath },
        { label: '完整路径', value: node.path },
        { label: '大小', value: node.isLeaf ? formatFileSize(stats.size) : '—' },
        { label: '创建时间', value: formatDate(new Date(stats.birthtime || stats.ctime)) },
        { label: '修改时间', value: formatDate(new Date(stats.mtime)) },
        { label: '访问时间', value: formatDate(new Date(stats.atime)) }
      ];

      const contentHtml = `
        <div style="max-height: 400px; overflow-y: auto;">
          <table style="width: 100%; border-collapse: collapse;">
            ${properties.map(prop => `
              <tr style="border-bottom: 1px solid #f0f0f0;">
                <td style="padding: 8px; font-weight: bold; width: 100px; vertical-align: top;">${prop.label}:</td>
                <td style="padding: 8px; word-break: break-all;">${prop.value}</td>
              </tr>
            `).join('')}
          </table>
        </div>
      `;

      this.modal.create({
        nzTitle: `属性 - ${fileName}`,
        nzContent: contentHtml,
        nzFooter: null,
        nzWidth: 600,
        nzMaskClosable: true
      });

    } catch (error) {
      console.error('获取文件属性失败:', error);
      this.message.error(`获取文件属性失败: ${error.message}`);
    }
  }

  // 获取当前数据
  getCurrentData(): FlatFileNode[] {
    return this.dataSource.getCurrentData();
  }

  openFolder(folder: FlatFileNode) {
    // 如果是文件夹，展开或收起
    if (this.treeControl.isExpanded(folder)) {
      this.treeControl.collapse(folder);
    } else {
      this.treeControl.expand(folder);
      // 动态数据源会自动处理子文件夹的加载
    }
  }

  openFile(file: FlatFileNode) {
    this.selectedFile = file.path;
    this.selectedFileChange.emit(file);
  }

  getFileIcon(filename: string): string {
    // 根据文件扩展名返回不同的图标类
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    switch (ext) {
      case 'c': return 'fa-light fa-c';
      case 'cpp': return 'fa-light fa-c';
      case 'h': return 'fa-light fa-h';
      default: return 'fa-light fa-file';
    }
  }

  // 检查文件列表是否为空
  isEmpty(): boolean {
    return this.dataSource.getCurrentData().length === 0;
  }

  refresh() {
    this.isLoading = true;
    setTimeout(() => {
      this.loadRootPath();
      this.isLoading = false;
    }, 1000);
  }
}
