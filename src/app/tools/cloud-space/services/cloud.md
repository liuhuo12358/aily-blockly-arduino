# /cloud/sync 项目同步接口文档

## 接口说明
- **接口地址**：`POST /cloud/sync`
- **功能**：创建或更新项目（含图片和压缩包上传）
- **鉴权**：需要 Header `Authorization: Bearer <token>`

## 请求参数（Form Data）
| 参数名      | 类型       | 必填 | 说明                                 |
| ----------- | ---------- | ---- | ------------------------------------ |
| pid         | string     | 否   | 项目ID，留空为新建                   |
| name        | string     | 否   | 项目名称                             |
| description | string     | 否   | 项目描述                             |
| image       | UploadFile | 否   | 封面图片，支持 jpg/jpeg/png/gif/webp |
| archive     | UploadFile | 否   | 项目压缩包，必须为 .7z 格式          |

## 请求示例
- Content-Type: `multipart/form-data`
- Header: `Authorization: Bearer <token>`

## 返回参数
- 统一结构体 `ResponseBaseModel`

| 字段     | 类型        | 说明                       |
| -------- | ----------- | -------------------------- |
| status   | int         | 状态码（200成功，其他失败）|
| data     | object/null | 项目信息（见下方 ProjectRead）|
| messages | string/null | 错误或提示信息             |

### data 字段（ProjectRead）
| 字段        | 类型   | 说明           |
| ----------- | ------ | -------------- |
| id          | string | 项目ID         |
| name        | string | 项目名称       |
| description | string | 项目描述       |
| owner_id    | string | 所属用户ID     |
| image_url   | string | 封面图片URL    |
| archive_url | string | 压缩包下载URL  |
| ...         | ...    | 其他项目字段   |

## 返回示例
```
{
  "status": 200,
  "data": {
    "id": "xxx-xxx-xxx",
    "name": "项目名称",
    "description": "描述",
    "owner_id": "用户ID",
    "image_url": "/uploads/projects/用户ID/项目ID/cover.jpg",
    "archive_url": "/uploads/projects/用户ID/项目ID/project.7z"
    // ...其他字段
  },
  "messages": null
}
```

## 错误返回示例
- 认证失败
```
{
  "status": 401,
  "data": null,
  "messages": "Invalid authentication credentials"
}
```
- 同名项目已存在
```
{
  "status": 409,
  "data": null,
  "messages": "Project with the same name already exists for this user"
}
```
- 压缩包格式错误
```
{
  "status": 400,
  "data": null,
  "messages": "Archive file must be a .7z file"
}
```
- 无权限
```
{
  "status": 403,
  "data": null,
  "messages": "You do not have permission to modify this project"
}
```

## 备注
- 新建项目时 `pid` 为空，接口会自动生成项目ID。
- 更新项目时需传递已有的 `pid`。
- 图片和压缩包均会被覆盖为最新上传的文件。
- 返回的 `image_url` 和 `archive_url` 可直接用于前端展示和下载。
