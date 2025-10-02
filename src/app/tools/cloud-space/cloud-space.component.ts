import { Component } from '@angular/core';
import { ToolContainerComponent } from '../../components/tool-container/tool-container.component';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { UiService } from '../../services/ui.service';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { EditorComponent } from './editor/editor.component';
import { CloudService } from './services/cloud.service';
import { ProjectService } from '../../services/project.service';
import { CmdService } from '../../services/cmd.service';
import { NzMessageService } from 'ng-zorro-antd/message';

@Component({
  selector: 'app-cloud-space',
  imports: [
    ToolContainerComponent,
    FormsModule,
    CommonModule,
    NzButtonModule,
    EditorComponent
  ],
  templateUrl: './cloud-space.component.html',
  styleUrl: './cloud-space.component.scss'
})
export class CloudSpaceComponent {

  itemList = []
  isSyncing = false;

  editorProjectData = null;

  constructor(
    private uiService: UiService,
    private cloudService: CloudService,
    private projectService: ProjectService,
    private cmdService: CmdService,
    private message: NzMessageService
  ) { }

  // 分页参数
  currentPage = 1;
  pageSize = 100;
  totalProjects = 0;

  ngOnInit(): void {
    this.getCloudProjects().then(
      () => { console.log('云项目列表获取完成'); }
    );
  }

  // 获取云上项目列表
  async getCloudProjects() {
    this.cloudService.getProjects((this.currentPage - 1) * this.pageSize, this.pageSize).subscribe(res => {
      if (res && res.status === 200) {
        this.itemList = [];
        res.data.forEach(prj => {
          // 图片url
          let imageUrl = '';
          if (prj.image_url) {
            imageUrl = this.cloudService.baseUrl + prj.image_url;
          } else {
            imageUrl = 'imgs/subject.webp';
          }

          this.itemList.push({
            id: prj.id,
            name: prj.name,
            nickname: prj.nickname,
            description: prj.description,
            image_url: imageUrl,
            is_published: prj.is_published,
          });
        });
        this.totalProjects = res.data.total;
        console.log('获取云上项目列表成功:', this.itemList);
      } else {
        console.error('获取云上项目列表失败, 服务器返回错误:', res);
      }
    });
  }

  // 打包项目
  async packageProject(prjPath: string): Promise<string | undefined> {
    // 判断路径是否存在
    if (!await window['fs'].existsSync(prjPath)) {
      this.message.error('当前未打开项目，无法同步');
      console.warn('项目路径不存在:', prjPath);
      return;
    }
    await this.cmdService.runAsync(`7za.exe a -tzip -mx=9 project.7z package.json *.abi`, prjPath, false);

    return `${prjPath}/project.7z`;
  }

  syncProject() {
    let project = {
      name: '项目名称',  // packagename, 唯一的
      nickname: '项目昵称',  // 显示出来的名字
      description: '项目描述', // 项目描述
      image: "hhaha.webp", // 项目图片 500x250
      createTime: '2024-01-01 12:00:00', // 实际不传，服务器生成
      updateTime: '2024-01-01 12:00:00', // 实际不传，服务器生成

    }

    // cloudService.uploadProject(project)
  }

  async setCurrentProjectCloudId(cloudId: string) {
    const currentProjectData = this.projectService.currentPackageData;
    if (!currentProjectData) return;

    currentProjectData.cloudId = cloudId;

    // 同步更新package.json
    await this.projectService.setPackageJson(currentProjectData);
  }

  async syncToCloud() {
    this.isSyncing = true;

    // 保存当前项目
    await this.projectService.save(this.projectService.currentProjectPath);

    // 获取当前项目数据
    const currentProjectData = this.projectService.currentPackageData;
    if (!currentProjectData) return;

    const archivePath = await this.packageProject(this.projectService.currentProjectPath);
    if (!archivePath) return;

    this.cloudService.syncProject({
      pid: currentProjectData?.cloudId,
      name: currentProjectData.name,
      description: currentProjectData.description,
      archive: new File([await window['fs'].readFileSync(archivePath)], 'project.7z', { type: 'application/zip' })
    }).subscribe(async res => {
      if (res && res.status === 200) {
        await this.setCurrentProjectCloudId(res.data.id);
        this.message.success('同步成功');
        // 更新项目列表
        await this.getCloudProjects();
        console.log('同步成功, 云端项目ID:', res.data.id);
      } else {
        console.error('同步失败, 服务器返回错误:', res);
      }
      this.isSyncing = false;
    }, err => {
      this.isSyncing = false;
      console.error('同步失败:', err);
    });
  }

  showEditor = false;

  openEditor(item) {
    this.showEditor = true;
    this.editorProjectData = item;
  }

  showSearch = false;
  openSearch() {
    this.showSearch = true;
  }

  toggleVisibility(item) {
    // 切换公开/私有状态
    console.log('切换项目可见性:', item);
    if (item.is_published) {
      this.cloudService.unpublishProject(item.id).subscribe(res => {
        this.message.info(`项目 "${item.nickname}" 已设为私有`);
        item.is_published = false;
      });
    } else {
      this.cloudService.publishProject(item.id).subscribe(res => {
        this.message.info(`项目 "${item.nickname}" 已设为公开`);
        item.is_published = true;
      });
    }
  }

  deleteCloudProject(item) {
    if (!item || !item.id) return;
    this.cloudService.deleteProject(item.id).subscribe(res => {
      this.message.success(`项目 "${item.nickname}" 已删除`);
      this.getCloudProjects();
    });
  }

  close() {
    this.uiService.closeTool('cloud-space');
  }
}
