# mioki-adapter-icqq

基于 icqq 的 Mioki QQ 适配器。

## 安装

```sh
pnpm add mioki-adapter-icqq
```

## 配置

在项目 `package.json` 的 `mioki.adapters` 中配置：

```json
{
  "mioki": {
    "adapters": {
      "icqq": {
        "instances": [
          {
            "uin": 10086,
            "password": "password",
            "ver": "9.2.90",
            "sign_api_addr": "http://127.0.0.1:8080/sign?key=114514",
            "config": {
              "data_dir": "./data/icqq"
            }
          }
        ]
      }
    }
  }
}
```

- `password` 可以省略，省略时由 icqq 走扫码登录流程（二维码会保存到系统临时目录并打印路径）。
- `ver` 和 `sign_api_addr` 是适配器提供的快捷配置，也可以放在 `config` 中。
- `ignore_self`：是否忽略自己账号发送的消息，默认 `true`（不会收到自己发的消息事件，避免插件重复处理）；如需要监听自己发出的消息可设为 `false`。
- qsign 地址必须指向 `/sign`，并带上与 qsign 配置一致的 `key`。

## 登录验证

- 滑块验证：打开日志中的链接完成滑块，将跳转 URL 中的 `ticket` 参数填入本地验证页面提交（若 URL 同时含 `randstr`，则用英文逗号拼接为 `ticket,randstr`）。
- 设备锁：适配器会自动发送短信验证码，将收到的验证码填入本地验证页面提交。
- 扫码登录：二维码图片保存在系统临时目录（`/tmp/mioki-icqq-qrcode-*.png`），用 QQ 扫描即可。

## 事件路由

事件路由与 OneBot v11 适配器一致，同时支持平台作用域与语义路由：

- 语义路由：`message.group`、`message`、`notice` 等，跨平台插件可直接监听。
- 平台路由：`icqq:message.group`、`icqq:message` 等。

## 许可证

MPL-2.0 许可证
