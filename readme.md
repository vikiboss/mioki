# mioki

A simple NapCat OneBot v11 framework.

<img src="./docs//demo.png" title="demo" alt="demo" style="width: 360px; max-width: 360px; border-radius: 4px; border: none;" />

> [!CAUTION]
> This project is still under active development. Use it at your own risk.

This repo contains two packages:

- [packages/mioki](./packages/mioki): A simple framework to build NapCat bots with ease.
- [packages/napcat-sdk](./packages/napcat-sdk): A TypeScript SDK to interact with NapCat.


## Prerequisites

you should have [Node.js](https://nodejs.org/) (v18+) and [Docker](https://www.docker.com/) installed on your machine.

It forwards port 3001 to 3333, mioki use `3333` as default port to connect NapCat WebSocket server.

Run NapCat with Docker:

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

Visit http://localhost:6099, and navigate to "Network Settings" to add a new WebSocket server, using the `3001` port and `0.0.0.0` host in docker. Make sure to enable it after adding. Keep the token you set here, you'll need it to connect mioki to NapCat.

<img src="./docs/napcat-ws-config.png" title="napcat-websocket" alt="napcat-websocket" style="width: 300px; max-width: 300px; border-radius: 4px; border: none;" />

## Usage of mioki

### 1. Create a mioki Project

```bash
mkdir bot && cd bot
npm init -y && npm install mioki
echo "import('mioki').then(({ start }) => start())" > app.ts
```

### 2. Configure mioki

Update `package.json` to add `mioki` field to configure mioki options.

```json
{
  "mioki": {
    "owners": [114514],
    "admins": [],
    "plugins": [],
    "log_level": "info",
    "online_push": true,
    "napcat": {
      "protocol": "ws",
      "host": "localhost",
      "port": 3333,
      "token": "your-napcat-token",
    }
  }
}
```

### 3. Run the Bot

```bash
# or `bun app.ts`, `tsx app.ts`, etc.
node app.ts 
```

## Usage of NapCat SDK for TypeScript

If you want to use NapCat SDK directly in your TypeScript projects, you can follow the instructions below.

### Getting Started

The NapCat SDK for TypeScript allows developers to easily integrate NapCat's functionalities into their TypeScript applications. This SDK provides a set of tools and utilities to interact with NapCat services seamlessly.

### Installation

You can install the NapCat SDK via npm. Run the following command in your terminal:

```bash
pnpm install napcat-sdk
```

### Quick Start

To connect to NapCat, you need to create an instance of the NapCat client. Here's a simple example:

```typescript
import { NapCat, segment } from 'napcat-sdk'

// 1. Create a new NapCat client instance
const napcat = new NapCat({
  // protocol: 'ws', // Optional: specify the protocol (default is 'ws')
  // host: 'localhost', // Optional: specify a custom host
  // port: 3333, // Optional: specify a custom port
  token: 'here-your-auth-token', // Required: your authentication token
})

// 2. Subscribe to events
napcat.on('message', (event) => {
  // replay is a method to send a message quickly, optional with reply mark
  event.reply('Hello from NapCat SDK!', true) // true is for reply mark

  // you can call all the NapCat api through `napcat.api()` method
  const { value } = await napcat.api<{ value: unknown }>('awesome-function')
})

// you can also listen to specific message sub-types
napcat.on('message.group', async (event) => {
  // some methods of a message event are available
  await event.addEssence(event.message_id)
  await event.recall()

  // You can also interact with group instance to do some operations
  await event.group.setTitle(114514, 'Special Title')

  // message to send is allowed to be an array of segments
  await event.reply(['Hi! ', napcat.segment.face(66)])

  // or just use napcat to send messages
  await napcat.sendGroupMsg(event.group_id, 'Hello Group!')
})

// and more events...
napcat.on('notice', (event) => {})
napcat.on('notice.group', (event) => {})
napcat.on('request', (event) => {})
napcat.on('request.group.invite', (event) => {
  // approve the group invite request, or event.reject() to reject
  event.approve() 
})

// close the connection when needed
napcat.close() 
```

## License

MIT License © 2025-PRESENT Viki
