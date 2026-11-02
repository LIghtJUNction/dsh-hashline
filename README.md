# dsh-hashline

给 DSH 增加带行锚点的读取和编辑工具。编辑同时校验整文件 SHA-256 revision 与选定行的内容哈希，拒绝覆盖读取后发生的变化。

## 安装

面向 Node.js 24+、DeepSeek Harness **0.2.1-rc.2**。当前交付是源码和本地构建，不表示已经发布 npm。

在已安装 monorepo 依赖的目录运行：

```sh
npm run check --workspace @lightjunction/dsh-hashline
cd plugins/dsh-hashline
npm pack
dsh plugin --profile web add "$PWD/lightjunction-dsh-hashline-0.1.0.tgz" --ignore-scripts
```

重启目标 profile，在工具列表检查 `hashline_read` 和 `hashline_edit`。TUI 使用者将 `web` 换成实际 profile。`npm pack` 执行构建；不要把未构建的源码直接当编译入口安装。

## 使用

先调用：

```json
{"path":"src/example.ts","offset":1,"limit":100}
```

这是 `hashline_read` 参数。结果包含完整文件 `revision`、形如 `12:0123456789abcdef|原文` 的 `lines`、`totalLines` 和 `nextOffset`。offset 从 1 开始，nextOffset 为 0 表示结束。将**实际返回**的 revision 和锚点用于 `hashline_edit`：

```json
{"path":"src/example.ts","revision":"<read 返回的 revision>","operation":"replace","start":"<起始 LINE:HASH>","end":"<结束 LINE:HASH>","text":"替换后的代码"}
```

省略 end 表示替换一行；`insert_after` 在 start 行后插入，不接受 end。text 是行内容，末尾换行不产生额外空行；空 text 的 replace 删除范围。编辑保留原文件 LF/CRLF、末尾换行习惯和普通权限位。任何文件变化都需要重新读取，即使变化发生在编辑范围之外。

## 配置和边界

默认通过当前 agent 的 workingDirectory 定位工作区。无 agent 的宿主调用必须配置 `root`，例如插件 overlay 的 `config: { root: /absolute/local/repository }`。

只处理**宿主机本地文件系统**，不使用 DSH remote world 或 sandbox 文件接口，也不是路径隔离沙箱。拒绝工作区外路径、任何路径分量中的符号链接、`.git` 元数据、目录、多重硬链接、非 UTF-8/NUL 内容、混合换行和超过 1 MiB 的文件。read 每页最多 1000 行；结果仍可能很大。

写入使用同目录临时文件并原子 rename；提交前再次检查哈希、inode 和路径。无法通过 Node 可移植 API 排除恶意外部进程同时替换父目录的所有竞态。不保留 inode、ACL、扩展属性或特殊权限位；不创建文件，不提供跨文件事务。

## v0.1 与 pi 来源的差异

行为来源是 [coctostan/pi-hashline-readmap](https://github.com/coctostan/pi-hashline-readmap)，MIT；详见 [UPSTREAM.md](UPSTREAM.md) 和 [NOTICE](NOTICE)。这是独立 DSH 实现，未复制上游实现源码。

首版是独立命名的两个工具，不替换 DSH 内置 read/edit。使用 SHA-256 的 16 位十六进制行哈希，要求整文件 revision；与上游 xxhash 三位锚点不兼容。不含 readmap、AST 搜索、模糊锚点重定位、copy/move lines、语法检查或 TUI diff。不能将这些尚未实现的功能算作已迁移。

## 本地验证

```sh
npm run check --workspace @lightjunction/dsh-hashline
```

测试使用真实 rc.2 Cordis/ToolRuntime 和离线模型循环，覆盖注册 schema、带锚点读取、CRLF 编辑、权限保持、过期 revision、取消、越界、符号链接、硬链接及二进制拒绝。没有远程模型或 remote world 验收。
