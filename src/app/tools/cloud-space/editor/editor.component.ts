import { Component, EventEmitter, Input, input, Output, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMessageService } from 'ng-zorro-antd/message';
import { CloudService } from '../services/cloud.service';

@Component({
  selector: 'app-cloud-project-editor',
  imports: [
    CommonModule,
    FormsModule,
    NzButtonModule,
    NzInputModule
  ],
  templateUrl: './editor.component.html',
  styleUrl: './editor.component.scss'
})
export class EditorComponent implements OnInit {

  @Output() close = new EventEmitter<void>();
  @Input() projectData: any = {
    id: '',
    name: '',
    nickname: '',
    description: '',
    image: '',
    image_url: ''
  };

  selectedImageFile: File | null = null;
  imagePreviewUrl: string | null = null;

  constructor(
    private cloudService: CloudService,
    private message: NzMessageService
  ) {
  }

  ngOnInit() {
    // 在 ngOnInit 中初始化图片预览URL，此时 @Input 属性已经被正确设置
    this.imagePreviewUrl = this.projectData.image_url || null;
  }

  onClose() {
    this.close.emit();
  }

  onImageFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      
      // 验证文件类型
      if (!file.type.startsWith('image/')) {
        this.message.error('请选择图片文件');
        return;
      }
      
      // 验证文件大小 (5MB限制)
      if (file.size > 5 * 1024 * 1024) {
        this.message.error('图片文件大小不能超过5MB');
        return;
      }
      
      this.selectedImageFile = file;
      
      // 生成预览URL
      const reader = new FileReader();
      reader.onload = (e) => {
        this.imagePreviewUrl = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  }

  removeSelectedImage() {
    this.selectedImageFile = null;
    this.imagePreviewUrl = null;
    
    // 清空file input的值
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  }

  onSave() {
    // 验证必填字段
    if (!this.projectData.nickname || !this.projectData.nickname.trim()) {
      this.message.error('请输入项目名称');
      return;
    }

    // 准备更新数据
    const updateData: any = {
      nickname: this.projectData.nickname.trim(),
      description: this.projectData.description || ''
    };

    // 如果选择了新图片，添加到更新数据中
    if (this.selectedImageFile) {
      updateData.image = this.selectedImageFile;
    }

    // 保存逻辑
    this.cloudService.updateProject(this.projectData.id, updateData).subscribe({
      next: (res) => {
        if (res && res.status === 200) {
          this.message.success('项目更新成功');
          this.close.emit();
        } else {
          this.message.error('项目更新失败');
        }
      },
      error: (error) => {
        console.error('更新项目失败:', error);
        this.message.error('项目更新失败: ' + error);
      }
    });
  }
}
