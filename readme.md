# mioki

A simple NapCat OneBot v11 framework.

## Steps to Use mioki

### 1. Deploy a NapCat Instance

```bash
docker run -d \
  -e NAPCAT_GID=$(id -g) \
  -e NAPCAT_UID=$(id -u) \
  -p 3333:3001 \
  -p 6099:6099 \
  --name napcat \
  --restart=always \
  mlikiowa/napcat-docker:latest
```

> PS: The image is 500+ MB, so it may take some time to download.

Visit http://localhost:6099， and navigate to "Network Settings" to add a new WebSocket server, using the `3001` port and `0.0.0.0` host. Make sure to enable it after adding.

![napcat-ws-config](./docs/napcat-ws-config.png)
