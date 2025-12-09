import { Component } from '@angular/core';
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


  constructor() { }

  currentStep = 0;

  nextStep(){
    this.currentStep += 1;
  }
}
