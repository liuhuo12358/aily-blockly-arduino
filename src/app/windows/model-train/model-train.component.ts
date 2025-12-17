import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { NzStepsModule } from 'ng-zorro-antd/steps';
import { SubWindowComponent } from '../../components/sub-window/sub-window.component';
import { NzButtonModule } from 'ng-zorro-antd/button';

@Component({
  selector: 'app-model-train',
  imports: [
    SubWindowComponent,
    TranslateModule,
    NzStepsModule,
    NzButtonModule
  ],
  templateUrl: './model-train.component.html',
  styleUrl: './model-train.component.scss'
})
export class ModelTrainComponent {


  constructor(private router: Router) { }

  currentStep = 0;

  nextStep(){
    this.currentStep += 1;
  }

  close(){
    
  }

  // 进入视觉模型训练页面
  goToVisionTrain() {
    this.router.navigate(['/model-train/vision']);
  }

  // 进入音频模型训练页面（暂未实现）
  goToAudioTrain() {
    // TODO: 实现音频模型训练
    console.log('音频模型训练功能开发中...');
  }
}
