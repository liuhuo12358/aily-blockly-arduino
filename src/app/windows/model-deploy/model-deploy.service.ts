import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { ModelDetail } from '../../tools/model-store/model-store.service';

@Injectable({
  providedIn: 'root'
})
export class ModelDeployService {
  private modelDetailSubject = new BehaviorSubject<ModelDetail | null>(null);
  public modelDetail$: Observable<ModelDetail | null> = this.modelDetailSubject.asObservable();

  constructor() { }

  /**
   * 设置要部署的模型详情
   * @param modelDetail 模型详情
   */
  setModelDetail(modelDetail: ModelDetail): void {
    this.modelDetailSubject.next(modelDetail);
  }

  /**
   * 获取当前模型详情
   * @returns 模型详情或 null
   */
  getModelDetail(): ModelDetail | null {
    return this.modelDetailSubject.value;
  }

  /**
   * 清除模型详情
   */
  clearModelDetail(): void {
    this.modelDetailSubject.next(null);
  }
}
