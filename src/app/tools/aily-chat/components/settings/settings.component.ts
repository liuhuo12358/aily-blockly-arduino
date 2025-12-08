import { Component, EventEmitter, Output, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMessageService } from 'ng-zorro-antd/message';

@Component({
  selector: 'aily-chat-settings',
  imports: [
    CommonModule,
    FormsModule,
    NzButtonModule,
    NzInputModule,
  ],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss'
})
export class AilyChatSettingsComponent implements OnInit {

  @Output() close = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>(); // 保存成功事件

  constructor(
    private message: NzMessageService
  ) {
  }

  ngOnInit() {
  }

  onClose() {
    this.close.emit();
  }

  async onSave() {

  }
}
