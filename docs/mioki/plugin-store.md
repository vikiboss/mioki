# 插件商店 {#plugin-store}

这里收录了社区发布的 mioki 插件。只需一条命令即可安装并使用。

<StoreRegistry type="plugin" />

## 安装插件 {#install}

将插件安装为项目的直接依赖，然后在 `package.json` 的 `mioki.plugins` 中添加插件 ID 即可：

```sh
npm install mioki-plugin-xxx
```

```jsonc
{
  "mioki": {
    "plugins": ["xxx"]
  }
}
```

## 收录规则 {#rules}

插件商店会自动从 [npm](https://www.npmjs.com/) 抓取信息，满足以下条件的包会被收录：

- 包名以 `mioki-plugin-` 开头
- 包的 `keywords` 中包含 `mioki`