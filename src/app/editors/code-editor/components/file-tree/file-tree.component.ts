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

// 文件节点接口定义
interface FileNode {
  title: string;
  key: string;
  isLeaf: boolean;
  path: string;
  children?: FileNode[];
}

// 原始文件节点接口
interface FileNodeOrig {
  title: string;
  key: string;
  isLeaf: boolean;
  path: string;
  children?: FileNodeOrig[];
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
  private expandedPaths = new Set<string>(); // 保存展开的节点路径

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

  // 保存当前展开状态
  saveExpandedState(): void {
    this.expandedPaths.clear();
    const expandedNodes = this.treeControl.expansionModel.selected;
    expandedNodes.forEach(node => {
      this.expandedPaths.add(node.path);
    });
  }

  // 恢复展开状态
  restoreExpandedState(): void {
    const allNodes = this.flattenedData.getValue();
    setTimeout(() => {
      allNodes.forEach(node => {
        if (this.expandedPaths.has(node.path) && node.expandable) {
          this.treeControl.expand(node);
        }
      });
    }, 0);
  }

  // 增量更新节点
  updateNode(path: string, updateFn: (node: FlatFileNode) => void): void {
    const data = this.flattenedData.getValue();
    const node = data.find(n => n.path === path);
    if (node) {
      updateFn(node);
      this.flattenedData.next([...data]);
    }
  }

  // 添加新节点
  addNode(parentPath: string, newNode: FlatFileNode): void {
    const data = this.flattenedData.getValue();
    const parentIndex = data.findIndex(n => n.path === parentPath);
    
    if (parentIndex !== -1) {
      // 找到插入位置（在同级节点的最后）
      let insertIndex = parentIndex + 1;
      const parentLevel = data[parentIndex].level;
      
      // 找到同级节点的最后位置
      while (insertIndex < data.length && data[insertIndex].level > parentLevel) {
        insertIndex++;
      }
      
      data.splice(insertIndex, 0, newNode);
      this.flattenedData.next([...data]);
    }
  }

  // 删除节点（包括子节点）
  removeNode(nodePath: string): void {
    const data = this.flattenedData.getValue();
    const nodeIndex = data.findIndex(n => n.path === nodePath);
    
    if (nodeIndex !== -1) {
      const node = data[nodeIndex];
      const nodesToRemove = [nodeIndex];
      
      // 如果是文件夹，也要删除所有子节点
      if (node.expandable) {
        for (let i = nodeIndex + 1; i < data.length; i++) {
          if (data[i].level > node.level) {
            nodesToRemove.push(i);
          } else {
            break;
          }
        }
      }
      
      // 从后往前删除，避免索引问题
      nodesToRemove.reverse().forEach(index => {
        data.splice(index, 1);
      });
      
      this.flattenedData.next([...data]);
      
      // 清除相关的展开状态
      this.expandedPaths.delete(nodePath);
      this.childrenLoadedSet.forEach(loadedNode => {
        if (loadedNode.path === nodePath) {
          this.childrenLoadedSet.delete(loadedNode);
        }
      });
    }
  }

  // 智能刷新指定路径的内容
  refreshPath(path: string): void {
    const data = this.flattenedData.getValue();
    const nodeIndex = data.findIndex(n => n.path === path);
    
    if (nodeIndex !== -1) {
      const node = data[nodeIndex];
      if (node.expandable) {
        // 获取新的文件列表
        const children = this.fileService.readDir(path);
        const flatChildren: FlatFileNode[] = children.map(child => ({
          expandable: !child.isLeaf,
          title: child.title,
          level: node.level + 1,
          key: child.key,
          isLeaf: child.isLeaf,
          path: child['path']
        }));

        // 删除旧的子节点
        let deleteCount = 0;
        for (let i = nodeIndex + 1; i < data.length; i++) {
          if (data[i].level > node.level) {
            deleteCount++;
          } else {
            break;
          }
        }

        // 用新的子节点替换
        data.splice(nodeIndex + 1, deleteCount, ...flatChildren);
        this.flattenedData.next([...data]);
        
        // 标记子节点已加载
        this.childrenLoadedSet.add(node);
      }
    }
    // 注意：如果节点不在当前数据中，调用者应该处理刷新逻辑
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
    // 保存当前展开状态
    if (this.dataSource) {
      this.dataSource.saveExpandedState();
    }

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
    
    // 恢复展开状态
    this.dataSource.restoreExpandedState();
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
      this.currentSelectedNode = this.createRootNode();
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

    this.showRightClickMenu = true;
  }

  onMenuItemClick(menuItem: IMenuItem) {
    console.log('Menu item clicked:', menuItem, 'Node:', this.currentSelectedNode);
    // 隐藏菜单
    this.showRightClickMenu = false;
    // 处理菜单项点击事件
    this.handleMenuAction(menuItem);
  }

  // 创建根节点
  private createRootNode(): FlatFileNode {
    return {
      expandable: true,
      title: 'root',
      level: 0,
      key: 'root',
      isLeaf: false,
      path: this.rootPath
    };
  }

  private handleMenuAction(menuItem: IMenuItem) {
    // 如果currentSelectedNode为null，则默认操作根目录
    const node = this.currentSelectedNode || this.createRootNode();
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

  // 菜单操作方法的实现 - 通过FileService调用
  private copyToClipboard(nodes: FlatFileNode[]) {
    this.fileService.copyToClipboard(nodes);
  }

  private cutToClipboard(nodes: FlatFileNode[]) {
    this.fileService.cutToClipboard(nodes);
  }

  private async pasteFromClipboard(targetNode: FlatFileNode) {
    const result = await this.fileService.pasteFromClipboard(targetNode);
    if (result.success && result.newFiles) {
      // 确定实际的目标路径
      let targetPath = targetNode.path;
      if (targetNode.isLeaf) {
        // 如果是文件，使用其父目录
        targetPath = window['path'].dirname(targetPath);
      }
      
      // 增量添加新文件，避免全量刷新
      for (const newFile of result.newFiles) {
        this.addFileNodeDirect(targetPath, newFile.name, newFile.isLeaf);
      }
    }
  }

  private renameNode(node: FlatFileNode) {
    this.fileService.renameNode(node, (oldPath: string, newPath: string) => {
      // 使用增量更新重命名节点
      this.renameFileNode(oldPath, newPath);
    });
  }

  private deleteNodes(nodes: FlatFileNode[]) {
    this.fileService.deleteNodes(nodes, (deletedPaths: string[]) => {
      // 使用增量更新删除节点
      deletedPaths.forEach(path => {
        this.removeFileNode(path);
      });
    });
  }

  private createNewFile(parentNode: FlatFileNode) {
    this.fileService.createNewFile(parentNode, (fileName: string) => {
      // 确定实际的父路径
      let parentPath = parentNode.path;
      if (parentNode.isLeaf) {
        parentPath = window['path'].dirname(parentPath);
      }
      
      // 直接增量添加新文件，避免刷新
      this.addFileNodeDirect(parentPath, fileName, true);
    });
  }

  private createNewFolder(parentNode: FlatFileNode) {
    this.fileService.createNewFolder(parentNode, (folderName: string) => {
      // 确定实际的父路径
      let parentPath = parentNode.path;
      if (parentNode.isLeaf) {
        parentPath = window['path'].dirname(parentPath);
      }
      
      // 直接增量添加新文件夹，避免刷新
      this.addFileNodeDirect(parentPath, folderName, false);
    });
  }

  private copyPathToClipboard(node: FlatFileNode, relative: boolean) {
    this.fileService.copyPathToClipboard(node, relative, this.rootPath);
  }

  private getRelativePath(absolutePath: string): string {
    return this.fileService.getRelativePath(absolutePath, this.rootPath);
  }

  private revealInExplorer(node: FlatFileNode) {
    this.fileService.revealInExplorer(node);
  }

  private openInTerminal(node: FlatFileNode) {
    this.fileService.openInTerminal(node);
  }

  private showProperties(node: FlatFileNode) {
    this.fileService.showProperties(node);
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
    // 保存展开状态，然后重新加载
    this.loadRootPath();
  }

  // 智能刷新 - 只刷新指定路径的内容
  smartRefresh(targetPath?: string) {
    if (!targetPath) {
      // 如果没有指定路径，刷新根目录
      this.refresh();
      return;
    }

    // 刷新指定路径
    this.dataSource.refreshPath(targetPath);
  }

  // 增量更新 - 添加新文件/文件夹
  addFileNode(parentPath: string, newFileName: string, isLeaf: boolean) {
    const fullPath = window['path'].join(parentPath, newFileName);
    const parentNode = this.dataSource.getCurrentData().find(n => n.path === parentPath);
    
    if (parentNode) {
      const newNode: FlatFileNode = {
        expandable: !isLeaf,
        title: newFileName,
        level: parentNode.level + 1,
        key: fullPath,
        isLeaf: isLeaf,
        path: fullPath
      };
      
      this.dataSource.addNode(parentPath, newNode);
    }
  }

  // 直接添加文件节点（不依赖父节点存在）
  addFileNodeDirect(parentPath: string, newFileName: string, isLeaf: boolean) {
    const fullPath = window['path'].join(parentPath, newFileName);
    const data = this.dataSource.getCurrentData();
    
    // 检查文件是否已存在
    const existingNode = data.find(n => n.path === fullPath);
    if (existingNode) {
      return; // 文件已存在，不重复添加
    }
    
    // 寻找合适的插入位置
    let insertLevel = 0;
    let insertIndex = data.length; // 默认插入到末尾
    
    // 如果是根目录，直接插入到顶层
    if (parentPath === this.rootPath) {
      insertLevel = 0;
      // 按文件类型和字母顺序排序：文件夹在前，文件在后
      for (let i = 0; i < data.length; i++) {
        if (data[i].level === 0) {
          if (isLeaf && !data[i].isLeaf) {
            // 新文件，当前是文件夹，继续查找
            continue;
          } else if (!isLeaf && data[i].isLeaf) {
            // 新文件夹，当前是文件，插入这里
            insertIndex = i;
            break;
          } else if (data[i].title > newFileName) {
            // 同类型，按字母顺序
            insertIndex = i;
            break;
          }
        } else if (data[i].level < 0) {
          // 已经到了下一层，停止
          break;
        }
      }
    } else {
      // 寻找父节点
      const parentNodeIndex = data.findIndex(n => n.path === parentPath);
      if (parentNodeIndex !== -1) {
        const parentNode = data[parentNodeIndex];
        insertLevel = parentNode.level + 1;
        
        // 找到同级节点的末尾位置，并按照文件类型和字母顺序排序
        insertIndex = parentNodeIndex + 1;
        while (insertIndex < data.length && data[insertIndex].level > parentNode.level) {
          if (data[insertIndex].level === insertLevel) {
            if (isLeaf && !data[insertIndex].isLeaf) {
              // 新文件，当前是文件夹，继续查找
            } else if (!isLeaf && data[insertIndex].isLeaf) {
              // 新文件夹，当前是文件，插入这里
              break;
            } else if (data[insertIndex].title > newFileName) {
              // 同类型，按字母顺序
              break;
            }
          }
          insertIndex++;
        }
      } else {
        // 父节点不存在，可能需要先展开父节点
        console.warn('Parent node not found:', parentPath);
        return;
      }
    }
    
    const newNode: FlatFileNode = {
      expandable: !isLeaf,
      title: newFileName,
      level: insertLevel,
      key: fullPath,
      isLeaf: isLeaf,
      path: fullPath
    };
    
    // 直接插入到数据中
    data.splice(insertIndex, 0, newNode);
    // 使用flattenedData.next来触发更新，避免完全重置
    this.dataSource['flattenedData'].next([...data]);
  }

  // 增量更新 - 删除文件/文件夹
  removeFileNode(nodePath: string) {
    this.dataSource.removeNode(nodePath);
  }

  // 增量更新 - 重命名文件/文件夹
  renameFileNode(oldPath: string, newPath: string) {
    this.dataSource.updateNode(oldPath, (node) => {
      node.path = newPath;
      node.key = newPath;
      node.title = window['path'].basename(newPath);
    });
  }
}
