
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { API } from '../../../configs/api.config';

@Injectable({
  providedIn: 'root'
})
export class CloudService {
  baseUrl: string = API.cloudBase;
  private apiUrl = API.cloudSync;
  private cloudProjectsUrl = API.cloudProjects;

  constructor(private http: HttpClient) { }

  /**
   * 同步（新建/更新）项目
   * @param params 同步参数
   * @param token 认证token
   */
  syncProject(params: {
    pid?: string;
    name?: string;
    description?: string;
    archive?: File;
  }): Observable<any> {
    const formData = new FormData();
    if (params.pid) formData.append('pid', params.pid);
    if (params.name) formData.append('name', params.name);
    if (params.description) formData.append('description', params.description);
    if (params.archive) formData.append('archive', params.archive);

    return this.http.post<any>(this.apiUrl, formData)
      .pipe(
        catchError(this.handleError)
      );
  }

  /**
   * 获取当前用户所有云上项目列表
   * @param skip 跳过的项目数量（分页）
   * @param limit 返回的最大项目数量（分页）
   */
  getProjects(skip: number = 0, limit: number = 20): Observable<any> {
    const params = {
      skip: skip.toString(),
      limit: limit.toString()
    };

    return this.http.get<any>(this.cloudProjectsUrl, { params })
      .pipe(
        catchError(this.handleError)
      );
  }

  /**
   * 云上项目基础信息编辑接口
   * @param projectId 项目ID
   * @param params 编辑参数
   */
  updateProject(projectId: string, params: {
    nickname?: string;
    description?: string;
    image?: File;
  }): Observable<any> {
    const formData = new FormData();
    if (params.nickname) formData.append('nickname', params.nickname);
    if (params.description) formData.append('description', params.description);
    if (params.image) formData.append('image', params.image);

    return this.http.put<any>(`${this.cloudProjectsUrl}/${projectId}`, formData)
      .pipe(
        catchError(this.handleError)
      );
  }

  /**
   * 获取项目.7z文件的接口
   * @param projectId 项目ID
   */
  downloadProject(projectId: string): Observable<Blob> {
    return this.http.get(`${this.cloudProjectsUrl}/${projectId}/download`, {
      responseType: 'blob'
    })
      .pipe(
        catchError(this.handleError)
      );
  }

  /**
   * 发布项目接口
   * @param projectId 项目ID
   */
  publishProject(projectId: string): Observable<any> {
    return this.http.post<any>(`${this.cloudProjectsUrl}/${projectId}/publish`, {})
      .pipe(
        catchError(this.handleError)
      );
  }

  /**
   * 取消发布项目接口
   * @param projectId 项目ID
   */
  unpublishProject(projectId: string): Observable<any> {
    return this.http.delete<any>(`${this.cloudProjectsUrl}/${projectId}/publish`)
      .pipe(
        catchError(this.handleError)
      );
  }

  /**
   * 删除项目接口
   * @param projectId 项目ID
   */
  deleteProject(projectId: string): Observable<any> {
    return this.http.delete<any>(`${this.cloudProjectsUrl}/${projectId}`)
      .pipe(
        catchError(this.handleError)
      );
  }

  private handleError(error: HttpErrorResponse) {
    let errMsg = '';
    if (error.error instanceof ErrorEvent) {
      errMsg = `客户端错误: ${error.error.message}`;
    } else {
      errMsg = `服务端错误: ${error.status}, ${error.error?.messages || error.message}`;
    }
    return throwError(() => errMsg);
  }
}
