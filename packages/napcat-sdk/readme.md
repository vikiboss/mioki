# NapCat SDK for TypeScript

> More details see [GitHub](https://github.com/vikiboss/mioki)

## Getting Started

The NapCat SDK for TypeScript allows developers to easily integrate NapCat's functionalities into their TypeScript applications. This SDK provides a set of tools and utilities to interact with NapCat services seamlessly.

## Installation

You can install the NapCat SDK via npm. Run the following command in your terminal:

```bash
pnpm install napcat-sdk
```

## Quick Start

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
