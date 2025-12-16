# mioki

A simple NapCat OneBot v11 framework.

## Steps to Use mioki

### 1. Deploy a NapCat Instance

```bash
docker run -d \
  -e NAPCAT_GID=$(id -g) \
  -e NAPCAT_UID=$(id -u) \
  -p 3333:3000 \
  --name napcat \
  --restart=always \
  mlikiowa/napcat-docker:latest
```

> PS: The image is 500+ MB, so it may take some time to download.
