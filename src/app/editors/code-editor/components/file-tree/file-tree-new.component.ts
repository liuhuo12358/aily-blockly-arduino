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

  // 菜单操作方法的实现 - 通过FileService调用
  private copyToClipboard(nodes: FlatFileNode[]) {
    this.fileService.copyToClipboard(nodes);
  }

  private cutToClipboard(nodes: FlatFileNode[]) {
    this.fileService.cutToClipboard(nodes);
  }

  private async pasteFromClipboard(targetNode: FlatFileNode) {
    const success = await this.fileService.pasteFromClipboard(targetNode);
    if (success) {
      // 刷新文件树
      this.refresh();
    }
  }

  private renameNode(node: FlatFileNode) {
    this.fileService.renameNode(node, () => {
      // 刷新文件树
      this.refresh();
    });
  }

  private deleteNodes(nodes: FlatFileNode[]) {
    this.fileService.deleteNodes(nodes, () => {
      // 刷新文件树
      this.refresh();
    });
  }

  private createNewFile(parentNode: FlatFileNode) {
    this.fileService.createNewFile(parentNode, () => {
      // 刷新文件树
      this.refresh();
    });
  }

  private createNewFolder(parentNode: FlatFileNode) {
    this.fileService.createNewFolder(parentNode, () => {
      // 刷新文件树
      this.refresh();
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
    this.isLoading = true;
    setTimeout(() => {
      this.loadRootPath();
      this.isLoading = false;
    }, 1000);
  }
}
