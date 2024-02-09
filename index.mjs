import fs from "fs"
import { App } from "uWebSockets.js"
import { Wsapix } from "wsapix"
import { Type } from "@sinclair/typebox"
import Ajv from "ajv"

const port = Number(process.env.PORT || 3000)
const server = App()

server.listen(port, () => {
	console.log(`Server listen port ${port}`)
})

const ajv = new Ajv({ strict: false })

const validator = (schema, data, error) => {  
  const valid = ajv.validate(schema, data)
  if (!valid) {    
    console.log("not valid", ajv.errors)
    error(ajv.errors.map(({ message }) => message).join(",\n"))
	}
	return valid
}

const wsx = Wsapix.uWS({ server }, { validator })

wsx.use((client) => {    
    if (!client.query) {
      // если имя не указано, прерываем подключение
      return client.terminate(4000)
    }
    // сохраняем имя и генерируем id
    client.state = { connectionId: 'connectionId:'+Math.random(), sessionId: client.query } 
  })

  const userMessageSchema = {
    $id: "user:message",
    description: "New user message",
    payload: Type.Strict(Type.Object({
      type: Type.String({ const: "user:message", description: "Message type" }),
      text: Type.String({ description: "Message text" })
    }, { $id: "user:message" }))
  }
  
  wsx.clientMessage({ type: "user:message" }, userMessageSchema, (client, data) => {
    console.log("wsx.clientMessage", data)
    wsx.clients.forEach((c) => {
      // if (c === client) { return }
      c.send({ 
        type: "chat:message",
        sessionId: client.state.sessionId,
        text: data.text
      })
    })
  })


  const chatMessageSchema = {
    $id: "chat:message",
    description: "New message in chat",
    payload: Type.Strict(Type.Object({
      type: Type.String({ const: "chat:message", description: "Message type" }),
      sessionId: Type.String({ description: "User Id" }),
      text: Type.String({ description: "Message text" })
    }, { $id: "chat:message" }))
  }
  
  const SessionSchema = {
      sessionId: Type.String({ description: "Session id" }),
      connectionId: Type.String({ description: "Connection id" }),
  }

  wsx.serverMessage({ type: "chat:message" }, chatMessageSchema)
  
  // User connect message schema
  const userConnectedSchema = {
    $id: "user:connected",
    description: "User online status update",
    payload: Type.Strict(Type.Object({
      type: Type.String({ const: "user:connected", description: "Message type" }),
      ...SessionSchema
    }, { $id: "user:connected" }))
  }
  
  
  wsx.serverMessage({ type: "user:connected" }, userConnectedSchema)
  
  // User disconnect message schema
  const userDisconnectedSchema = {
    $id: "user:disconnected",
    description: "User online status update",
    payload: Type.Strict(Type.Object({
      type: Type.String({ const: "user:disconnected", description: "Message type" }),
      ...SessionSchema
    }, { $id: "user:disconnected" }))
  }
  
  wsx.serverMessage({ type: "user:disconnected" }, userDisconnectedSchema) 



  // Handle connect event
wsx.on("connect", (client) => {
    console.log("connect")
    wsx.clients.forEach((c) => {
      if (c === client) { return } 
      c.send({ type: "user:connected", ...client.state })
      client.send({ type: "user:connected", ...c.state })
    })
  })
  
  // Handle disconnect event
  wsx.on("disconnect", (client) => {
    console.log("disconnect")
    wsx.clients.forEach((c) => {
      if (c === client) { return }
      c.send({ type: "user:disconnected", ...client.state })
    })
  })

  server.get("/docs", (res) => {
    res.writeHeader('Content-Type', 'text/html')
    res.end(wsx.htmlDocTemplate("/docs/json"))
  })

  server.get("/", (res) => {
    res.writeHeader('Content-Type', 'text/html')    
    res.end(fs.readFileSync("index.html"))
  })
  
  server.get("/docs/json", (res) => {
    res.writeHeader('Content-Type', 'application/json')
    res.end(wsx.asyncapi({
      info: {
        version: "1.0.0",
        title: "Chat websocket API"
      }
    }))
  })