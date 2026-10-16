import * as THREE from 'three'

// A small, local scene: the botanical artwork supplies the grove, while real
// lit geometry supplies the leaves in front of it. No remote models or trackers.
export function mountGrove() {
  const canvas = document.querySelector('#grove-canvas')
  const stage = document.querySelector('.grove-stage')
  const art = document.querySelector('.grove-trees')
  const reduce = matchMedia('(prefers-reduced-motion: reduce)')
  const light = matchMedia('(prefers-color-scheme: light)')
  const forced = matchMedia('(forced-colors: active)')
  if (!canvas || forced.matches) return
  let renderer
  try { renderer = new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'}) }
  catch { stage.dataset.motion = 'unavailable'; return }
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5))
  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-8,8,5,-5,.1,50)
  camera.position.set(0,0,15)
  scene.add(new THREE.HemisphereLight(0xf3f0dc,0x353e32,2.3))
  const sun = new THREE.DirectionalLight(0xffefd4,3)
  sun.position.set(-4,5,8)
  scene.add(sun)

  const shape = new THREE.Shape()
  shape.moveTo(0,-.5)
  shape.bezierCurveTo(-.21,-.16,-.16,.25,0,.5)
  shape.bezierCurveTo(.17,.2,.19,-.17,0,-.5)
  const geometry = new THREE.ShapeGeometry(shape)
  const material = new THREE.MeshStandardMaterial({color:0x9ca779,roughness:.85,metalness:0,side:THREE.DoubleSide})
  const leaves = new THREE.InstancedMesh(geometry,material,28)
  leaves.frustumCulled = false
  leaves.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  scene.add(leaves)
  const object = new THREE.Object3D()
  // Deterministic scattering makes the composition stable across page loads.
  let seed = 71
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
  const particles = Array.from({length:28},(_,i)=>({
    side:i%2 ? 1 : -1, x:.78+random()*.21, y:random()*12-6,
    z:random()*4, speed:.12+random()*.14, phase:random()*Math.PI*2,
    size:.12+random()*.16, tilt:random()*3,
  }))
  particles.forEach((p,i)=>leaves.setColorAt(i,new THREE.Color().setHSL(.19+random()*.09,.17+random()*.15,.38+random()*.23)))
  let halfWidth = 8, time = 0, previous = 0, raf = 0, visible = true, disposed = false
  let pointerX = 0, pointerY = 0, currentX = 0, currentY = 0
  const render = () => {
    particles.forEach((p,i)=>{
      const y = ((p.y-time*p.speed+6)%12+12)%12-6
      object.position.set(p.side*halfWidth*p.x+Math.sin(time*.3+p.phase)*.3+currentX*.18,y,p.z)
      object.rotation.set(Math.sin(time*.6+p.phase)*.8,p.tilt+time*.18,p.phase+Math.sin(time*.35+p.phase)*.6)
      object.scale.setScalar(p.size)
      object.updateMatrix()
      leaves.setMatrixAt(i,object.matrix)
    })
    leaves.instanceMatrix.needsUpdate = true
    renderer.render(scene,camera)
    art.style.transform = `translate3d(${currentX*9}px,${currentY*5}px,0) scale(1.025)`
  }
  const running = () => !disposed && !reduce.matches && !forced.matches && visible && !document.hidden
  const tick = now => {
    raf = 0
    if (!running()) { sync(); return }
    const interval = stage.clientWidth < 640 ? 50 : 33
    if (now-previous >= interval) {
      const delta = previous ? Math.min((now-previous)/1000,.1) : 0
      time += delta
      previous = now
      currentX += (pointerX-currentX)*.04
      currentY += (pointerY-currentY)*.04
      render()
    }
    raf = requestAnimationFrame(tick)
  }
  const sync = () => {
    if (disposed) return
    cancelAnimationFrame(raf); raf = 0; previous = 0
    stage.dataset.motion = reduce.matches ? 'reduced' : running() ? 'running' : 'suspended'
    if (reduce.matches) { currentX=0; currentY=0; render() }
    if (running()) raf = requestAnimationFrame(tick)
  }
  const resize = () => {
    const bounds = canvas.parentElement.getBoundingClientRect()
    halfWidth = bounds.width / Math.max(bounds.height,1) * 5
    camera.left = -halfWidth; camera.right = halfWidth
    camera.updateProjectionMatrix()
    renderer.setSize(bounds.width,Math.max(bounds.height,1),false)
    render()
  }
  const onPointer = e => {
    if (!running() || e.pointerType === 'touch') return
    const bounds = stage.getBoundingClientRect()
    pointerX = (e.clientX-bounds.left)/bounds.width*2-1
    pointerY = (e.clientY-bounds.top)/bounds.height*2-1
  }
  const onLeave = () => {pointerX=0;pointerY=0}
  const onTheme = () => {sun.intensity=light.matches ? 2.1 : 3;render()}
  const observer = new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync()},{threshold:0})
  const sizeObserver = new ResizeObserver(resize)
  const dispose = () => {
    if (disposed) return
    disposed=true; cancelAnimationFrame(raf)
    observer.disconnect(); sizeObserver.disconnect()
    stage.removeEventListener('pointermove',onPointer)
    stage.removeEventListener('pointerleave',onLeave)
    document.removeEventListener('visibilitychange',sync)
    reduce.removeEventListener('change',sync);forced.removeEventListener('change',sync);light.removeEventListener('change',onTheme)
    window.removeEventListener('pagehide',onPageHide)
    geometry.dispose();material.dispose();leaves.dispose();renderer.dispose()
  }
  const onPageHide = e => {if (!e.persisted) dispose()}
  canvas.addEventListener('webglcontextlost',e=>{
    e.preventDefault();dispose();canvas.hidden=true
    stage.dataset.motion='unavailable';art.style.transform='none'
  },{once:true})
  stage.addEventListener('pointermove',onPointer,{passive:true})
  stage.addEventListener('pointerleave',onLeave)
  document.addEventListener('visibilitychange',sync)
  reduce.addEventListener('change',sync);forced.addEventListener('change',sync);light.addEventListener('change',onTheme)
  window.addEventListener('pagehide',onPageHide)
  observer.observe(stage);sizeObserver.observe(stage)
  resize();onTheme();sync()
}
