import { Injectable } from '@angular/core';
import { Subject, Observable, filter, map } from 'rxjs';

// 定义动作接口
export interface Action<T = any> {
  type: string;
  payload?: T;
  timestamp?: number;
}

// 定义动作监听器接口
export interface ActionListener<T = any> {
  (action: Action<T>): void;
}

@Injectable({
  providedIn: 'root'
})
export class ActionService {
  private actionSubject = new Subject<Action>();

  constructor() { }

  /**
   * 发出一个动作
   * @param type 动作类型
   * @param payload 动作数据（可选）
   */
  dispatch<T = any>(type: string, payload?: T): void {
    const action: Action<T> = {
      type,
      payload,
      timestamp: Date.now()
    };
    this.actionSubject.next(action);
  }

  /**
   * 监听指定类型的动作
   * @param actionType 要监听的动作类型
   * @returns Observable<Action<T>>
   */
  listen<T = any>(actionType: string): Observable<Action<T>> {
    return this.actionSubject.asObservable().pipe(
      filter(action => action.type === actionType),
      map(action => action as Action<T>)
    );
  }

  /**
   * 监听多个动作类型
   * @param actionTypes 要监听的动作类型数组
   * @returns Observable<Action>
   */
  listenMultiple(actionTypes: string[]): Observable<Action> {
    return this.actionSubject.asObservable().pipe(
      filter(action => actionTypes.includes(action.type))
    );
  }

  /**
   * 监听所有动作
   * @returns Observable<Action>
   */
  listenAll(): Observable<Action> {
    return this.actionSubject.asObservable();
  }

  /**
   * 订阅指定动作类型的监听器（简化版本，返回取消订阅函数）
   * @param actionType 动作类型
   * @param listener 监听器函数
   * @returns 取消订阅函数
   */
  subscribe<T = any>(actionType: string, listener: ActionListener<T>): () => void {
    const subscription = this.listen<T>(actionType).subscribe(listener);
    return () => subscription.unsubscribe();
  }

  /**
   * 一次性监听动作（只监听一次）
   * @param actionType 动作类型
   * @param listener 监听器函数
   */
  once<T = any>(actionType: string, listener: ActionListener<T>): void {
    const subscription = this.listen<T>(actionType).subscribe({
      next: (action) => {
        listener(action);
        subscription.unsubscribe();
      }
    });
  }
}
