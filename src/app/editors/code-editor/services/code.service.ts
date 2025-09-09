import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';

export interface OpenedFile {
  path: string;      // 文件路径
  title: string;     // 显示的文件名
  content: string;   // 文件内容
  isDirty: boolean;  // 是否有未保存的更改
  language?: string; // 文件语言类型
}

export interface EditorState {
  openedFiles: OpenedFile[];
  selectedIndex: number;
  currentFile?: OpenedFile;
}

@Injectable({
  providedIn: 'root'
})
export class CodeService {
  // 编辑器状态
  private editorStateSubject = new BehaviorSubject<EditorState>({
    openedFiles: [],
    selectedIndex: -1
  });

  // 文件操作事件
  private fileOperationSubject = new Subject<{
    type: 'open' | 'close' | 'save' | 'dirty' | 'clean';
    file?: OpenedFile;
    index?: number;
  }>();

  // 编辑器状态观察者
  editorState$ = this.editorStateSubject.asObservable();
  
  // 文件操作事件观察者
  fileOperation$ = this.fileOperationSubject.asObservable();

  constructor() { }

  /**
   * 获取当前编辑器状态
   */
  getCurrentState(): EditorState {
    return this.editorStateSubject.value;
  }

  /**
   * 更新编辑器状态
   * @param state 新状态
   */
  updateEditorState(state: Partial<EditorState>): void {
    const currentState = this.editorStateSubject.value;
    const newState = { ...currentState, ...state };
    
    // 更新当前文件信息
    if (newState.selectedIndex >= 0 && newState.selectedIndex < newState.openedFiles.length) {
      newState.currentFile = newState.openedFiles[newState.selectedIndex];
    } else {
      newState.currentFile = undefined;
    }

    this.editorStateSubject.next(newState);
  }

  /**
   * 触发文件操作事件
   * @param operation 操作信息
   */
  triggerFileOperation(operation: {
    type: 'open' | 'close' | 'save' | 'dirty' | 'clean';
    file?: OpenedFile;
    index?: number;
  }): void {
    this.fileOperationSubject.next(operation);
  }

  /**
   * 检测文件语言类型
   * @param filePath 文件路径
   * @returns 语言类型
   */
  detectLanguage(filePath: string): string {
    const extension = filePath.split('.').pop()?.toLowerCase();
    
    const languageMap: { [key: string]: string } = {
      'js': 'javascript',
      'ts': 'typescript',
      'html': 'html',
      'css': 'css',
      'scss': 'scss',
      'json': 'json',
      'xml': 'xml',
      'md': 'markdown',
      'cpp': 'cpp',
      'c': 'c',
      'h': 'cpp',
      'hpp': 'cpp',
      'ino': 'cpp',
      'py': 'python',
      'java': 'java',
      'php': 'php',
      'rb': 'ruby',
      'go': 'go',
      'rs': 'rust',
      'sh': 'shell',
      'bat': 'batch',
      'ps1': 'powershell',
      'sql': 'sql',
      'yaml': 'yaml',
      'yml': 'yaml',
      'txt': 'plaintext'
    };

    return languageMap[extension || ''] || 'plaintext';
  }

  /**
   * 格式化文件大小
   * @param bytes 字节数
   * @returns 格式化的文件大小
   */
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * 检查文件是否为二进制文件
   * @param filePath 文件路径
   * @returns 是否为二进制文件
   */
  isBinaryFile(filePath: string): boolean {
    const extension = filePath.split('.').pop()?.toLowerCase();
    const binaryExtensions = [
      'jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'ico', 'webp',
      'mp3', 'mp4', 'wav', 'avi', 'mov', 'wmv',
      'zip', 'rar', '7z', 'tar', 'gz',
      'exe', 'dll', 'so', 'dylib',
      'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'
    ];
    
    return extension ? binaryExtensions.includes(extension) : false;
  }

  /**
   * 生成唯一的文件标识
   * @param filePath 文件路径
   * @returns 唯一标识
   */
  generateFileId(filePath: string): string {
    return btoa(filePath).replace(/[^a-zA-Z0-9]/g, '');
  }

  /**
   * 清理编辑器状态
   */
  clearEditorState(): void {
    this.editorStateSubject.next({
      openedFiles: [],
      selectedIndex: -1
    });
  }
}
