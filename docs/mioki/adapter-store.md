# 适配器商店 {#adapter-store}

这里收录了社区发布的 mioki 适配器。适配器负责对接不同平台（如 OneBot v11 / NapCat、Telegram、Discord 等），让插件无需改动即可跨平台运行。

<StoreRegistry type="adapter" />

## 安装适配器 {#install}

将适配器安装为项目的直接依赖，然后在 `package.json` 的 `mioki.adapters` 中配置连接参数

```sh
npm install mioki-adapter-onebotv11
npx mioki-adapter-onebotv11   # 可选：进入连接参数配置向导
```

也可以手动写入：

```jsonc
{
  "dependencies": {
    "mioki-adapter-onebotv11": "^1.0.0"
  },
  "mioki": {
    "adapters": {
      "onebotv11": {
        "instances": [
          { "protocol": "ws", "host": "localhost", "port": 3001, "token": "xxx" }
        ]
      }
    }
  }
}
```

## 收录规则 {#rules}

适配器商店会自动从 [npm](https://www.npmjs.com/) 抓取信息，满足以下条件的包会被收录：

- 包名以 `mioki-adapter-` 开头
- 包的 `keywords` 中包含 `mioki`
