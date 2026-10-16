import { describe, expect, test } from "bun:test"
import { createHmac } from "node:crypto"
import { stat } from "node:fs/promises"
import { WhatsApp, WhatsAppState, WhatsAppStore, listenWhatsApp, eligibleWhatsAppPhone, verifyWhatsAppSignature, whatsAppWebhook } from "../../src/remote/whatsapp"
import { RemoteController, type Permission } from "../../src/remote/controller"
import { readRemotePresence } from "@opencode-ai/core/olivecode/remote-status"
import { tmpdir } from "../fixture/fixture"

const state = () => WhatsAppState.parse({ token: "token-not-for-models-123456789", appSecret: "app-secret-for-fixture-1234", verifyToken: "verify-secret-for-fixture-1234", phoneID: "123456789012345", owner: "421900123456", apiVersion: "v26.0" })
const message = (id = "wamid.fixture", from = "421900123456") => ({ id, from, timestamp: String(Math.floor(Date.now()/1000)), type: "text", text: { body: "Create hello.txt" } })
function event(messages: unknown[], phoneID = "123456789012345") { return { object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: phoneID }, messages } }] }] } }
function signed(payload: unknown, secret = state().appSecret) {
  const body = JSON.stringify(payload)
  return new Request("http://127.0.0.1/webhook", { method: "POST", body, headers: { "x-hub-signature-256": "sha256="+createHmac("sha256",secret).update(body).digest("hex") } })
}
async function until(check: () => boolean) { for(let n=0;n<100&&!check();n++) await Bun.sleep(5); expect(check()).toBe(true) }

describe("WhatsApp official remote", () => {
  test("validates regional phone scope, metadata and secrets", () => {
    for(const number of ["421900123456","352123456789","3541234567","3851234567","3861234567","3721234567","5511999999999"]) expect(eligibleWhatsAppPhone(number)).toBe(true)
    for(const number of ["15551234567","447700900123","3501234567","3551234567","+421900123456","421oops"]) expect(eligibleWhatsAppPhone(number)).toBe(false)
    expect(()=>WhatsAppState.parse({...state(),phoneID:"../messages"})).toThrow()
    expect(()=>WhatsAppState.parse({...state(),apiVersion:"v26.0/anything"})).toThrow()
  })
  test("requires raw-body HMAC and separate exact GET verification", async () => {
    const config=state(); const body=Buffer.from("body")
    const signature="sha256="+createHmac("sha256",config.appSecret).update(body).digest("hex")
    expect(verifyWhatsAppSignature(body,signature,config.appSecret)).toBe(true)
    expect(verifyWhatsAppSignature(Buffer.from("changed"),signature,config.appSecret)).toBe(false)
    expect(verifyWhatsAppSignature(body,null,config.appSecret)).toBe(false)
    let calls=0
    const webhook=whatsAppWebhook(config,async()=>{},async()=>{calls++})
    expect((await webhook(signed(event([message()]),"wrong-secret"))).status).toBe(403)
    expect((await webhook(new Request("http://local/webhook?hub.mode=subscribe&hub.challenge=123&hub.verify_token=wrong"))).status).toBe(403)
    expect(await (await webhook(new Request("http://local/webhook?hub.mode=subscribe&hub.challenge=123&hub.verify_token="+config.verifyToken))).text()).toBe("123")
    expect(calls).toBe(0)
  })
  test("persists receipts before execution, rejects replay and ignores other senders/events", async () => {
    const config=state(); const log: string[]=[]
    const webhook=whatsAppWebhook(config,async()=>{log.push("save")},async(update)=>{log.push(update.message?.text ?? "unknown")},Math.floor(Date.now()/1000)-1)
    const payload=event([message()])
    expect((await webhook(signed(payload))).status).toBe(200)
    await webhook(signed(payload))
    const restart=whatsAppWebhook(config,async()=>{log.push("save")},async()=>{log.push("replay")},Math.floor(Date.now()/1000)-1)
    await restart(signed(payload))
    await webhook(signed(event([message("other","421999999999") ])))
    await webhook(signed(event([{...message("old"),timestamp:String(Math.floor(Date.now()/1000)-500)}])))
    await webhook(signed(event([{...message("forwarded"),context:{forwarded:true}}])))
    await webhook(signed(event([message("wrong-business")],"99999999")))
    expect(log).toEqual(["save","Create hello.txt"])
  })
  test("relays task-bound 90-minute approval through signed interactive reply", async () => {
    const config=state()
    const outgoing: { interactive?: { action?: { buttons?: { reply: { id: string } }[] } } }[]=[]
    const messenger=new WhatsApp(config, (async(url,init)=>{
      expect(String(url)).toBe("https://graph.facebook.com/v26.0/123456789012345/messages")
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer "+config.token)
      outgoing.push(JSON.parse(String(init?.body)))
      return Response.json({messages:[{id:"sent"}]})
    }))
    const approved: [string,boolean][]=[]
    let release: () => void = ()=>{}
    const gate=new Promise<void>(resolve=>{release=resolve})
    const permission: Permission={id:"perm-test",permission:"desktop",patterns:["task:activate"],metadata:{action:"activate",app:"com.apple.TextEdit"}}
    const controller=new RemoteController({token:config.token,owner:{user:Number(config.owner),chat:Number(config.owner)}},messenger,{create:async()=>({id:"task",run:async(_text,_signal,hooks)=>{
      await hooks.permission(permission);await gate
      await hooks.permission({...permission,id:"perm-auto"})
      return "Verified exact text."
    },approve:async(id,allow)=>{approved.push([id,allow]);release()},stop:async()=>{release()}})},async()=>{},["visible"],false,Date.now,"visible","WhatsApp")
    const webhook=whatsAppWebhook(config,async()=>{},update=>controller.handle(update),Math.floor(Date.now()/1000)-1)
    await webhook(signed(event([message("task")])))
    await until(()=>outgoing.some(item=>item.interactive?.action?.buttons?.some(button=>button.reply.id.startsWith("allow90:"))))
    const approval=outgoing.flatMap(item=>item.interactive?.action?.buttons??[]).find(button=>button.reply.id.startsWith("allow90:"))!
    const done=controller.done
    await webhook(signed(event([{...message("grant"),type:"interactive",interactive:{button_reply:{id:approval.reply.id}}}])))
    await done
    expect(approved).toEqual([["perm-test",true],["perm-auto",true]])
    expect(JSON.stringify(outgoing)).toContain("Verified exact text.")
    expect(JSON.stringify(outgoing)).not.toContain(config.token)
    await controller.stop()
  })
  test("refuses out-of-window sends, unpaired recipients and oversized requests", async () => {
    let calls=0
    const messenger=new WhatsApp(state(),(async()=>{calls++;return Response.json({})}))
    await expect(messenger.send(Number(state().owner),"hello")).rejects.toThrow("window closed")
    await expect(messenger.send(999,"hello")).rejects.toThrow("Unpaired")
    const webhook=whatsAppWebhook(state(),async()=>{},async()=>{})
    expect((await webhook(new Request("http://local/webhook",{method:"POST",body:"x".repeat(65537)}))).status).toBe(413)
    expect(calls).toBe(0)
  })
  test("stores credentials privately and restores replay protection", async () => {
    await using tmp=await tmpdir()
    const store=new WhatsAppStore(tmp.path)
    const value=state();value.seen=[{id:"seen-before-restart",time:Date.now()}]
    await store.save(value)
    expect((await store.load())?.seen).toEqual(value.seen)
    if(process.platform!=="win32") expect((await stat(tmp.path+"/whatsapp.json")).mode&0o777).toBe(0o600)
    await store.disconnect();expect(await store.load()).toBeUndefined()
  })
})

test("real local WhatsApp listener validates webhook and releases lock/presence on Stop", async () => {
  await using tmp=await tmpdir()
  const store=new WhatsAppStore(tmp.path)
  await store.save(state())
  const abort=new AbortController()
  let endpoint=""
  const running=listenWhatsApp(store,{create:async()=>{throw Error("No task should be admitted")}},abort.signal,{modes:["coding"],mode:"coding",port:0,presenceDirectory:tmp.path,log:message=>{endpoint=/http:\/\/127\.0\.0\.1:\d+\/webhook/.exec(message)?.[0]??endpoint}})
  try {
    await until(()=>!!endpoint)
    const response=await fetch(endpoint+"?hub.mode=subscribe&hub.challenge=4321&hub.verify_token="+state().verifyToken)
    expect(await response.text()).toBe("4321")
    expect((await fetch(endpoint,{method:"POST",body:"{}"})).status).toBe(403)
    expect((await readRemotePresence(tmp.path))?.channel).toBe("whatsapp")
    expect((await readRemotePresence(tmp.path))?.paired).toBe(false)
  } finally {abort.abort();await running}
  expect(await readRemotePresence(tmp.path)).toBeUndefined()
  const release=await store.lock();await release()
},15000)
