import { expect, test } from "bun:test"
import { mkdtemp, mkdir, chmod, rm, readFile, realpath } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

const installer = path.resolve(import.meta.dir,"../install.sh")
for (const [system,arch,libc,target,profile] of [
  ["Darwin","arm64","glibc","macOS-arm64",".zshrc"],
  ["Darwin","x86_64","glibc","macOS-x64",".bash_profile"],
  ["Linux","x86_64","glibc","Linux-x64",".bashrc"],
  ["Linux","aarch64","glibc","Linux-arm64",".bashrc"],
  ["Linux","x86_64","musl","Linux-x64-musl",".bashrc"],
  ["Linux","aarch64","musl","Linux-arm64-musl",".bashrc"],
]) test(`installer selects ${target}, preserves cwd and updates PATH idempotently`,async()=>{
  const root=await mkdtemp(path.join(tmpdir(),"olivecode installer "))
  try {
    const tools=path.join(root,"tools");await mkdir(tools)
    const unpacked=path.join(root,"payload");await mkdir(unpacked)
    await Bun.write(path.join(tools,"uname"),`#!/bin/sh\ncase "$1" in -s) echo ${system};; -m) echo ${arch};; esac\n`)
    await Bun.write(path.join(tools,"sw_vers"),'#!/bin/sh\necho 13.0\n')
    await Bun.write(path.join(tools,"sysctl"),'#!/bin/sh\nexit 1\n')
    await Bun.write(path.join(tools,"ldd"),`#!/bin/sh\necho ${libc}\n`)
    const binary=path.join(unpacked,"olivecode")
    await Bun.write(binary,'#!/bin/sh\nif [ "$1" = --version ]; then echo 0.1.0-test; else pwd; fi\n')
    for(const file of [binary,path.join(tools,"uname"),path.join(tools,"ldd"),path.join(tools,"sw_vers"),path.join(tools,"sysctl")]) await chmod(file,0o755)
    const archive=path.join(root,`OliveCode-${target}.zip`)
    const zip=Bun.spawn(["zip","-q",archive,"olivecode"],{cwd:unpacked});expect(await zip.exited).toBe(0)
    const checksum=archive+".sha256"
    await Bun.write(checksum,new Bun.CryptoHasher("sha256").update(await Bun.file(archive).arrayBuffer()).digest("hex")+"  archive\n")
    const home=path.join(root,"user home")
    const env={...process.env,PATH:tools+":"+process.env.PATH,HOME:home,OLIVECODE_INSTALL_HOME:home,SHELL:system==="Darwin"&&arch==="arm64"?"/bin/zsh":"/bin/bash",OLIVECODE_ARCHIVE_PATH:archive,OLIVECODE_SHA256_PATH:checksum}
    for(let n=0;n<2;n++) {
      const child=Bun.spawn(["sh",installer],{env,stdout:"pipe",stderr:"pipe"})
      const output=await new Response(child.stdout).text()+await new Response(child.stderr).text()
      expect(await child.exited).toBe(0)
      expect(output).toContain("Installed OliveCode 0.1.0-test")
    }
    expect((await readFile(path.join(home,profile),"utf8")).match(/# OliveCode/g)).toHaveLength(1)
    const child=Bun.spawn([path.join(home,".local/bin/olivecode")],{cwd:unpacked,stdout:"pipe"})
    expect((await new Response(child.stdout).text()).trim()).toBe(await realpath(unpacked))
    expect(await child.exited).toBe(0)
    await Bun.write(checksum,"0".repeat(64))
    const failed=Bun.spawn(["sh",installer],{env,stdout:"ignore",stderr:"pipe"})
    expect(await failed.exited).not.toBe(0)
    expect(await new Response(failed.stderr).text()).toContain("Nothing was installed")
    expect((await Bun.file(path.join(home,".local/bin/olivecode")).text())).toContain("0.1.0-test")
    // A valid checksum must not permit rewriting an already installed version.
    await Bun.write(binary,'#!/bin/sh\nif [ "$1" = --version ]; then echo 0.1.0-test; else echo changed; fi\n')
    const changed=Bun.spawn(["zip","-q",archive,"olivecode"],{cwd:unpacked});expect(await changed.exited).toBe(0)
    await Bun.write(checksum,new Bun.CryptoHasher("sha256").update(await Bun.file(archive).arrayBuffer()).digest("hex")+"  archive\n")
    const collision=Bun.spawn(["sh",installer],{env,stdout:"ignore",stderr:"pipe"})
    expect(await collision.exited).not.toBe(0)
    expect(await new Response(collision.stderr).text()).toContain("already exists with different contents")
    expect(await Bun.file(path.join(home,".local/bin/olivecode")).text()).not.toContain("echo changed")
  } finally {await rm(root,{recursive:true,force:true})}
},30000)
