import { Component } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { NzStepsModule } from 'ng-zorro-antd/steps';
import { SubWindowComponent } from '../../components/sub-window/sub-window.component';
import { NzButtonModule } from 'ng-zorro-antd/button';

@Component({
  selector: 'app-model-deploy',
  imports: [
    SubWindowComponent,
    TranslateModule,
    NzStepsModule,
    NzButtonModule
  ],
  templateUrl: './model-deploy.component.html',
  styleUrl: './model-deploy.component.scss'
})
export class ModelDeployComponent {


  constructor() { }

  currentStep = 0;

  nextStep(){
    this.currentStep += 1;
  }
}
