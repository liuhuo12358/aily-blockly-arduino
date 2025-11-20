import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, catchError, of } from 'rxjs';

export interface ModelItem {
  id: string;
  name: string;
  description: string;
  author: string;
  author_name: string;
  pic_url: string;
  model_size: string;
  task: string;
  scenario: string;
  model_format: string;
  ai_framework: string;
  be_public: string;
  precision: string;
  created: string;
  like_num: string;
  follow_num: string;
  deploy_num: string;
  priority: string;
  adapteds: string[];
  uniform_types: string[];
  follow_time: string;
  like_time: string;
}

export interface ModelListResponse {
  data: {
    list: ModelItem[];
  };
  [key: string]: any;
}

@Injectable({
  providedIn: 'root'
})
export class ModelStoreService {
  private apiUrl = 'https://sensecraft.seeed.cc/aiserverapi/model/list_model';

  constructor(private http: HttpClient) { }

  /**
   * 获取模型列表
   * @returns Observable<ModelItem[]>
   */
  getModelList(): Observable<ModelItem[]> {
    return this.http.get<ModelListResponse>(this.apiUrl).pipe(
      map(response => response.data.list || []),
      catchError(error => {
        console.error('获取模型列表失败:', error);
        return of([]);
      })
    );
  }
}
