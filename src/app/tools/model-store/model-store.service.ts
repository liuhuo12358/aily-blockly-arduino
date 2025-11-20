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

export interface ModelLabel {
  object_id: string;
  object_name: string;
}

export interface ModelDetail {
  id: string;
  name: string;
  description: string;
  content: string;
  author: string;
  author_name: string;
  pic_url: string;
  file_url: string;
  model_size: string;
  be_public: string;
  deploy_num: string;
  view_num: string;
  like_num: string;
  follow_num: string;
  priority: string;
  scenario: string;
  precision: string;
  ai_framework: string;
  model_format: string;
  task: string;
  preparation: string[];
  checksum: string;
  attr: {
    iou: string;
    conf: string;
  };
  version: string;
  created: string;
  deleted: string;
  adapteds: string[];
  labels: ModelLabel[];
  uniform_types: string[];
}

export interface ModelDetailResponse {
  code: string;
  data: ModelDetail;
}

@Injectable({
  providedIn: 'root'
})
export class ModelStoreService {
  private apiUrl = 'https://sensecraft.seeed.cc/aiserverapi/model/list_model';
  private detailApiUrl = 'https://sensecraft.seeed.cc/aiserverapi/model/view_model';

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

  /**
   * 获取模型详情
   * @param id 模型ID
   * @returns Observable<ModelDetail | null>
   */
  getModelDetail(id: string): Observable<ModelDetail | null> {
    return this.http.get<ModelDetailResponse>(`${this.detailApiUrl}?model_id=${id}`).pipe(
      map(response => {
        if (response.code === '0' && response.data) {
          return response.data;
        }
        return null;
      }),
      catchError(error => {
        console.error('获取模型详情失败:', error);
        return of(null);
      })
    );
  }
}
